// Turns planned trips into a timetable: departure time, stop order and arrival time (ETA) per stop.
// Uses the same planning standard as rules.ts, so a trip's ETAs always add up to tripMinutes().
import { tripMinutesOf } from './rules.ts';
import type { Order, PlanningContext, Trip } from './types.ts';

/** Fresh runs pre-dawn; Style and Tech run in the trading day. */
export const FRESH_START = '03:30';
export const FRESH_END = '08:00';
export const DAY_START = '08:00';
export const DAY_END = '16:00';

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const toHHMM = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export interface StopEta {
  ref: string;
  outletId: string;
  seq: number;
  eta: string;
  /** arrives after the outlet's receiving window closes */
  late: boolean;
}

export interface TripSchedule {
  vehicleId: string;
  tripNo: 1 | 2;
  departAt: string;
  endAt: string;
  minutes: number;
  stops: StopEta[];
}

/** Stop order inside a trip: earliest closing window first, then earliest opening. */
export const orderStops = (orders: Order[]) =>
  [...orders].sort((a, b) => toMin(a.windowClose) - toMin(b.windowClose) || toMin(a.windowOpen) - toMin(b.windowOpen) || a.outletId.localeCompare(b.outletId));

/**
 * Timetable for one vehicle's trips.
 * - Fresh trips start from 03:30, Style/Tech from 08:00.
 * - A vehicle's second trip in the same window starts when the first one ends. Like the 270/480-minute
 *   budgets, this follows the booklet's planning standard, which does not count the return leg.
 * - The last trip in a window waits at the depot so it arrives as the first shop opens, if the window allows.
 */
export function scheduleVehicle(trips: Trip[], ctx: PlanningContext): TripSchedule[] {
  const out: TripSchedule[] = [];
  for (const fresh of [true, false]) {
    const group = trips.filter((t) => (t.brand === 'Fresh') === fresh && t.orders.length > 0).sort((a, b) => a.tripNo - b.tripNo);
    let cursor = toMin(fresh ? FRESH_START : DAY_START);
    const windowEnd = toMin(fresh ? FRESH_END : DAY_END);
    group.forEach((t, i) => {
      const travel = ctx.travel[t.district];
      if (!travel) throw new Error(`Unknown district: ${t.district}`);
      const stops = orderStops(t.orders);
      const minutes = tripMinutesOf(t, ctx);
      let depart = cursor;
      if (i === group.length - 1) {
        const aligned = toMin(stops[0]!.windowOpen) - travel.outboundMin;
        depart = Math.max(cursor, Math.min(aligned, windowEnd - minutes));
      }
      let clock = depart + travel.outboundMin;
      const etas: StopEta[] = stops.map((o, seq) => {
        if (seq > 0) clock += travel.interStopMin;
        const eta = clock;
        clock += ctx.allowance[`${t.brand}|${o.dockType}`] ?? 0;
        return { ref: o.ref, outletId: o.outletId, seq: seq + 1, eta: toHHMM(eta), late: eta > toMin(o.windowClose) };
      });
      out.push({ vehicleId: t.vehicleId, tripNo: t.tripNo, departAt: toHHMM(depart), endAt: toHHMM(depart + minutes), minutes, stops: etas });
      cursor = depart + minutes;
    });
  }
  return out.sort((a, b) => a.tripNo - b.tripNo);
}

/** Timetable for every trip in a plan, keyed `${vehicleId}|${tripNo}`. */
export function schedulePlan(trips: Trip[], ctx: PlanningContext): Map<string, TripSchedule> {
  const byVehicle = new Map<string, Trip[]>();
  for (const t of trips) byVehicle.set(t.vehicleId, [...(byVehicle.get(t.vehicleId) ?? []), t]);
  const out = new Map<string, TripSchedule>();
  for (const vTrips of byVehicle.values()) for (const s of scheduleVehicle(vTrips, ctx)) out.set(`${s.vehicleId}|${s.tripNo}`, s);
  return out;
}

/** Litres a set of trips would burn (round trip estimate used by the weekly fuel quota). */
export function tripsLitres(trips: Trip[], kmPerL: number, ctx: PlanningContext): number {
  let km = 0;
  for (const t of trips) {
    const d = ctx.travel[t.district];
    if (d && t.orders.length) km += 2 * d.outboundKm + d.interStopKm * (t.orders.length - 1);
  }
  return kmPerL > 0 ? km / kmPerL : 0;
}
