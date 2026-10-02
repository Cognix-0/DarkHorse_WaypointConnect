// Turns the competition CSV rows into engine types. Used by the seed script, the API and the Task 2B runner.
import type { Brand, DistrictTravel, DockType, Order, Parking, PlanningContext, Temp, Vehicle, Depot } from './types.ts';

export type Row = Record<string, string>;

/** Minimal CSV parser for the competition files (comma separated, optional double quotes, no embedded newlines). */
export function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0] ?? '');
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const r: Row = {};
    head.forEach((h, i) => (r[h] = cells[i] ?? ''));
    return r;
  });
}

const num = (s: string | undefined) => Number(s ?? 0);

export function vehicleFromRow(r: Row, available = true): Vehicle {
  return {
    id: r.vehicle_id!,
    type: r.type as Vehicle['type'],
    temp: r.temp as Vehicle['temp'],
    weightCapKg: num(r.weight_cap_kg),
    volumeCapM3: num(r.volume_cap_m3),
    depot: r.depot as Depot,
    kmPerL: num(r.km_per_l),
    weeklyFuelQuotaL: num(r.weekly_fuel_quota_l),
    available,
  };
}

/** Builds an engine Order from a Task 2B scenario row (it carries every outlet field). */
export function orderFromScenarioRow(r: Row): Order {
  return {
    ref: r.order_ref!,
    outletId: r.outlet_id!,
    brand: r.brand as Brand,
    district: r.district!,
    depot: r.depot as Depot,
    dockType: r.dock_type as DockType,
    parking: r.parking_constraint as Parking,
    temp: r.temp_requirement as Temp,
    units: num(r.order_units),
    weightKg: num(r.order_weight_kg),
    volumeM3: num(r.order_volume_m3),
    windowOpen: r.window_open_time!,
    windowClose: r.window_close_time!,
    deferredYesterday: r.deferred_yesterday === '1',
    daysSinceLastServed: num(r.days_since_last_served),
  };
}

export function contextFromRows(travelRows: Row[], allowanceRows: Row[]): PlanningContext {
  const travel: Record<string, DistrictTravel> = {};
  for (const r of travelRows) {
    travel[r.district!] = {
      district: r.district!,
      depot: r.depot as Depot,
      outboundMin: num(r.depot_to_district_freeflow_min),
      interStopMin: num(r.inter_stop_freeflow_min),
      outboundKm: num(r.depot_to_district_km),
      interStopKm: num(r.inter_stop_km),
    };
  }
  const allowance: Record<string, number> = {};
  for (const r of allowanceRows) allowance[`${r.brand}|${r.dock_type}`] = num(r.service_allowance_min);
  return { travel, allowance };
}
