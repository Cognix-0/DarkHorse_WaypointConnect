import type { Order, PlacementResult, PlanningContext, Trip, Vehicle } from './types.ts';

/** Fresh trips must fit the pre-dawn window 03:30-08:00. */
export const FRESH_BUDGET_MIN = 270;
/** Style and Tech trips share the trading-day budget. */
export const DAYTIME_BUDGET_MIN = 480;
export const MAX_TRIPS_PER_VEHICLE = 2;

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/**
 * Planned trip duration using the published planning standard (Challenge Booklet p.20):
 * outbound + inter-stop x (stops - 1) + sum of handling allowances. The return leg is not added.
 */
export function tripMinutes(district: string, brand: string, docks: string[], ctx: PlanningContext): number {
  if (docks.length === 0) return 0;
  const d = ctx.travel[district];
  if (!d) throw new Error(`Unknown district: ${district}`);
  let handling = 0;
  for (const dock of docks) {
    const a = ctx.allowance[`${brand}|${dock}`];
    if (a === undefined) throw new Error(`No service allowance for ${brand} / ${dock}`);
    handling += a;
  }
  return d.outboundMin + d.interStopMin * (docks.length - 1) + handling;
}

/** Round-trip distance estimate used for the weekly fuel quota. */
export function tripKm(district: string, stops: number, ctx: PlanningContext): number {
  const d = ctx.travel[district];
  if (!d || stops === 0) return 0;
  return 2 * d.outboundKm + d.interStopKm * (stops - 1);
}

export const tripWeightKg = (orders: Order[]) => orders.reduce((s, o) => s + o.weightKg, 0);
export const tripVolumeM3 = (orders: Order[]) => orders.reduce((s, o) => s + o.volumeM3, 0);
export const tripMinutesOf = (t: Pick<Trip, 'district' | 'brand' | 'orders'>, ctx: PlanningContext) =>
  tripMinutes(t.district, t.brand, t.orders.map((o) => o.dockType), ctx);

/**
 * Can `order` go on `vehicle`? Checks every operating constraint from the booklet.
 *
 * @param vehicleTrips trips this vehicle already has today
 * @param target 1 or 2 to force a specific trip; 'new' to force a new trip; omit to pick
 *               the existing trip with the same brand and district, else a new trip.
 */
export function checkPlacement(
  order: Order,
  vehicle: Vehicle,
  vehicleTrips: Trip[],
  ctx: PlanningContext,
  target?: 1 | 2 | 'new',
): PlacementResult {
  if (!vehicle.available) {
    return { ok: false, code: 'VEHICLE_UNAVAILABLE', reason: `${vehicle.id} is in the workshop today` };
  }
  if (vehicle.depot !== order.depot) {
    return { ok: false, code: 'WRONG_DEPOT', reason: `${vehicle.id} is based at ${vehicle.depot}; ${order.outletId} is served from ${order.depot}` };
  }
  if (order.temp === 'chilled' && vehicle.temp !== 'reefer') {
    return { ok: false, code: 'NEEDS_REEFER', reason: `${vehicle.id} can't carry chilled goods` };
  }
  if (order.parking === 'van_only' && vehicle.type !== 'van') {
    return { ok: false, code: 'NEEDS_VAN', reason: `${order.outletId} is van-only; trucks can't reach it` };
  }
  if (!ctx.travel[order.district]) {
    return { ok: false, code: 'UNKNOWN_DISTRICT', reason: `No travel data for ${order.district}` };
  }

  let trip: Trip | undefined;
  if (target === 'new') {
    trip = undefined;
  } else if (target === 1 || target === 2) {
    trip = vehicleTrips.find((t) => t.tripNo === target);
    if (trip && trip.brand !== order.brand) {
      return { ok: false, code: 'TRIP_MIXES_BRAND', reason: `Trip ${target} on ${vehicle.id} carries ${trip.brand}; one brand per trip` };
    }
    if (trip && trip.district !== order.district) {
      return { ok: false, code: 'TRIP_MIXES_DISTRICT', reason: `Trip ${target} on ${vehicle.id} goes to ${trip.district}; one district per trip` };
    }
  } else {
    trip = vehicleTrips.find((t) => t.brand === order.brand && t.district === order.district);
  }

  const newTrip = !trip;
  if (newTrip && vehicleTrips.length >= MAX_TRIPS_PER_VEHICLE) {
    return { ok: false, code: 'MAX_TRIPS', reason: `${vehicle.id} already runs ${MAX_TRIPS_PER_VEHICLE} trips today` };
  }

  const orders = [...(trip?.orders ?? []), order];
  const kg = tripWeightKg(orders);
  if (kg > vehicle.weightCapKg + 1e-6) {
    return { ok: false, code: 'OVER_WEIGHT', reason: `Weight would be ${fmt(kg)} of ${fmt(vehicle.weightCapKg)} kg` };
  }
  const m3 = tripVolumeM3(orders);
  if (m3 > vehicle.volumeCapM3 + 1e-6) {
    return { ok: false, code: 'OVER_VOLUME', reason: `Volume would be ${fmt(m3, 1)} of ${fmt(vehicle.volumeCapM3, 1)} m³` };
  }

  const minutes = tripMinutes(order.district, order.brand, orders.map((o) => o.dockType), ctx);
  const isFresh = order.brand === 'Fresh';
  const sameWindow = vehicleTrips.filter((t) => t !== trip && (t.brand === 'Fresh') === isFresh);
  const used = sameWindow.reduce((s, t) => s + tripMinutesOf(t, ctx), 0);
  const budget = isFresh ? FRESH_BUDGET_MIN : DAYTIME_BUDGET_MIN;
  if (used + minutes > budget + 1e-6) {
    return {
      ok: false,
      code: isFresh ? 'OVER_TIME_FRESH' : 'OVER_TIME_DAY',
      reason: `${isFresh ? 'Fresh window' : 'Style/Tech day'} would be ${Math.round(used + minutes)} of ${budget} min`,
    };
  }

  if (ctx.fuelUsedL) {
    const usedL = ctx.fuelUsedL[vehicle.id] ?? 0;
    const otherKm = vehicleTrips.filter((t) => t !== trip).reduce((s, t) => s + tripKm(t.district, t.orders.length, ctx), 0);
    const litres = (otherKm + tripKm(order.district, orders.length, ctx)) / vehicle.kmPerL;
    if (usedL + litres > vehicle.weeklyFuelQuotaL + 1e-6) {
      return { ok: false, code: 'OVER_FUEL', reason: `Fuel would reach ${fmt(usedL + litres)} of ${fmt(vehicle.weeklyFuelQuotaL)} L this week` };
    }
  }

  const tripNo: 1 | 2 = trip ? trip.tripNo : vehicleTrips.some((t) => t.tripNo === 1) ? 2 : 1;
  return { ok: true, tripNo, newTrip, tripMinutes: minutes };
}

export interface PlanViolation {
  vehicleId: string;
  tripNo?: number;
  code: string;
  reason: string;
}

/** Re-checks a whole plan. Used by the API before saving or publishing a dispatcher's manual edits. */
export function validatePlan(trips: Trip[], vehicles: Vehicle[], ctx: PlanningContext): PlanViolation[] {
  const out: PlanViolation[] = [];
  const byVehicle = new Map<string, Trip[]>();
  for (const t of trips) byVehicle.set(t.vehicleId, [...(byVehicle.get(t.vehicleId) ?? []), t]);

  for (const [vid, vTrips] of byVehicle) {
    const v = vehicles.find((x) => x.id === vid);
    if (!v) {
      out.push({ vehicleId: vid, code: 'UNKNOWN_VEHICLE', reason: `Unknown vehicle ${vid}` });
      continue;
    }
    if (vTrips.length > MAX_TRIPS_PER_VEHICLE) {
      out.push({ vehicleId: vid, code: 'MAX_TRIPS', reason: `${vid} has ${vTrips.length} trips; max ${MAX_TRIPS_PER_VEHICLE}` });
    }
    // Rebuild each trip order by order so every rule is checked with the real running totals.
    const rebuilt: Trip[] = [];
    for (const t of [...vTrips].sort((a, b) => a.tripNo - b.tripNo)) {
      const current: Trip = { ...t, orders: [] };
      for (const o of t.orders) {
        if (o.brand !== t.brand || o.district !== t.district) {
          out.push({ vehicleId: vid, tripNo: t.tripNo, code: o.brand !== t.brand ? 'TRIP_MIXES_BRAND' : 'TRIP_MIXES_DISTRICT', reason: `${o.outletId} doesn't match trip ${t.tripNo} (${t.brand} · ${t.district})` });
          continue;
        }
        const started = current.orders.length > 0;
        const r = started
          ? checkPlacement(o, v, [...rebuilt, current], ctx, current.tripNo)
          : checkPlacement(o, v, rebuilt, ctx, 'new');
        if (!r.ok) out.push({ vehicleId: vid, tripNo: t.tripNo, code: r.code, reason: r.reason });
        current.orders.push(o);
      }
      rebuilt.push(current);
    }
  }
  return out;
}
