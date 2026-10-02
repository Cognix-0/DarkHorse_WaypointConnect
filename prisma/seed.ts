// Seeds reference data from the competition CSVs and one realistic delivery day.
// Safe to run on every start: everything is an upsert or is rebuilt only when missing.
//
// Demo day = DEMO_DATE (default Wed 25 Mar 2026, a payday): the 85 Peliyagoda orders and the
// workshop list from the official Task 2B peak-day scenario, where chilled demand exceeds
// refrigerated capacity, so the judge walkthrough always shows real deferrals.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Brand, type Depot, type DockType, type Parking, type Temp, type VehicleTemp, type VehicleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseCsv } from '../packages/shared/src/engine/reference.ts';
import { goodsLinesFor } from '../packages/shared/src/goods.ts';

const prisma = new PrismaClient();
const DATA = join(process.cwd(), 'data');
const csv = (f: string) => parseCsv(readFileSync(join(DATA, f), 'utf8'));
const DEMO_DATE = process.env.DEMO_DATE ?? '2026-03-25';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'waypoint-demo';
const day = (iso: string, plus = 0) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d;
};

/** The demo store: Waypoint Fresh, Gampaha. On the demo day its dry order is delivered and its chilled order is deferred. */
const STORE_OUTLET = 'OUT026';
const FIRST = ['Ayesha', 'Dilani', 'Tharindu', 'Chamari', 'Sanjeewa', 'Nadeesha', 'Kavinda', 'Ishara', 'Roshan', 'Malsha', 'Supun', 'Hiruni', 'Asela', 'Fathima', 'Ravi', 'Priyanka'];
const LAST = ['Jayasinghe', 'Jayawardena', 'Perera', 'Fernando', 'Wickramasinghe', 'Rajapaksha', 'Senanayake', 'Abeysekara', 'Gunasekara', 'Dissanayake', 'Karunaratne', 'Mohamed', 'Nadarajah'];
const NOTES = ['Hill road, park on the left', 'Use the side lane; main road has no parking', 'Unload at the rear gate', 'Mall bay 2, call security on arrival', null, null, null];
const manager = (outletId: string) => {
  if (outletId === STORE_OUTLET) return { managerName: 'Nimali Perera', managerPhone: '+94 77 312 0026', deliveryNote: 'Unload at the rear gate' };
  const n = Number(outletId.replace(/\D/g, ''));
  return {
    managerName: `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
    managerPhone: `+94 7${n % 8} ${String(100 + ((n * 37) % 900))} ${String(1000 + ((n * 211) % 9000))}`,
    deliveryNote: NOTES[n % NOTES.length] ?? null,
  };
};

/** Goods lines (packs) for an order; packs add up to the order's units. */
async function addLines(order: { id: string; units: number; weightKg: number; temp: Temp }, brand: Brand, key: string) {
  const lines = goodsLinesFor(key, brand, order.temp, order.units, order.weightKg);
  await prisma.orderLine.createMany({ data: lines.map((l) => ({ orderId: order.id, seq: l.seq, product: l.product, pack: l.pack, packSize: l.packSize, packs: l.packs, ordered: l.ordered, weightKg: l.weightKg })) });
}

/** The demo driver's truck. On the demo day the engine plans it Kurunegala (trip 1) then Gampaha (trip 2, the demo store OUT026). */
const DRIVER_VEHICLE = 'VEH024';
const DRIVERS = ['Kusal Silva', 'Saman Kumara', 'Ajith Perera', 'Chaminda Silva', 'Ruwan Jayasinghe', 'Pradeep Bandara', 'Mahesh Rathnayake', 'Kamal Wijesinghe', 'Dinesh Gunawardena', 'Lasantha Herath'];

async function main() {
  // ---- reference data
  for (const r of csv('outlets.csv')) {
    const data = {
      brand: r.brand as Brand, district: r.district!, depot: r.depot as Depot, dockType: r.dock_type as DockType,
      parking: r.parking_constraint as Parking, mallWindow: r.mall_window || null, windowOpen: r.window_open_time!, windowClose: r.window_close_time!,
      ...manager(r.outlet_id!),
    };
    await prisma.outlet.upsert({ where: { id: r.outlet_id! }, update: data, create: { id: r.outlet_id!, ...data } });
  }
  const vehicles = csv('vehicles.csv');
  for (const [i, r] of vehicles.entries()) {
    const data = {
      type: r.type as VehicleType, temp: r.temp as VehicleTemp, weightCapKg: Number(r.weight_cap_kg), volumeCapM3: Number(r.volume_cap_m3),
      depot: r.depot as Depot, kmPerL: Number(r.km_per_l), weeklyFuelQuotaL: Number(r.weekly_fuel_quota_l),
      driverName: r.vehicle_id === DRIVER_VEHICLE ? 'Nimal Fernando' : DRIVERS[i % DRIVERS.length]!,
    };
    await prisma.vehicle.upsert({ where: { id: r.vehicle_id! }, update: data, create: { id: r.vehicle_id!, ...data } });
  }

  // ---- the four demo accounts (one per role)
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    { email: 'dispatcher@waypoint.demo', name: 'Ruwan Perera', role: 'dispatcher' as const, depot: 'Peliyagoda' as const },
    { email: 'loader@waypoint.demo', name: 'Kasun Silva', role: 'loader' as const, depot: 'Peliyagoda' as const },
    { email: 'driver@waypoint.demo', name: 'Nimal Fernando', role: 'driver' as const, depot: 'Peliyagoda' as const, vehicleId: DRIVER_VEHICLE },
    { email: 'store@waypoint.demo', name: 'Nimali Perera', role: 'store' as const, outletId: STORE_OUTLET },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: { ...u, passwordHash: hash }, create: { ...u, passwordHash: hash } });
  }

  // ---- demo delivery day (only built once)
  const demo = day(DEMO_DATE);
  const existing = await prisma.order.count({ where: { deliveryDate: demo } });
  if (existing === 0) {
    const scen = csv('task2b_peak_day_scenarios.csv').filter((r) => r.scenario === 'S1');
    const placedAt = new Date(`${day(DEMO_DATE, -1).toISOString().slice(0, 10)}T09:30:00.000Z`); // 15:00 Colombo, before the cutoff
    for (const r of scen) {
      // An outlet with two orders (chilled + ambient) keeps its most recent delivery date.
      const lastServed = day(DEMO_DATE, -Number(r.days_since_last_served ?? 1));
      const outlet = await prisma.outlet.findUnique({ where: { id: r.outlet_id! } });
      if (!outlet?.lastServedOn || outlet.lastServedOn < lastServed || outlet.lastServedOn >= demo) {
        await prisma.outlet.update({ where: { id: r.outlet_id! }, data: { lastServedOn: lastServed } });
      }
      const created = await prisma.order.create({
        data: {
          outletId: r.outlet_id!, deliveryDate: demo, temp: r.temp_requirement as Temp, units: Number(r.order_units),
          weightKg: Number(r.order_weight_kg), volumeM3: Number(r.order_volume_m3), status: 'locked', placedAt, sourceRef: r.order_ref,
        },
      });
      await addLines(created, r.brand as Brand, r.order_ref!);
      if (r.deferred_yesterday === '1') {
        // Yesterday's order for this outlet, deferred: this is what makes the outlet "skipped last run".
        const prev = await prisma.order.create({
          data: {
            outletId: r.outlet_id!, deliveryDate: day(DEMO_DATE, -1), temp: r.temp_requirement as Temp, units: Number(r.order_units),
            weightKg: Number(r.order_weight_kg), volumeM3: Number(r.order_volume_m3), status: 'deferred', sourceRef: `${r.order_ref}-prev`,
          },
        });
        await addLines(prev, r.brand as Brand, `${r.order_ref}-prev`);
        await prisma.deferral.create({
          data: { orderId: prev.id, reason: r.temp_requirement === 'chilled' ? 'no_reefer_capacity' : 'vehicle_full', type: 'unavoidable', newDate: demo, detail: 'Seeded history' },
        });
      }
    }
    // Three orders that arrived after the 16:00 cutoff: they go on the next run, and the queue shows them greyed out.
    const late = new Date(`${day(DEMO_DATE, -1).toISOString().slice(0, 10)}T10:50:00.000Z`); // 16:20 Colombo
    const nextRun = day(DEMO_DATE, 1);
    for (const [outletId, temp, units, kg, m3] of [['OUT014', 'ambient', 30, 276.0, 1.5], ['OUT047', 'ambient', 12, 180.4, 1.1], ['OUT061', 'chilled', 22, 154.2, 0.8]] as const) {
      const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) continue;
      const o = await prisma.order.create({ data: { outletId, deliveryDate: nextRun, temp, units, weightKg: kg, volumeM3: m3, status: 'placed', placedAt: late, note: 'Received after the 16:00 cutoff' } });
      await addLines(o, outlet.brand, `late-${outletId}`);
    }
    for (const r of csv('task2b_peak_day_fleet.csv').filter((f) => f.scenario === 'S1' && f.status === 'in_workshop')) {
      await prisma.vehicleDayStatus.upsert({
        where: { vehicleId_date: { vehicleId: r.vehicle_id!, date: demo } },
        update: { status: 'in_workshop' },
        create: { vehicleId: r.vehicle_id!, date: demo, status: 'in_workshop', note: 'Seeded from Task 2B fleet' },
      });
    }
  }

  // The demo store's recent history (delivered and confirmed), so Orders and Receipts are not empty.
  if ((await prisma.receipt.count({ where: { order: { outletId: STORE_OUTLET } } })) === 0) {
    const store = await prisma.outlet.findUnique({ where: { id: STORE_OUTLET } });
    if (store) {
      const history: [number, Temp, number, number, string, string, number][] = [
        // days before, temp, units, kg, delivered, confirmed, short units
        [2, 'ambient', 64, 520.4, '06:02', '06:20', 0],
        [2, 'chilled', 58, 410.8, '05:31', '05:48', 0],
        [4, 'chilled', 61, 433.0, '05:28', '06:05', 1],
        [4, 'ambient', 70, 566.2, '05:52', '06:14', 0],
      ];
      for (const [back, temp, units, kg, delivered, confirmed, short] of history) {
        const d = day(DEMO_DATE, -back).toISOString().slice(0, 10);
        const o = await prisma.order.create({
          data: { outletId: STORE_OUTLET, deliveryDate: day(DEMO_DATE, -back), temp, units, weightKg: kg, volumeM3: Math.round(kg / 180 * 10) / 10, status: 'received', placedAt: new Date(`${day(DEMO_DATE, -back - 1).toISOString().slice(0, 10)}T08:40:00.000Z`), sourceRef: `hist-${STORE_OUTLET}-${d}-${temp}` },
        });
        await addLines(o, store.brand, o.sourceRef!);
        const lines = await prisma.orderLine.findMany({ where: { orderId: o.id }, orderBy: { seq: 'asc' } });
        await prisma.receipt.create({
          data: {
            orderId: o.id, confirmed: true, byName: 'Nimali Perera',
            deliveredAt: new Date(`${d}T${delivered}:00+05:30`), at: new Date(`${d}T${confirmed}:00+05:30`),
            issue: short ? 'missing' : null, issueUnits: short || null, note: short ? `${lines[0]!.product}: 1 short · resolved (sent on the next run)` : null,
            lines: lines.map((l, i) => ({ lineId: l.id, product: l.product, ordered: l.packs, received: i === 0 ? l.packs - short : l.packs, status: i === 0 && short ? 'short' : 'ok' })),
          },
        });
      }
    }
  }

  // Older databases (before goods lines existed): give every order its lines.
  const withoutLines = (await prisma.order.findMany({ include: { outlet: true, lines: { select: { id: true } } } })).filter((o) => o.lines.length === 0);
  for (const o of withoutLines) await addLines(o, o.outlet.brand, o.sourceRef ?? o.id);

  const counts = {
    outlets: await prisma.outlet.count(), vehicles: await prisma.vehicle.count(), users: await prisma.user.count(),
    demoOrders: await prisma.order.count({ where: { deliveryDate: demo } }),
    inWorkshop: await prisma.vehicleDayStatus.count({ where: { date: demo } }),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
