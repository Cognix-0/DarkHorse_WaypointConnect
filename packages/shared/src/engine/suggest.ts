import { checkPlacement, tripWeightKg } from './rules.ts';
import { sortByPriority } from './priority.ts';
import type { Deferral, DeferralReason, Order, Plan, PlanningContext, RuleCode, Trip, Vehicle } from './types.ts';

/**
 * Suggest plan: greedy allocation in priority order.
 *  - Each order first joins an existing trip with the same brand and district (best fit).
 *  - Otherwise it opens a new trip on the most suitable free vehicle: reefers are kept for
 *    chilled goods and vans for van-only outlets, then larger vehicles first so trips consolidate.
 *  - An order no vehicle can legally take is deferred as `unavoidable`, with the reason.
 * The dispatcher can then move orders by hand; the API re-checks every change with validatePlan.
 */
export function suggestPlan(orders: Order[], vehicles: Vehicle[], ctx: PlanningContext): Plan {
  const tripsByVehicle = new Map<string, Trip[]>(vehicles.map((v) => [v.id, []]));
  const deferred: Deferral[] = [];

  for (const order of sortByPriority(orders)) {
    const pool = vehicles.filter((v) => v.available && v.depot === order.depot);

    // Try vehicles in tiers so scarce kinds are used last: an ambient order uses a dry vehicle
    // before a reefer, and a normal outlet uses a truck before a van. Within a tier, first join an
    // existing matching trip (tightest fit), then open a new trip (largest vehicle first).
    const joinable = pool
      .flatMap((v) => (tripsByVehicle.get(v.id) ?? []).filter((t) => t.brand === order.brand && t.district === order.district).map((t) => ({ v, t })))
      .map(({ v, t }) => ({ v, t, spare: v.weightCapKg - tripWeightKg(t.orders) }))
      .sort((a, b) => a.spare - b.spare);
    const failures: { v: Vehicle; code: RuleCode; reason: string }[] = [];
    let placed = false;
    const tiers = [...new Set(pool.map((v) => penalty(order, v)))].sort((a, b) => a - b);
    for (const tier of tiers) {
      for (const { v, t } of joinable.filter((j) => penalty(order, j.v) === tier)) {
        const r = checkPlacement(order, v, tripsByVehicle.get(v.id) ?? [], ctx, t.tripNo);
        if (r.ok) { t.orders.push(order); placed = true; break; }
        failures.push({ v, code: r.code, reason: r.reason });
      }
      if (placed) break;
      const fresh = pool.filter((v) => penalty(order, v) === tier).sort((a, b) => b.weightCapKg - a.weightCapKg || a.id.localeCompare(b.id));
      for (const v of fresh) {
        const vt = tripsByVehicle.get(v.id) ?? [];
        const r = checkPlacement(order, v, vt, ctx, 'new');
        if (r.ok) {
          vt.push({ vehicleId: v.id, tripNo: r.tripNo, brand: order.brand, district: order.district, orders: [order] });
          tripsByVehicle.set(v.id, vt);
          placed = true;
          break;
        }
        failures.push({ v, code: r.code, reason: r.reason });
      }
      if (placed) break;
    }
    if (!placed) deferred.push(explainDeferral(order, failures));
  }

  const trips = [...tripsByVehicle.values()].flat().sort((a, b) => a.vehicleId.localeCompare(b.vehicleId) || a.tripNo - b.tripNo);
  return { trips, deferred };
}

/** Lower is better: keep reefers for chilled goods and vans for van-only outlets. */
function penalty(order: Order, v: Vehicle): number {
  let p = 0;
  if (order.temp === 'ambient' && v.temp === 'reefer') p += 10;
  if (order.parking !== 'van_only' && v.type === 'van') p += 5;
  return p;
}

const TYPE_RULES: RuleCode[] = ['NEEDS_REEFER', 'NEEDS_VAN', 'WRONG_DEPOT', 'VEHICLE_UNAVAILABLE'];

function explainDeferral(order: Order, failures: { v: Vehicle; code: RuleCode; reason: string }[]): Deferral {
  // Only vehicles of the right kind tell us *why* there was no room.
  const suitable = failures.filter((f) => !TYPE_RULES.includes(f.code));
  let reason: DeferralReason;
  let detail: string;
  if (suitable.length === 0) {
    reason = order.temp === 'chilled' ? 'no_reefer_capacity' : 'no_vehicle';
    detail = order.temp === 'chilled'
      ? `No refrigerated ${order.parking === 'van_only' ? 'van' : 'vehicle'} is available at ${order.depot}`
      : `No suitable vehicle is available at ${order.depot}`;
  } else {
    const codes = new Set(suitable.map((f) => f.code));
    if (codes.has('OVER_FUEL') && suitable.every((f) => f.code === 'OVER_FUEL')) reason = 'fuel_quota';
    else if (suitable.every((f) => f.code === 'OVER_TIME_FRESH' || f.code === 'OVER_TIME_DAY')) reason = 'time_window';
    else reason = order.temp === 'chilled' ? 'no_reefer_capacity' : 'vehicle_full';
    const uniq = [...new Map(suitable.map((f) => [f.v.id, f])).values()].slice(0, 2);
    detail = uniq.map((f) => (f.reason.startsWith(f.v.id) ? f.reason : `${f.v.id}: ${f.reason}`)).join('; ');
  }
  return { order, reason, type: 'unavoidable', detail };
}
