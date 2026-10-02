import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkPlacement, contextFromRows, orderFromScenarioRow, parseCsv, suggestPlan, tripMinutes, validatePlan, vehicleFromRow,
  priorityRank, sortByPriority,
  type Order, type Trip, type Vehicle,
} from '../src/engine/index.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../../data');
const csv = (f: string) => parseCsv(readFileSync(join(DATA, f), 'utf8'));
const ctx = contextFromRows(csv('district_travel.csv'), csv('service_allowance.csv'));
const vehicles = csv('vehicles.csv').map((r) => vehicleFromRow(r));
const V = (id: string): Vehicle => vehicles.find((v) => v.id === id)!;

let seq = 0;
const order = (o: Partial<Order>): Order => ({
  ref: `T-${++seq}`, outletId: 'OUT025', brand: 'Fresh', district: 'Gampaha', depot: 'Peliyagoda',
  dockType: 'rear_dock', parking: 'normal', temp: 'ambient', units: 40, weightKg: 300, volumeM3: 1.6,
  windowOpen: '05:00', windowClose: '08:00', deferredYesterday: false, daysSinceLastServed: 1, ...o,
});

test('trip time matches the booklet example: Fresh Gampaha, 2 rear docks + 1 street = 101 min', () => {
  assert.equal(tripMinutes('Gampaha', 'Fresh', ['rear_dock', 'rear_dock', 'street'], ctx), 101);
});

test('trip time matches the booklet example: Fresh Colombo, 4 street stops = 112 min', () => {
  assert.equal(tripMinutes('Colombo', 'Fresh', ['street', 'street', 'street', 'street'], ctx), 112);
});

test('two Fresh trips of 101 + 112 min fit the 270 min window; a third trip is refused', () => {
  const v = V('VEH001');
  const t1: Trip = { vehicleId: v.id, tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [order({}), order({}), order({ dockType: 'street' })] };
  const colombo = { district: 'Colombo', dockType: 'street' as const };
  const t2: Trip = { vehicleId: v.id, tripNo: 2, brand: 'Fresh', district: 'Colombo', orders: [order(colombo), order(colombo), order(colombo), order(colombo)] };
  assert.deepEqual(validatePlan([t1, t2], vehicles, ctx), []);
  const r = checkPlacement(order({ district: 'Kalutara' }), v, [t1, t2], ctx);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, 'MAX_TRIPS');
});

test('chilled goods need a refrigerated vehicle', () => {
  const r = checkPlacement(order({ temp: 'chilled' }), V('VEH008'), [], ctx);
  assert.equal(!r.ok && r.code, 'NEEDS_REEFER');
  assert.equal(checkPlacement(order({ temp: 'chilled' }), V('VEH001'), [], ctx).ok, true);
});

test('van-only outlets cannot be served by trucks', () => {
  const o = order({ outletId: 'OUT001', district: 'Colombo', parking: 'van_only' });
  assert.equal((r => !r.ok && r.code)(checkPlacement(o, V('VEH001'), [], ctx)), 'NEEDS_VAN');
  assert.equal(checkPlacement(o, V('VEH037'), [], ctx).ok, true);
});

test('a vehicle only serves its home depot', () => {
  const r = checkPlacement(order({ depot: 'Kandy', district: 'Kandy' }), V('VEH001'), [], ctx);
  assert.equal(!r.ok && r.code, 'WRONG_DEPOT');
});

test('vehicles in the workshop are refused', () => {
  const r = checkPlacement(order({}), { ...V('VEH001'), available: false }, [], ctx);
  assert.equal(!r.ok && r.code, 'VEHICLE_UNAVAILABLE');
});

test('weight and volume caps are both enforced, with a readable reason', () => {
  const van = V('VEH035'); // reefer van, 1,040 kg / 7.0 m3
  const t: Trip = { vehicleId: van.id, tripNo: 1, brand: 'Fresh', district: 'Colombo', orders: [order({ district: 'Colombo', weightKg: 851, temp: 'chilled' })] };
  const heavy = checkPlacement(order({ district: 'Colombo', weightKg: 302, temp: 'chilled' }), van, [t], ctx);
  assert.equal(!heavy.ok && heavy.code, 'OVER_WEIGHT');
  assert.match(!heavy.ok ? heavy.reason : '', /1,153 of 1,040 kg/);
  const bulky = checkPlacement(order({ district: 'Colombo', weightKg: 10, volumeM3: 6.5 }), van, [t], ctx);
  assert.equal(!bulky.ok && bulky.code, 'OVER_VOLUME');
});

test('one brand and one district per trip', () => {
  const v = V('VEH001');
  const t: Trip = { vehicleId: v.id, tripNo: 1, brand: 'Fresh', district: 'Gampaha', orders: [order({})] };
  assert.equal((r => !r.ok && r.code)(checkPlacement(order({ brand: 'Tech' }), v, [t], ctx, 1)), 'TRIP_MIXES_BRAND');
  assert.equal((r => !r.ok && r.code)(checkPlacement(order({ district: 'Colombo' }), v, [t], ctx, 1)), 'TRIP_MIXES_DISTRICT');
});

test('Fresh trips must fit the 270 min pre-dawn window', () => {
  const v = V('VEH001');
  // Matale is a Kandy district; use Peliyagoda's farthest: Puttalam 173 min outbound.
  const far = { district: 'Puttalam' };
  const t1: Trip = { vehicleId: v.id, tripNo: 1, brand: 'Fresh', district: 'Puttalam', orders: [order(far)] }; // 173 + 15 = 188
  const r = checkPlacement(order({ district: 'Kalutara' }), v, [t1], ctx); // 64 + 15 = 79 -> 267 fits
  assert.equal(r.ok, true);
  const r2 = checkPlacement(order({ district: 'Kurunegala' }), v, [t1], ctx); // 127 + 15 = 142 -> 330
  assert.equal(!r2.ok && r2.code, 'OVER_TIME_FRESH');
});

test('weekly fuel quota is enforced when fuel use is known', () => {
  const v = V('VEH001'); // 4.7 km/l, quota 340 L
  const r = checkPlacement(order({ district: 'Puttalam' }), v, [], { ...ctx, fuelUsedL: { VEH001: 300 } }); // 260 km / 4.7 = 55 L
  assert.equal(!r.ok && r.code, 'OVER_FUEL');
});

test('priority: skipped-yesterday first, then Fresh chilled, Fresh ambient, Tech, Style', () => {
  const list = [
    order({ ref: 'style', brand: 'Style' }), order({ ref: 'tech', brand: 'Tech' }), order({ ref: 'amb' }),
    order({ ref: 'chill', temp: 'chilled' }), order({ ref: 'skipped', deferredYesterday: true }),
  ];
  assert.deepEqual(sortByPriority(list).map((o) => o.ref), ['skipped', 'chill', 'amb', 'tech', 'style']);
  assert.equal(priorityRank(order({ daysSinceLastServed: 3 })), 1);
});

test('suggest plan on the official peak day (S1): every served trip is valid and every order has a decision', () => {
  const scen = csv('task2b_peak_day_scenarios.csv');
  const fleet = csv('task2b_peak_day_fleet.csv');
  const avail = new Set(fleet.filter((r) => r.status === 'available').map((r) => r.vehicle_id));
  const vs = csv('vehicles.csv').map((r) => vehicleFromRow(r, avail.has(r.vehicle_id!)));
  const orders = scen.map(orderFromScenarioRow);
  const plan = suggestPlan(orders, vs, ctx);
  const served = plan.trips.flatMap((t) => t.orders).length;
  assert.equal(served + plan.deferred.length, orders.length);
  assert.deepEqual(validatePlan(plan.trips, vs, ctx), []);
  // Fairness: every outlet skipped yesterday that can legally be served is served.
  const skippedDeferred = plan.deferred.filter((d) => d.order.deferredYesterday);
  for (const d of skippedDeferred) assert.equal(d.type, 'unavoidable');
});
