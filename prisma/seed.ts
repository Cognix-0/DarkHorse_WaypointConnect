// Seeds reference data from the competition CSVs, every sign-in account, and today's delivery day.
// Safe to run on every start: everything is an upsert or is rebuilt only when missing.
//
// Accounts and passwords: prisma/accounts.ts. The delivery day: prisma/demo-day.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Brand, type Depot, type DockType, type Parking, type VehicleTemp, type VehicleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseCsv } from '../packages/shared/src/engine/reference.ts';
import { allAccounts, driverNames, EMAIL_DOMAIN, passwordFor, storeManager, DEMO_STORE } from './accounts.ts';
import { addLines, buildDemoDay, demoDate } from './demo-day.ts';

const prisma = new PrismaClient();
const DATA = join(process.cwd(), 'data');
const csv = (f: string) => parseCsv(readFileSync(join(DATA, f), 'utf8'));

const NOTES = ['Hill road, park on the left', 'Use the side lane; main road has no parking', 'Unload at the rear gate', 'Mall bay 2, call security on arrival', null, null, null];
const contact = (outletId: string) => {
  if (outletId === DEMO_STORE) return { managerName: storeManager(outletId), managerPhone: '+94 77 312 0026', deliveryNote: 'Unload at the rear gate' };
  const n = Number(outletId.replace(/\D/g, ''));
  return {
    managerName: storeManager(outletId),
    managerPhone: `+94 7${n % 8} ${String(100 + ((n * 37) % 900))} ${String(1000 + ((n * 211) % 9000))}`,
    deliveryNote: NOTES[n % NOTES.length] ?? null,
  };
};

async function main() {
  // ---- reference data
  for (const r of csv('outlets.csv')) {
    const data = {
      brand: r.brand as Brand, district: r.district!, depot: r.depot as Depot, dockType: r.dock_type as DockType,
      parking: r.parking_constraint as Parking, mallWindow: r.mall_window || null, windowOpen: r.window_open_time!, windowClose: r.window_close_time!,
      ...contact(r.outlet_id!),
    };
    await prisma.outlet.upsert({ where: { id: r.outlet_id! }, update: data, create: { id: r.outlet_id!, ...data } });
  }
  // Every vehicle has its own assigned driver (never one person on two vehicles).
  const vehicles = csv('vehicles.csv');
  const drivers = driverNames(vehicles.map((v) => v.vehicle_id!));
  for (const r of vehicles) {
    const data = {
      type: r.type as VehicleType, temp: r.temp as VehicleTemp, weightCapKg: Number(r.weight_cap_kg), volumeCapM3: Number(r.volume_cap_m3),
      depot: r.depot as Depot, kmPerL: Number(r.km_per_l), weeklyFuelQuotaL: Number(r.weekly_fuel_quota_l),
      driverName: drivers.get(r.vehicle_id!)!,
    };
    await prisma.vehicle.upsert({ where: { id: r.vehicle_id! }, update: data, create: { id: r.vehicle_id!, ...data } });
  }

  // ---- accounts: one per vehicle, store, depot dispatcher and depot loader, each with its own password
  const accounts = allAccounts();
  for (const a of accounts) {
    const passwordHash = await bcrypt.hash(passwordFor(a.email), 8);
    await prisma.user.upsert({ where: { email: a.email }, update: { ...a, passwordHash }, create: { ...a, passwordHash } });
  }
  // The old shared logins (dispatcher@ / loader@ / driver@ / store@waypoint.demo) and any account no longer in the list.
  await prisma.user.deleteMany({ where: { email: { notIn: accounts.map((a) => a.email) } } });

  // ---- today's delivery day
  const date = demoDate();
  await buildDemoDay(prisma, date);

  // Older databases (before goods lines existed): give every order its lines.
  const withoutLines = (await prisma.order.findMany({ include: { outlet: true, lines: { select: { id: true } } } })).filter((o) => o.lines.length === 0);
  for (const o of withoutLines) await addLines(prisma, o, o.outlet.brand, o.sourceRef ?? o.id);

  const d = new Date(`${date}T00:00:00.000Z`);
  const counts = {
    date, outlets: await prisma.outlet.count(), vehicles: await prisma.vehicle.count(),
    users: await prisma.user.count({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }),
    orders: await prisma.order.count({ where: { deliveryDate: d } }),
    inWorkshop: await prisma.vehicleDayStatus.count({ where: { date: d } }),
  };
  console.log('Seed complete:', counts, '· passwords: pnpm credentials');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
