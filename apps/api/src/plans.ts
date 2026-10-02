// Writes plans to the database. All rule checking is done by the engine (packages/shared).
import { schedulePlan, suggestPlan, type Deferral as EDeferral, type Trip as ETrip } from '@waypoint/shared';
import { prisma } from './db.ts';
import { dbDate, shortDate } from './reference.ts';
import { loadDay, toPlanDto, unassignedOrders, type Day } from './day.ts';
import { alertDispatcher, emit, notifyStore } from './events.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

async function ensurePlan(day: Day) {
  if (day.plan) return day.plan.id;
  const p = await prisma.plan.create({ data: { date: dbDate(day.date), depot: day.depot } });
  return p.id;
}

/**
 * Replaces the plan's trips. Stop order and ETAs come from engine/schedule.ts.
 * Orders on a trip become `planned`; their draft deferral (if any) is removed.
 * Orders taken off every trip and not deferred go back to `locked` (the board's Unassigned column).
 */
export async function writeTrips(day: Day, trips: ETrip[], knownPlanId?: string) {
  const planId = knownPlanId ?? (await ensurePlan(day));
  const sched = schedulePlan(trips, day.ctx);
  const live = trips.filter((x) => x.orders.length > 0);
  const onTrip = new Set(live.flatMap((t) => t.orders.map((o) => o.ref)));
  await prisma.$transaction(async (tx) => {
    // Trips are updated in place (vehicle + trip number), so loading progress, bay and seal survive an edit.
    const existing = await tx.trip.findMany({ where: { planId } });
    const keep = new Map<string, string>();
    for (const t of live) {
      const s = sched.get(`${t.vehicleId}|${t.tripNo}`)!;
      const row = existing.find((e) => e.vehicleId === t.vehicleId && e.tripNo === t.tripNo);
      const data = { brand: t.brand, district: t.district, departAt: s.departAt, minutes: s.minutes };
      const id = row ? (await tx.trip.update({ where: { id: row.id }, data })).id : (await tx.trip.create({ data: { planId, vehicleId: t.vehicleId, tripNo: t.tripNo, ...data } })).id;
      keep.set(`${t.vehicleId}|${t.tripNo}`, id);
    }
    // Stops: a stop that moves keeps its delivery status; orders taken off every trip lose their stop.
    await tx.tripStop.deleteMany({ where: { trip: { planId }, orderId: { notIn: [...onTrip] } } });
    for (const t of live) {
      const s = sched.get(`${t.vehicleId}|${t.tripNo}`)!;
      const tripId = keep.get(`${t.vehicleId}|${t.tripNo}`)!;
      for (const x of s.stops) {
        await tx.tripStop.upsert({
          where: { orderId: x.ref },
          update: { tripId, seq: x.seq, plannedArrival: x.eta },
          create: { tripId, orderId: x.ref, seq: x.seq, plannedArrival: x.eta },
        });
      }
    }
    await tx.trip.deleteMany({ where: { planId, id: { notIn: [...keep.values()] } } });
    await tx.deferral.deleteMany({ where: { planId, orderId: { in: [...onTrip] } } });
    await tx.order.updateMany({ where: { id: { in: [...onTrip] }, status: { in: ['locked', 'placed', 'deferred'] } }, data: { status: 'planned' } });
    const deferred = new Set((await tx.deferral.findMany({ where: { planId }, select: { orderId: true } })).map((d) => d.orderId));
    const back = day.orders.filter((o) => !onTrip.has(o.id) && !deferred.has(o.id) && (o.status === 'planned' || o.status === 'deferred')).map((o) => o.id);
    if (back.length) await tx.order.updateMany({ where: { id: { in: back } }, data: { status: 'locked' } });
    // An edited published plan goes back to draft until it is re-published.
    await tx.plan.update({ where: { id: planId }, data: { status: 'draft' } });
  });
  return planId;
}

/** Suggest plan: the engine allocates every order; anything it can't place is deferred as unavoidable. */
export async function suggest(day: Day) {
  const locked = day.plan?.trips.filter((t) => t.sealedAt || t.departedAt) ?? [];
  if (locked.length) throw new HttpError(409, `${locked.length} trip(s) are already sealed or on the road, so the plan can't be rebuilt from scratch. Adjust it on the board instead.`);
  const orders = [...day.engineOrders.values()].filter((o) => {
    const row = day.orders.find((r) => r.id === o.ref)!;
    return ['placed', 'locked', 'planned', 'deferred'].includes(row.status);
  });
  const plan = suggestPlan(orders, day.engineVehicles, day.ctx);
  const planId = await ensurePlan(day);
  await prisma.deferral.deleteMany({ where: { planId } });
  await writeTrips(day, plan.trips, planId);
  await writeDeferrals(day, planId, plan.deferred);
  return { planId, served: plan.trips.reduce((s, t) => s + t.orders.length, 0), deferred: plan.deferred.length };
}

async function writeDeferrals(day: Day, planId: string, deferred: EDeferral[]) {
  for (const d of deferred) {
    await prisma.deferral.create({
      data: { orderId: d.order.ref, planId, reason: d.reason, type: d.type, detail: d.detail, newDate: dbDate(day.nextRun) },
    });
  }
  if (deferred.length) await prisma.order.updateMany({ where: { id: { in: deferred.map((d) => d.order.ref) } }, data: { status: 'deferred' } });
}

/** Dispatcher defers one order by hand (type `choice`, or `unavoidable` when no vehicle can take it). */
export async function deferOrder(
  day: Day, orderId: string, req: { reason: EDeferral['reason']; note?: string; confirmSecondDeferral?: boolean }, userId: string,
) {
  const order = day.orders.find((o) => o.id === orderId);
  if (!order) throw new HttpError(404, 'Order not found on this day');
  const second = day.skipped.has(order.outletId);
  if (second && !req.confirmSecondDeferral) {
    throw new HttpError(409, `${order.outletId} was skipped on the last run. Confirm a second deferral and say why.`, { code: 'SECOND_DEFERRAL' });
  }
  if (second && !req.note?.trim()) throw new HttpError(400, 'A second deferral needs a note for the store manager.');
  const onTrip = day.plan?.trips.find((t) => t.stops.some((x) => x.orderId === orderId));
  if (onTrip && (onTrip.sealedAt || onTrip.departedAt)) throw new HttpError(409, `${order.outletId} is already on ${onTrip.vehicleId}, which is ${onTrip.departedAt ? 'on the road' : 'sealed'}.`);
  const planId = await ensurePlan(day);
  // Take it off its trip first.
  const trips = (day.plan ? day.plan.trips : []).map((t) => ({
    vehicleId: t.vehicleId, tripNo: t.tripNo as 1 | 2, brand: t.brand, district: t.district,
    orders: t.stops.filter((s) => s.orderId !== orderId).map((s) => day.engineOrders.get(s.orderId)!).filter(Boolean),
  }));
  const anyVehicle = day.engineVehicles.some((v) => v.available && v.depot === order.outlet.depot);
  await prisma.deferral.deleteMany({ where: { planId, orderId } });
  await prisma.deferral.create({
    data: {
      orderId, planId, reason: req.reason, type: anyVehicle ? 'choice' : 'unavoidable', note: req.note ?? null,
      detail: 'Deferred by the dispatcher', newDate: dbDate(day.nextRun), byUserId: userId, confirmedAt: second ? new Date() : null,
    },
  });
  await prisma.order.update({ where: { id: orderId }, data: { status: 'deferred' } });
  await writeTrips(await loadDay(day.date, day.depot), trips, planId);
  emit('order.deferred', `${order.outletId} deferred to ${shortDate(day.nextRun)}`, { orderId, outletId: order.outletId });
}

/** Publish: every order is on a trip or deferred, no rule is broken, second deferrals are confirmed. */
export async function publish(day: Day, byName = 'Dispatcher') {
  if (!day.plan) throw new HttpError(400, 'There is no plan for this day yet. Run Suggest plan first.');
  const dto = toPlanDto(day.plan, day);
  if (dto.violations.length) throw new HttpError(422, `${dto.violations.length} trip(s) break a rule. Fix them on the Planning Board.`, { violations: dto.violations });
  const loose = unassignedOrders(day);
  if (loose.length) throw new HttpError(422, `${loose.length} order(s) are neither on a trip nor deferred.`, { orderIds: loose.map((o) => o.id) });
  const unconfirmed = day.plan.deferrals.filter((d) => {
    const o = day.orders.find((x) => x.id === d.orderId);
    return o && day.skipped.has(o.outletId) && !d.confirmedAt;
  });
  if (unconfirmed.length) throw new HttpError(422, `${unconfirmed.length} second deferral(s) need your confirmation on the Deferrals screen.`, { deferralIds: unconfirmed.map((d) => d.id) });

  const version = day.plan.version + 1;
  await prisma.plan.update({ where: { id: day.plan.id }, data: { status: 'published', publishedAt: new Date(), version } });
  await prisma.planVersion.create({
    data: { planId: day.plan.id, version, byName, snapshot: day.plan.trips.map((t) => ({ vehicleId: t.vehicleId, tripNo: t.tripNo, orderIds: t.stops.map((x) => x.orderId) })) },
  });
  // Dock bays: in departure order, six bays; a vehicle keeps one bay for both trips.
  const bays = new Map<string, number>();
  for (const t of [...day.plan.trips].sort((a, b) => a.departAt.localeCompare(b.departAt) || a.vehicleId.localeCompare(b.vehicleId))) {
    const known = t.bay || bays.get(t.vehicleId) || (bays.size % 6) + 1;
    if (!bays.has(t.vehicleId)) bays.set(t.vehicleId, known);
    if (!t.bay) await prisma.trip.update({ where: { id: t.id }, data: { bay: bays.get(t.vehicleId)! } });
  }

  // Carry every deferred order to the next run, once, and tell the store.
  for (const d of day.plan.deferrals) {
    const o = day.orders.find((x) => x.id === d.orderId);
    if (!o) continue;
    const carryRef = `carry:${o.id}`;
    if (!(await prisma.order.findFirst({ where: { sourceRef: carryRef } }))) {
      const carried = await prisma.order.create({
        data: { outletId: o.outletId, deliveryDate: d.newDate, temp: o.temp, units: o.units, weightKg: o.weightKg, volumeM3: o.volumeM3, status: 'locked', placedAt: o.placedAt, sourceRef: carryRef, note: o.note },
      });
      await copyLines(o.id, carried.id);
      await notifyStore(o.outletId, 'order.deferred', `Delivery moved to ${shortDate(day.nextRun)}`,
        `Your ${o.outlet.brand} order (${o.units} units) will arrive on ${shortDate(day.nextRun)}. Reason: ${d.reason.replaceAll('_', ' ')}${d.note ? ` – ${d.note}` : ''}.`,
        { orderId: o.id, date: day.date });
    }
  }
  for (const t of day.plan.trips) {
    for (const s of t.stops) {
      const o = day.orders.find((x) => x.id === s.orderId);
      if (o) await notifyStore(o.outletId, 'plan.published', `Arriving ${shortDate(day.date)} around ${s.plannedArrival}`, `${t.vehicleId} · stop ${s.seq} of ${t.stops.length}`, { orderId: o.id, date: day.date });
    }
  }
  await alertDispatcher('info', `Plan v${version} published`, `${day.plan.trips.length} trips sent to loaders and drivers; ${day.plan.deferrals.length} stores told about deferrals.`, { date: day.date });
  emit('plan.published', `Plan v${version} for ${shortDate(day.date)} published`, { planId: day.plan.id, version: String(version) });
  return version;
}

/** Copies an order's goods lines to a new order (carried over to the next run), with loading state reset. */
export async function copyLines(fromOrderId: string, toOrderId: string, only?: { lineId: string; packs: number }[]) {
  const lines = await prisma.orderLine.findMany({ where: { orderId: fromOrderId }, orderBy: { seq: 'asc' } });
  const pick = only ? lines.filter((l) => only.some((x) => x.lineId === l.id)) : lines;
  await prisma.orderLine.createMany({
    data: pick.map((l, i) => {
      const packs = only?.find((x) => x.lineId === l.id)?.packs ?? l.packs;
      return { orderId: toOrderId, seq: i + 1, product: l.product, pack: l.pack, packSize: l.packSize, packs, ordered: only ? `${packs} ${l.pack} carried over` : l.ordered, weightKg: Math.round((l.weightKg * packs) / Math.max(1, l.packs) * 10) / 10 };
    }),
  });
}
