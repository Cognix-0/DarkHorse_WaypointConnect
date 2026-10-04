// Loads one delivery day for one depot and maps database rows to engine types and contract DTOs.
import type { Prisma } from '@prisma/client';
import {
  priorityRank, schedulePlan, tripVolumeM3, tripWeightKg, tripMinutesOf, tripsLitres, validatePlan, toHHMM, toMin,
  type Order as EOrder, type PlanningContext, type Trip as ETrip, type Vehicle as EVehicle, type Depot,
} from '@waypoint/shared';
import type { TOrderDto, TPlanDto } from '@waypoint/shared/contract';
import { prisma } from './db.ts';
import { baseContext, cutoffFor, dbDate, isoOf, nextOperatingDay, previousOperatingDay } from './reference.ts';

export const orderInclude = {
  outlet: true,
  deferrals: { orderBy: { createdAt: 'desc' } },
  stop: true,
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const planInclude = {
  trips: { include: { stops: { orderBy: { seq: 'asc' } } }, orderBy: [{ vehicleId: 'asc' }, { tripNo: 'asc' }] },
  deferrals: true,
} satisfies Prisma.PlanInclude;
export type PlanRow = Prisma.PlanGetPayload<{ include: typeof planInclude }>;

export interface Day {
  date: string;
  depot: Depot;
  /** orders to plan today (locked before the cutoff, or carried over) */
  orders: OrderRow[];
  afterCutoff: OrderRow[];
  vehicles: Prisma.VehicleGetPayload<{ include: { dayStatus: true } }>[];
  plan: PlanRow | null;
  /** outlets skipped on the last run */
  skipped: Set<string>;
  engineOrders: Map<string, EOrder>;
  engineVehicles: EVehicle[];
  ctx: PlanningContext;
  nextRun: string;
}

const PLANNABLE = ['placed', 'locked', 'planned', 'deferred', 'loaded', 'out_for_delivery', 'delivered', 'failed', 'received'] as const;

export async function loadDay(date: string, depot: Depot): Promise<Day> {
  const d = dbDate(date);
  const nextRun = nextOperatingDay(date);
  const prev = dbDate(previousOperatingDay(date));
  const cutoff = cutoffFor(date);

  const [all, afterCutoff, vehicles, plan, prevDeferred] = await Promise.all([
    prisma.order.findMany({ where: { deliveryDate: d, outlet: { depot }, status: { in: [...PLANNABLE] } }, include: orderInclude }),
    // Already in for the next run (placed after this run's cutoff): shown greyed on the queue, planned on that run
    prisma.order.findMany({ where: { deliveryDate: dbDate(nextRun), outlet: { depot }, placedAt: { gt: cutoff }, status: { not: 'cancelled' } }, include: orderInclude }),
    prisma.vehicle.findMany({ where: { depot }, include: { dayStatus: { where: { date: d } } }, orderBy: { id: 'asc' } }),
    prisma.plan.findUnique({ where: { date_depot: { date: d, depot } }, include: planInclude }),
    prisma.order.findMany({ where: { deliveryDate: prev, outlet: { depot }, status: 'deferred' }, select: { outletId: true } }),
  ]);
  const orders = all.filter((o) => o.placedAt <= cutoff || !!o.sourceRef?.startsWith('carry:'));
  const skipped = new Set<string>(prevDeferred.map((o) => o.outletId));

  const engineOrders = new Map<string, EOrder>();
  for (const o of orders) engineOrders.set(o.id, toEngineOrder(o, date, skipped));
  const engineVehicles: EVehicle[] = vehicles.map((v) => ({
    id: v.id, type: v.type, temp: v.temp, weightCapKg: v.weightCapKg, volumeCapM3: v.volumeCapM3, depot: v.depot,
    kmPerL: v.kmPerL, weeklyFuelQuotaL: v.weeklyFuelQuotaL, available: v.dayStatus.length === 0,
  }));
  const ctx: PlanningContext = { ...baseContext, fuelUsedL: Object.fromEntries(vehicles.map((v) => [v.id, v.fuelUsedWeekL])) };
  return { date, depot, orders, afterCutoff, vehicles, plan, skipped, engineOrders, engineVehicles, ctx, nextRun };
}

export function daysBetween(fromIso: string, to: Date | null): number {
  if (!to) return 7;
  return Math.max(0, Math.round((dbDate(fromIso).getTime() - to.getTime()) / 86_400_000));
}

export function toEngineOrder(o: OrderRow, date: string, skipped: Set<string>): EOrder {
  return {
    ref: o.id, outletId: o.outletId, brand: o.outlet.brand, district: o.outlet.district, depot: o.outlet.depot,
    dockType: o.outlet.dockType, parking: o.outlet.parking, temp: o.temp, units: o.units, weightKg: o.weightKg, volumeM3: o.volumeM3,
    windowOpen: o.outlet.windowOpen, windowClose: o.outlet.windowClose,
    deferredYesterday: skipped.has(o.outletId),
    daysSinceLastServed: daysBetween(date, o.outlet.lastServedOn),
  };
}

export function toOrderDto(o: OrderRow, day: Pick<Day, 'date' | 'skipped'>): TOrderDto {
  const e = toEngineOrder(o, day.date, day.skipped);
  const def = o.deferrals[0];
  const eta = o.stop?.plannedArrival;
  return {
    id: o.id,
    ref: displayRef(o),
    outlet: {
      id: o.outlet.id, brand: o.outlet.brand, district: o.outlet.district, depot: o.outlet.depot, dockType: o.outlet.dockType,
      parking: o.outlet.parking, mallWindow: o.outlet.mallWindow, windowOpen: o.outlet.windowOpen, windowClose: o.outlet.windowClose,
    },
    deliveryDate: isoOf(o.deliveryDate),
    temp: o.temp,
    units: o.units,
    weightKg: o.weightKg,
    volumeM3: o.volumeM3,
    status: o.status,
    priority: priorityRank(e),
    deferredYesterday: e.deferredYesterday,
    daysSinceLastServed: e.daysSinceLastServed,
    placedAt: o.placedAt.toISOString(),
    // Stores see a 30-minute arrival window around the planned ETA.
    arrivalWindow: eta ? { from: toHHMM(toMin(eta) - 10), to: toHHMM(toMin(eta) + 20) } : null,
    deferral: def && o.status === 'deferred'
      ? { reason: def.reason, type: def.type, note: def.note, newDate: isoOf(def.newDate), confirmed: !!def.confirmedAt }
      : null,
  };
}

/** ORD-25047 style reference: seeded Task 2B rows keep their number (S1-047 → ORD-25047). */
export function displayRef(o: { id: string; sourceRef: string | null }): string {
  const src = o.sourceRef?.startsWith('carry:') ? null : o.sourceRef;
  const m = src?.match(/^S(\d)-(\d+)$/);
  if (m) return `ORD-25${m[2]!.padStart(3, "0")}`;
  return `ORD-${o.id.slice(-5).toUpperCase()}`;
}

/** Engine trips for a stored plan (orders that are no longer on the day are dropped). */
export function engineTrips(plan: PlanRow | null, day: Pick<Day, 'engineOrders'>): ETrip[] {
  if (!plan) return [];
  return plan.trips.map((t) => ({
    vehicleId: t.vehicleId, tripNo: t.tripNo as 1 | 2, brand: t.brand, district: t.district,
    orders: t.stops.map((s) => day.engineOrders.get(s.orderId)).filter((o): o is EOrder => !!o),
  }));
}

export function toPlanDto(plan: PlanRow, day: Day): TPlanDto {
  const trips = engineTrips(plan, day);
  const sched = schedulePlan(trips, day.ctx);
  const violations = validatePlan(trips, day.engineVehicles, day.ctx);
  return {
    id: plan.id,
    date: isoOf(plan.date),
    depot: plan.depot,
    status: plan.status,
    version: plan.version,
    publishedAt: plan.publishedAt?.toISOString() ?? null,
    trips: plan.trips.map((t, i) => {
      const et = trips[i]!;
      const s = sched.get(`${t.vehicleId}|${t.tripNo}`);
      const byRef = new Map(et.orders.map((o) => [o.ref, o]));
      return {
        id: t.id, vehicleId: t.vehicleId, tripNo: t.tripNo as 1 | 2, brand: t.brand, district: t.district,
        orderIds: (s?.stops ?? []).map((x) => x.ref),
        weightKg: tripWeightKg(et.orders), volumeM3: tripVolumeM3(et.orders),
        minutes: et.orders.length ? tripMinutesOf(et, day.ctx) : 0,
        departAt: s?.departAt ?? t.departAt, endAt: s?.endAt ?? t.departAt,
        stops: (s?.stops ?? []).map((x) => ({ orderId: x.ref, outletId: byRef.get(x.ref)?.outletId ?? x.outletId, seq: x.seq, eta: x.eta, late: x.late })),
        state: tripState(t),
      };
    }),
    deferred: plan.deferrals
      .filter((d) => day.engineOrders.has(d.orderId))
      .map((d) => ({ orderId: d.orderId, reason: d.reason, type: d.type, detail: d.detail ?? '' })),
    violations: violations.map((v) => ({ vehicleId: v.vehicleId, tripNo: v.tripNo, code: v.code, reason: v.reason })),
  };
}

export const tripState = (t: { departedAt: Date | null; sealedAt: Date | null; loaderId: string | null }) =>
  (t.departedAt ? 'departed' : t.sealedAt ? 'sealed' : t.loaderId ? 'loading' : 'open') as 'open' | 'loading' | 'sealed' | 'departed';

export function boardVehicles(day: Day) {
  const trips = engineTrips(day.plan, day);
  return day.vehicles.map((v) => ({
    id: v.id, type: v.type, temp: v.temp, weightCapKg: v.weightCapKg, volumeCapM3: v.volumeCapM3, depot: v.depot,
    kmPerL: v.kmPerL, weeklyFuelQuotaL: v.weeklyFuelQuotaL, available: v.dayStatus.length === 0, driverName: v.driverName,
    fuelUsedL: v.fuelUsedWeekL,
    fuelPlannedL: Math.round(tripsLitres(trips.filter((t) => t.vehicleId === v.id), v.kmPerL, day.ctx) * 10) / 10,
  }));
}

export const planStatusOf = (plan: { status: 'draft' | 'published' } | null) => (plan ? plan.status : 'none') as 'none' | 'draft' | 'published';

/** Orders that are neither on a trip nor deferred in the current plan. */
export function unassignedOrders(day: Day): OrderRow[] {
  const onTrip = new Set(day.plan?.trips.flatMap((t) => t.stops.map((s) => s.orderId)) ?? []);
  const deferred = new Set(day.plan?.deferrals.map((d) => d.orderId) ?? []);
  return day.orders.filter((o) => !onTrip.has(o.id) && !deferred.has(o.id) && (o.status === 'locked' || o.status === 'placed' || o.status === 'planned'));
}
