// Driver phone (M1–M8). The phone caches the route and queues every action; POST /sync applies the queue
// in order and is idempotent (each event carries a UUID), so a retry after a lost signal never double-counts.
import type { FastifyInstance } from 'fastify';
import { tripsLitres, type Depot } from '@waypoint/shared';
import { SyncRequest, type TDriverRouteResponse, type TSyncEvent, type TSyncResponse } from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { baseContext, clockOf, workingDay } from '../reference.ts';
import { HttpError } from '../plans.ts';
import { alertDispatcher, emit, notifyStore } from '../events.ts';
import { kindOf, opsPlan, refOf, unitLabelOf } from '../ops.ts';

const FAIL_LABEL: Record<string, string> = {
  shop_closed: 'store closed, no one to receive', refused: 'store refused the delivery', damaged_missing: 'goods damaged or missing',
  no_access: 'vehicle could not reach the outlet', other: 'other problem',
};

export async function driverRoutes(app: FastifyInstance) {
  const driver = { preHandler: requireRole('driver') };

  app.get('/driver/route', driver, async (req): Promise<TDriverRouteResponse> => {
    const vehicleId = req.user.vehicleId;
    if (!vehicleId) throw new HttpError(400, 'This driver account has no vehicle. Ask the dispatcher.');
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new HttpError(404, `Vehicle ${vehicleId} not found.`);
    const q = req.query as { date?: string };
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : workingDay();
    const plan = await opsPlan(date, vehicle.depot as Depot);
    const trips = (plan?.trips ?? []).filter((t) => t.vehicleId === vehicleId).sort((a, b) => a.tripNo - b.tripNo);
    const ctx = baseContext;
    const planL = tripsLitres(trips.map((t) => ({ vehicleId, tripNo: t.tripNo as 1 | 2, brand: t.brand, district: t.district, orders: t.stops.map((s) => ({ ref: s.orderId }) as never) })), vehicle.kmPerL, ctx);
    return {
      date, vehicleId, vehicleKind: kindOf(vehicle), depot: vehicle.depot as Depot, driverName: vehicle.driverName ?? req.user.name,
      published: !!plan, version: plan?.version ?? 0, publishedAt: plan?.publishedAt?.toISOString() ?? null,
      fuel: { usedL: Math.round(vehicle.fuelUsedWeekL), quotaL: vehicle.weeklyFuelQuotaL, planL: Math.round(planL) },
      serverTime: new Date().toISOString(),
      trips: trips.map((t) => {
        const travel = ctx.travel[t.district];
        const done = t.stops.length > 0 && t.stops.every((s) => s.status === 'delivered' || s.status === 'failed');
        return {
          tripId: t.id, tripNo: t.tripNo, brand: t.brand, district: t.district, temp: t.stops.some((s) => s.order.temp === 'chilled') ? 'chilled' : 'ambient',
          departAt: t.departAt, endAt: t.stops.at(-1)?.plannedArrival ?? t.departAt, weightKg: Math.round(t.stops.reduce((n, s) => n + s.order.weightKg, 0)), bay: t.bay || 1,
          status: done ? 'done' : t.departedAt ? 'departed' : t.sealedAt ? 'sealed' : t.loaderId ? 'loading' : 'to_load',
          loadedBy: t.loaderName, sealedAt: t.sealedAt?.toISOString() ?? null,
          loaderNotes: t.loadChecks.map((c) => {
            const s = t.stops.find((x) => x.orderId === c.orderId);
            return `${s ? refOf(s.order) : ''} · ${c.shortUnits} of ${s?.order.units ?? '?'} ${s ? unitLabelOf(s.order.outlet.brand) : ''} short for ${s?.order.outletId ?? ''}. ${c.byName ?? 'The loader'} flagged this at loading; the dispatcher and the store manager are already told.`;
          }),
          stops: t.stops.map((s, i) => ({
            stopId: s.id, seq: s.seq, orderId: s.orderId, orderRef: refOf(s.order),
            outlet: {
              id: s.order.outlet.id, brand: s.order.outlet.brand, district: s.order.outlet.district, depot: s.order.outlet.depot, dockType: s.order.outlet.dockType,
              parking: s.order.outlet.parking, mallWindow: s.order.outlet.mallWindow, windowOpen: s.order.outlet.windowOpen, windowClose: s.order.outlet.windowClose,
            },
            units: s.order.units, unitLabel: unitLabelOf(s.order.outlet.brand), temp: s.order.temp, weightKg: s.order.weightKg, volumeM3: s.order.volumeM3,
            plannedArrival: s.plannedArrival, status: s.status,
            shortUnits: s.order.lines.reduce((n, l) => n + l.shortPacks, 0),
            managerName: s.order.outlet.managerName, managerPhone: s.order.outlet.managerPhone, note: s.order.outlet.deliveryNote,
            legKm: travel ? (i === 0 ? travel.outboundKm : travel.interStopKm) : 0,
            legMin: travel ? (i === 0 ? travel.outboundMin : travel.interStopMin) : 0,
            arrivedAt: s.arrivedAt?.toISOString() ?? null, deliveredAt: s.deliveredAt?.toISOString() ?? null, deliveredUnits: s.deliveredUnits,
            failedReason: (s.failedReason as never) ?? null,
          })),
        };
      }),
    };
  });

  app.post('/sync', driver, async (req): Promise<TSyncResponse> => {
    const body = SyncRequest.parse(req.body);
    const out: TSyncResponse = { accepted: [], duplicates: [], rejected: [], routeVersion: 0 };
    // Apply in the order things happened on the phone.
    const events = [...body.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (const ev of events) {
      if (await prisma.deliveryEvent.findUnique({ where: { eventId: ev.eventId } })) { out.duplicates.push(ev.eventId); continue; }
      try {
        await apply(ev, body.deviceId, req.user);
        out.accepted.push(ev.eventId);
      } catch (e) {
        out.rejected.push({ eventId: ev.eventId, reason: e instanceof HttpError ? e.message : 'Could not apply this change.' });
        if (!(e instanceof HttpError)) app.log.error(e);
      }
    }
    const v = req.user.vehicleId ? await prisma.vehicle.findUnique({ where: { id: req.user.vehicleId } }) : null;
    if (v) out.routeVersion = (await opsPlan((req.query as { date?: string }).date ?? workingDay(), v.depot as Depot))?.version ?? 0;
    return out;
  });
}

type User = { id: string; name: string; vehicleId: string | null };

async function apply(ev: TSyncEvent, deviceId: string, user: User) {
  const at = new Date(ev.occurredAt);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, 'Bad time on this event.');

  if (ev.type === 'trip.departed') {
    const trip = await prisma.trip.findUnique({ where: { id: ev.tripId }, include: { stops: { orderBy: { seq: 'asc' } }, plan: true } });
    if (!trip || trip.vehicleId !== user.vehicleId) throw new HttpError(403, 'That trip is not on your vehicle.');
    const first = trip.stops[0];
    if (!first) throw new HttpError(400, 'That trip has no stops.');
    await prisma.deliveryEvent.create({ data: { eventId: ev.eventId, stopId: first.id, type: ev.type, occurredAt: at, deviceId } });
    if (!trip.departedAt) {
      await prisma.trip.update({ where: { id: trip.id }, data: { departedAt: at } });
      await prisma.order.updateMany({ where: { id: { in: trip.stops.map((s) => s.orderId) }, status: { in: ['planned', 'loaded'] } }, data: { status: 'out_for_delivery' } });
      await prisma.planAck.upsert({
        where: { planId_version_userId: { planId: trip.planId, version: trip.plan.version, userId: user.id } },
        update: {}, create: { planId: trip.planId, version: trip.plan.version, userId: user.id, userName: user.name, role: 'driver' },
      });
      emit('trip.departed', `${trip.vehicleId} trip ${trip.tripNo} left at ${clockOf(at)}`, { tripId: trip.id });
    }
    return;
  }

  const stop = await prisma.tripStop.findUnique({ where: { id: ev.stopId }, include: { trip: { include: { plan: true } }, order: { include: { outlet: true } } } });
  if (!stop || stop.trip.vehicleId !== user.vehicleId) throw new HttpError(403, 'That stop is not on your vehicle.');
  const o = stop.order;
  const date = stop.trip.plan.date.toISOString().slice(0, 10);
  const base = { eventId: ev.eventId, stopId: stop.id, type: ev.type, occurredAt: at, deviceId };

  if (ev.type === 'stop.arrived') {
    await prisma.deliveryEvent.create({ data: base });
    if (stop.status === 'pending') await prisma.tripStop.update({ where: { id: stop.id }, data: { status: 'arrived', arrivedAt: at } });
    emit('stop.arrived', `${stop.trip.vehicleId} arrived at ${o.outletId}`, { tripId: stop.tripId });
    return;
  }

  if (ev.type === 'stop.delivered') {
    await prisma.deliveryEvent.create({ data: { ...base, receiverName: ev.receiverName, deliveredUnits: ev.deliveredUnits, photo: ev.photoBase64 ?? null, signature: ev.signatureBase64 ?? null, outcome: ev.outcome, note: ev.note ?? null } });
    await prisma.tripStop.update({ where: { id: stop.id }, data: { status: 'delivered', arrivedAt: stop.arrivedAt ?? at, deliveredAt: at, deliveredUnits: ev.deliveredUnits, receiverName: ev.receiverName } });
    await prisma.order.update({ where: { id: o.id }, data: { status: 'delivered' } });
    await prisma.outlet.update({ where: { id: o.outletId }, data: { lastServedOn: stop.trip.plan.date } });
    const unit = unitLabelOf(o.outlet.brand);
    await notifyStore(o.outletId, 'stop.delivered', `Delivered ${clockOf(at)} · ${ev.deliveredUnits} ${unit}`,
      `${refOf(o)} received by ${ev.receiverName}${ev.photoBase64 ? ', photo attached' : ''}. Please confirm receipt.`, { date, orderId: o.id });
    if (ev.outcome === 'partial' || ev.deliveredUnits < o.units) {
      await alertDispatcher('failed', `Partial delivery · ${o.outletId} ${o.outlet.district}`, `${stop.trip.vehicleId} delivered ${ev.deliveredUnits} of ${o.units} ${unit}${ev.note ? `: ${ev.note}` : ''}.`, { date, outletId: o.outletId, tripId: stop.tripId, orderId: o.id });
    } else if (ev.photoBase64) {
      await alertDispatcher('pod', `${o.outletId} received · ${clockOf(at)}`, `Signed by ${ev.receiverName} · photo attached${ev.signatureBase64 ? ' · signature' : ''}.`, { date, outletId: o.outletId, stopId: stop.id });
    }
    emit('stop.delivered', `${o.outletId} delivered by ${stop.trip.vehicleId}`, { tripId: stop.tripId, outletId: o.outletId });
    return;
  }

  // stop.failed
  await prisma.deliveryEvent.create({ data: { ...base, reason: ev.reason, note: ev.note ?? null, photo: ev.photoBase64 ?? null } });
  await prisma.tripStop.update({ where: { id: stop.id }, data: { status: 'failed', failedReason: ev.reason, arrivedAt: stop.arrivedAt ?? at } });
  await prisma.order.update({ where: { id: o.id }, data: { status: 'failed' } });
  await alertDispatcher('failed', `${stop.trip.vehicleId} could not deliver ${o.outletId} ${o.outlet.district}`, `Driver reported: ${FAIL_LABEL[ev.reason]}${ev.note ? ` – ${ev.note}` : ''}. Re-sequence or move it to the next run.`, { date, outletId: o.outletId, tripId: stop.tripId, orderId: o.id });
  await notifyStore(o.outletId, 'stop.failed', `Delivery not completed ${clockOf(at)}`, `${refOf(o)}: ${FAIL_LABEL[ev.reason]}. The dispatcher will give you a new time.`, { date, orderId: o.id });
  emit('stop.failed', `${o.outletId}: ${FAIL_LABEL[ev.reason]}`, { tripId: stop.tripId, outletId: o.outletId });
}
