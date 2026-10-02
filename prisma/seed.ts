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

const DRIVERS = ['Nimal Fernando', 'Saman Kumara', 'Ajith Perera', 'Chaminda Silva', 'Ruwan Jayasinghe', 'Pradeep Bandara', 'Mahesh Rathnayake', 'Kamal Wijesinghe', 'Dinesh Gunawardena', 'Lasantha Herath'];

async function main() {
  // ---- reference data
  for (const r of csv('outlets.csv')) {
    const data = {
      brand: r.brand as Brand, district: r.district!, depot: r.depot as Depot, dockType: r.dock_type as DockType,
      parking: r.parking_constraint as Parking, mallWindow: r.mall_window || null, windowOpen: r.window_open_time!, windowClose: r.window_close_time!,
    };
    await prisma.outlet.upsert({ where: { id: r.outlet_id! }, update: data, create: { id: r.outlet_id!, ...data } });
  }
  const vehicles = csv('vehicles.csv');
  for (const [i, r] of vehicles.entries()) {
    const data = {
      type: r.type as VehicleType, temp: r.temp as VehicleTemp, weightCapKg: Number(r.weight_cap_kg), volumeCapM3: Number(r.volume_cap_m3),
      depot: r.depot as Depot, kmPerL: Number(r.km_per_l), weeklyFuelQuotaL: Number(r.weekly_fuel_quota_l),
      driverName: r.vehicle_id === 'VEH036' ? 'Nimal Fernando' : DRIVERS[i % DRIVERS.length]!,
    };
    await prisma.vehicle.upsert({ where: { id: r.vehicle_id! }, update: data, create: { id: r.vehicle_id!, ...data } });
  }

  // ---- the four demo accounts (one per role)
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    { email: 'dispatcher@waypoint.demo', name: 'Ruwan Perera', role: 'dispatcher' as const, depot: 'Peliyagoda' as const },
    { email: 'loader@waypoint.demo', name: 'Kasun Silva', role: 'loader' as const, depot: 'Peliyagoda' as const },
    { email: 'driver@waypoint.demo', name: 'Nimal Fernando', role: 'driver' as const, depot: 'Peliyagoda' as const, vehicleId: 'VEH036' },
    { email: 'store@waypoint.demo', name: 'Dilani Jayawardena', role: 'store' as const, outletId: 'OUT012' },
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
      await prisma.order.create({
        data: {
          outletId: r.outlet_id!, deliveryDate: demo, temp: r.temp_requirement as Temp, units: Number(r.order_units),
          weightKg: Number(r.order_weight_kg), volumeM3: Number(r.order_volume_m3), status: 'locked', placedAt, sourceRef: r.order_ref,
        },
      });
      if (r.deferred_yesterday === '1') {
        // Yesterday's order for this outlet, deferred: this is what makes the outlet "skipped last run".
        const prev = await prisma.order.create({
          data: {
            outletId: r.outlet_id!, deliveryDate: day(DEMO_DATE, -1), temp: r.temp_requirement as Temp, units: Number(r.order_units),
            weightKg: Number(r.order_weight_kg), volumeM3: Number(r.order_volume_m3), status: 'deferred', sourceRef: `${r.order_ref}-prev`,
          },
        });
        await prisma.deferral.create({
          data: { orderId: prev.id, reason: r.temp_requirement === 'chilled' ? 'no_reefer_capacity' : 'vehicle_full', type: 'unavoidable', newDate: demo, detail: 'Seeded history' },
        });
      }
    }
    // Three orders that arrived after the 16:00 cutoff: they go on the next run, and the queue shows them greyed out.
    const late = new Date(`${day(DEMO_DATE, -1).toISOString().slice(0, 10)}T10:50:00.000Z`); // 16:20 Colombo
    const nextRun = day(DEMO_DATE, 1);
    for (const [outletId, temp, units, kg, m3] of [['OUT014', 'ambient', 30, 276.0, 1.5], ['OUT047', 'ambient', 12, 180.4, 1.1], ['OUT061', 'chilled', 22, 154.2, 0.8]] as const) {
      if (!(await prisma.outlet.findUnique({ where: { id: outletId } }))) continue;
      await prisma.order.create({ data: { outletId, deliveryDate: nextRun, temp, units, weightKg: kg, volumeM3: m3, status: 'placed', placedAt: late, note: 'Received after the 16:00 cutoff' } });
    }
    for (const r of csv('task2b_peak_day_fleet.csv').filter((f) => f.scenario === 'S1' && f.status === 'in_workshop')) {
      await prisma.vehicleDayStatus.upsert({
        where: { vehicleId_date: { vehicleId: r.vehicle_id!, date: demo } },
        update: { status: 'in_workshop' },
        create: { vehicleId: r.vehicle_id!, date: demo, status: 'in_workshop', note: 'Seeded from Task 2B fleet' },
      });
    }
  }

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
