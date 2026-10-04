// Dispatcher: order queue (D2), planning board (D3), deferrals and publishing.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { checkPlacement, type Order as EOrder, type Trip as ETrip, type Depot } from '@waypoint/shared';
import {
  CheckPlacementRequest, ConfirmDeferralRequest, DeferRequest, SaveTripsRequest,
  type TBoardResponse, type TCheckPlacementResponse, type TOrderQueueResponse, type TPlanDto,
} from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { today } from '../reference.ts';
import { boardVehicles, engineTrips, loadDay, planStatusOf, toOrderDto, toPlanDto, type Day } from '../day.ts';
import { deferOrder, HttpError, publish, suggest, writeTrips } from '../plans.ts';

/** Every dispatcher screen works on one day and the dispatcher's own depot. */
export const dayOf = (req: FastifyRequest) => {
  const q = req.query as { date?: string; depot?: string };
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today();
  // A dispatcher account belongs to one depot; ?depot= only applies to an account without one.
  const depot = (req.user.depot ?? (q.depot === 'Kandy' || q.depot === 'Peliyagoda' ? q.depot : 'Peliyagoda')) as Depot;
  return { date, depot };
};

const planOrNull = (day: Day): TPlanDto | null => (day.plan ? toPlanDto(day.plan, day) : null);

export async function dispatchRoutes(app: FastifyInstance) {
  const dispatcher = { preHandler: requireRole('dispatcher') };

  // D2 Order queue: today's locked orders in priority order.
  app.get('/orders', dispatcher, async (req): Promise<TOrderQueueResponse> => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    const orders = day.orders.map((o) => toOrderDto(o, day)).sort((a, b) =>
      a.priority - b.priority || Number(b.deferredYesterday) - Number(a.deferredYesterday) || b.daysSinceLastServed - a.daysSinceLastServed || a.outlet.windowClose.localeCompare(b.outlet.windowClose) || b.weightKg - a.weightKg);
    const sum = (f: (o: (typeof orders)[number]) => number) => orders.reduce((s, o) => s + f(o), 0);
    return {
      date, lockedAt: day.orders.length ? new Date(`${date}T00:00:00.000Z`).toISOString() : null,
      orders,
      afterCutoffOrders: day.afterCutoff.map((o) => toOrderDto(o, day)),
      summary: {
        total: orders.length,
        chilled: orders.filter((o) => o.temp === 'chilled').length,
        skippedLastRun: orders.filter((o) => o.deferredYesterday).length,
        afterCutoff: day.afterCutoff.length,
        vehiclesAvailable: day.engineVehicles.filter((v) => v.available).length,
        vehiclesTotal: day.engineVehicles.length,
        weightKg: Math.round(sum((o) => o.weightKg)),
        volumeM3: Math.round(sum((o) => o.volumeM3) * 10) / 10,
        chilledKg: Math.round(sum((o) => (o.temp === 'chilled' ? o.weightKg : 0))),
        vanOnly: orders.filter((o) => o.outlet.parking === 'van_only').length,
        mallWindow: orders.filter((o) => o.outlet.parking === 'mall_dock' || !!o.outlet.mallWindow).length,
        byBrand: { Fresh: orders.filter((o) => o.outlet.brand === 'Fresh').length, Style: orders.filter((o) => o.outlet.brand === 'Style').length, Tech: orders.filter((o) => o.outlet.brand === 'Tech').length },
      },
      nextRunDate: day.nextRun,
      planStatus: planStatusOf(day.plan),
    };
  });

  // D3 Planning board
  app.get('/board', dispatcher, async (req): Promise<TBoardResponse> => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    return { date, depot, plan: planOrNull(day), orders: day.orders.map((o) => toOrderDto(o, day)), vehicles: boardVehicles(day) };
  });

  // "Auto-allocate & open board": the engine builds a full draft plan.
  app.post('/plans/suggest', dispatcher, async (req) => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    if (day.orders.length === 0) throw new HttpError(400, 'No locked orders for this day.');
    const r = await suggest(day);
    const fresh = await loadDay(date, depot);
    return { ...r, plan: planOrNull(fresh) };
  });

  // Save the board after a drag and drop. The engine re-checks every trip; the response lists any violation.
  app.put('/plans/trips', dispatcher, async (req): Promise<TPlanDto> => {
    const { date, depot } = dayOf(req);
    const body = SaveTripsRequest.parse(req.body);
    const day = await loadDay(date, depot);
    const seen = new Set<string>();
    const slots = new Set<string>();
    const trips: ETrip[] = body.trips.map((t) => {
      if (slots.has(`${t.vehicleId}|${t.tripNo}`)) throw new HttpError(400, `${t.vehicleId} has two trip ${t.tripNo}s`);
      slots.add(`${t.vehicleId}|${t.tripNo}`);
      const orders = t.orderIds.map((id) => {
        const o = day.engineOrders.get(id);
        if (!o) throw new HttpError(400, `Order ${id} is not on ${date}`);
        if (seen.has(id)) throw new HttpError(400, `Order ${id} is on two trips`);
        seen.add(id);
        return o;
      });
      return { vehicleId: t.vehicleId, tripNo: t.tripNo, brand: orders[0]!.brand, district: orders[0]!.district, orders };
    });
    // Goods on a sealed or departed vehicle can't be changed from the board.
    for (const old of day.plan?.trips ?? []) {
      if (!old.sealedAt && !old.departedAt) continue;
      const now = trips.find((t) => t.vehicleId === old.vehicleId && t.tripNo === old.tripNo);
      const a = old.stops.map((x) => x.orderId).sort().join();
      const b = (now?.orders ?? []).map((o) => o.ref).sort().join();
      if (a !== b) throw new HttpError(409, `${old.vehicleId} trip ${old.tripNo} is already ${old.departedAt ? 'on the road' : 'sealed'}. Its goods can't change.`, { code: 'TRIP_SEALED' });
    }
    await writeTrips(day, trips);
    const fresh = await loadDay(date, depot);
    return toPlanDto(fresh.plan!, fresh);
  });

  // Live rule check while dragging (drives the "Drop blocked" toast).
  app.post('/plans/check-placement', dispatcher, async (req): Promise<TCheckPlacementResponse> => {
    const { date, depot } = dayOf(req);
    const body = CheckPlacementRequest.parse(req.body);
    const day = await loadDay(date, depot);
    const order = day.engineOrders.get(body.orderId);
    if (!order) throw new HttpError(404, 'Order not found on this day');
    const trips = withoutOrder(engineTrips(day.plan, day), order.ref);
    const vehicle = day.engineVehicles.find((v) => v.id === body.vehicleId);
    if (!vehicle) throw new HttpError(404, 'Vehicle not found');
    const closed = closedTrips(day);
    const fromTrip = day.plan?.trips.find((t) => t.stops.some((x) => x.orderId === order.ref));
    if (fromTrip && closed.has(`${fromTrip.vehicleId}|${fromTrip.tripNo}`)) {
      return { ok: false, code: 'TRIP_SEALED', reason: `it is already on ${fromTrip.vehicleId}, which is ${fromTrip.departedAt ? 'on the road' : 'sealed'}`, alternatives: [] };
    }
    const r = checkPlacement(order, vehicle, trips.filter((t) => t.vehicleId === vehicle.id), day.ctx, body.tripNo);
    if (r.ok && closed.has(`${vehicle.id}|${r.tripNo}`) && !r.newTrip) {
      return { ok: false, code: 'TRIP_SEALED', reason: `${vehicle.id} trip ${r.tripNo} is already sealed`, alternatives: alternativesFor(order, trips, day).slice(0, 3) };
    }
    const alternatives = r.ok ? [] : alternativesFor(order, trips, day).slice(0, 3);
    return r.ok ? { ok: true, alternatives } : { ok: false, code: r.code, reason: r.reason, alternatives };
  });

  app.post('/orders/:id/defer', dispatcher, async (req) => {
    const { date, depot } = dayOf(req);
    const body = DeferRequest.parse(req.body);
    const day = await loadDay(date, depot);
    await deferOrder(day, (req.params as { id: string }).id, body, req.user.id);
    const fresh = await loadDay(date, depot);
    return planOrNull(fresh);
  });

  app.post('/deferrals/:id/confirm', dispatcher, async (req) => {
    const body = ConfirmDeferralRequest.parse(req.body);
    const id = (req.params as { id: string }).id;
    const d = await prisma.deferral.update({ where: { id }, data: { confirmedAt: new Date(), note: body.note, byUserId: req.user.id } });
    return { id: d.id, confirmed: true };
  });

  app.post('/plans/publish', dispatcher, async (req) => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    const version = await publish(day, req.user.name);
    return { version };
  });
}

function withoutOrder(trips: ETrip[], ref: string): ETrip[] {
  return trips.map((t) => ({ ...t, orders: t.orders.filter((o) => o.ref !== ref) })).filter((t) => t.orders.length > 0);
}

const closedTrips = (day: Day) => new Set((day.plan?.trips ?? []).filter((t) => t.sealedAt || t.departedAt).map((t) => `${t.vehicleId}|${t.tripNo}`));

/** Vehicles that would accept the order as things stand, emptiest first (sealed trips excluded). */
function alternativesFor(order: EOrder, trips: ETrip[], day: Day): string[] {
  const closed = closedTrips(day);
  return day.engineVehicles
    .filter((v) => v.available && v.depot === order.depot)
    .map((v) => ({ v, r: checkPlacement(order, v, trips.filter((t) => t.vehicleId === v.id), day.ctx) }))
    .filter((x) => x.r.ok && (x.r.newTrip || !closed.has(`${x.v.id}|${x.r.tripNo}`)))
    .sort((a, b) => Number(a.v.temp === 'reefer' && order.temp === 'ambient') - Number(b.v.temp === 'reefer' && order.temp === 'ambient') || a.v.weightCapKg - b.v.weightCapKg)
    .map((x) => x.v.id);
}
