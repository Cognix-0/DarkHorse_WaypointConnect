import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  contextFromRows, orderFromScenarioRow, parseCsv, scheduleVehicle, schedulePlan, suggestPlan, toMin, tripMinutesOf, vehicleFromRow,
  type Order, type Trip,
} from '../src/engine/index.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../../data');
const csv = (f: string) => parseCsv(readFileSync(join(DATA, f), 'utf8'));
const ctx = contextFromRows(csv('district_travel.csv'), csv('service_allowance.csv'));

let seq = 0;
const order = (o: Partial<Order>): Order => ({
  ref: `S-${++seq}`, outletId: `OUT9${seq}`, brand: 'Fresh', district: 'Gampaha', depot: 'Peliyagoda',
  dockType: 'rear_dock', parking: 'normal', temp: 'ambient', units: 40, weightKg: 300, volumeM3: 1.6,
  windowOpen: '05:00', windowClose: '08:00', deferredYesterday: false, daysSinceLastServed: 1, ...o,
});

test('ETAs follow the planning standard: outbound, then handling + inter-stop per stop', () => {
  // Gampaha: outbound 37, inter-stop 9; Fresh rear_dock 15, street 16 (booklet example = 101 min)
  const t: Trip = { vehicleId: 'VEH001', tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [
    order({ windowClose: '07:00' }), order({ windowClose: '07:30' }), order({ dockType: 'street', windowClose: '08:00' }),
  ] };
  const [s] = scheduleVehicle([t], ctx);
  assert.ok(s);
  assert.equal(s.minutes, 101);
  const dep = toMin(s.departAt);
  assert.deepEqual(s.stops.map((x) => toMin(x.eta) - dep), [37, 37 + 15 + 9, 37 + 15 + 9 + 15 + 9]);
  assert.equal(toMin(s.endAt) - dep, 101);
});

test('a single Fresh trip waits so it reaches the first shop as it opens', () => {
  const t: Trip = { vehicleId: 'VEH001', tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [order({ windowOpen: '05:00' })] };
  const [s] = scheduleVehicle([t], ctx);
  assert.equal(s!.departAt, '04:23'); // 05:00 - 37 min outbound
  assert.equal(s!.stops[0]!.eta, '05:00');
});

test('the second trip starts when the first ends (planning standard); the first leaves at 03:30', () => {
  const g: Trip = { vehicleId: 'VEH001', tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [order({})] };
  const c: Trip = { vehicleId: 'VEH001', tripNo: 2, brand: 'Fresh', district: 'Colombo', orders: [order({ district: 'Colombo', dockType: 'street' })] };
  const [a, b] = scheduleVehicle([c, g], ctx);
  assert.equal(a!.tripNo, 1);
  assert.equal(a!.departAt, '03:30');
  assert.ok(toMin(b!.departAt) >= toMin(a!.endAt));
  assert.ok(toMin(b!.endAt) <= toMin('08:00'), 'both Fresh trips fit 03:30-08:00');
});

test('stops are ordered by closing time and late arrivals are flagged', () => {
  const t: Trip = { vehicleId: 'VEH001', tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [
    order({ outletId: 'OUTB', windowClose: '08:00' }), order({ outletId: 'OUTA', windowOpen: '03:00', windowClose: '04:00' }),
  ] };
  const [s] = scheduleVehicle([t], ctx);
  assert.deepEqual(s!.stops.map((x) => x.outletId), ['OUTA', 'OUTB']);
  assert.equal(s!.stops[0]!.late, true);
  assert.equal(s!.stops[1]!.late, false);
});

test('S1 suggested plan: every trip gets a timetable that matches its trip minutes', () => {
  const orders = csv('task2b_peak_day_scenarios.csv').filter((r) => r.scenario === 'S1').map(orderFromScenarioRow);
  const workshop = new Set(csv('task2b_peak_day_fleet.csv').filter((r) => r.scenario === 'S1' && r.status === 'in_workshop').map((r) => r.vehicle_id));
  const vehicles = csv('vehicles.csv').map((r) => vehicleFromRow(r, !workshop.has(r.vehicle_id!)));
  const plan = suggestPlan(orders, vehicles, ctx);
  const sched = schedulePlan(plan.trips, ctx);
  assert.equal(sched.size, plan.trips.length);
  for (const t of plan.trips) {
    const s = sched.get(`${t.vehicleId}|${t.tripNo}`)!;
    assert.equal(s.minutes, tripMinutesOf(t, ctx));
    assert.equal(s.stops.length, t.orders.length);
    if (t.brand === 'Fresh') assert.ok(toMin(s.departAt) >= toMin('03:30') && toMin(s.endAt) <= toMin('08:00'), `${t.vehicleId} trip ${t.tripNo} inside the Fresh window`);
  }
});
