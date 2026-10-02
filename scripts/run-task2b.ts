// Runs the planning engine on the official Task 2B peak day and writes out/submission_task2b.csv.
// Check it with: python3 check_allocation.py out/submission_task2b.csv
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { contextFromRows, orderFromScenarioRow, parseCsv, suggestPlan, vehicleFromRow } from '../packages/shared/src/engine/index.ts';

const csv = (f: string) => parseCsv(readFileSync(`data/${f}`, 'utf8'));
const ctx = contextFromRows(csv('district_travel.csv'), csv('service_allowance.csv'));
const scen = csv('task2b_peak_day_scenarios.csv');
const fleet = csv('task2b_peak_day_fleet.csv');
const rows: string[] = ['scenario,order_ref,outlet_id,decision,vehicle_id,trip_id'];
const summary: string[] = [];

for (const sc of [...new Set(scen.map((r) => r.scenario!))]) {
  const avail = new Set(fleet.filter((r) => r.scenario === sc && r.status === 'available').map((r) => r.vehicle_id));
  const vehicles = csv('vehicles.csv').map((r) => vehicleFromRow(r, avail.has(r.vehicle_id!)));
  const orders = scen.filter((r) => r.scenario === sc).map(orderFromScenarioRow);
  const plan = suggestPlan(orders, vehicles, ctx);
  const where = new Map<string, { v: string; t: number }>();
  for (const t of plan.trips) for (const o of t.orders) where.set(o.ref, { v: t.vehicleId, t: t.tripNo });
  for (const o of orders) {
    const w = where.get(o.ref);
    rows.push(w ? `${sc},${o.ref},${o.outletId},served,${w.v},${w.t}` : `${sc},${o.ref},${o.outletId},deferred,,`);
  }
  summary.push(`${sc}: ${orders.length} orders, ${where.size} served on ${plan.trips.length} trips, ${plan.deferred.length} deferred`);
  for (const d of plan.deferred) summary.push(`  deferred ${d.order.ref} ${d.order.outletId} ${d.order.brand}/${d.order.temp}${d.order.deferredYesterday ? ' (skipped yesterday)' : ''}: ${d.reason} - ${d.detail}`);
}
mkdirSync('out', { recursive: true });
writeFileSync('out/submission_task2b.csv', rows.join('\n') + '\n');
console.log(summary.join('\n'));
