// The working day every screen shows, and the realistic orders that fill it.
//
// The day is today in Sri Lanka (Asia/Colombo), so the dispatcher, loader, driver and store all see the same
// date and clock. DEMO_DATE=YYYY-MM-DD pins it to one day instead (e.g. to rehearse the judge walkthrough).
//
// Each day gets the 85 Peliyagoda orders and workshop list of the official Task 2B peak-day scenario (S1),
// where chilled demand exceeds refrigerated capacity, so planning always shows real deferrals. The API
// builds a new day the first time it is asked for it (shortly after midnight), so the demo never runs dry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Brand, PrismaClient, Temp } from '@prisma/client';
import { parseCsv } from '../packages/shared/src/engine/reference.ts';
import { goodsLinesFor } from '../packages/shared/src/goods.ts';
import { dataDir, DEMO_STORE } from './accounts.ts';

const csv = (f: string) => parseCsv(readFileSync(join(dataDir(), f), 'utf8'));

/** Today in Colombo, or the pinned DEMO_DATE. */
export function demoDate(): string {
  const pinned = process.env.DEMO_DATE;
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const day = (iso: string, plus = 0) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d;
};
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** Goods lines (packs) for an order; packs add up to the order's units. */
export async function addLines(prisma: PrismaClient, order: { id: string; units: number; weightKg: number; temp: Temp }, brand: Brand, key: string) {
  const lines = goodsLinesFor(key, brand, order.temp, order.units, order.weightKg);
  await prisma.orderLine.createMany({ data: lines.map((l) => ({ orderId: order.id, seq: l.seq, product: l.product, pack: l.pack, packSize: l.packSize, packs: l.packs, ordered: l.ordered, weightKg: l.weightKg })) });
}

/**
 * Builds the scenario orders for one delivery day, once. Returns true when it created them.
 * `leaveOut`: scenario rows (e.g. S1-027) not to create, so a store can place that order live in a demo.
 */
export async function buildDemoDay(prisma: PrismaClient, iso: string, leaveOut: string[] = []): Promise<boolean> {
  const demo = day(iso);
  // Only the scenario rows count: store orders or after-cutoff orders may already sit on this date.
  if ((await prisma.order.count({ where: { deliveryDate: demo, sourceRef: { startsWith: 'S1-' } } })) > 0) return false;
  const scen = csv('task2b_peak_day_scenarios.csv').filter((r) => r.scenario === 'S1' && !leaveOut.includes(r.order_ref!));
  const placedAt = new Date(`${isoOf(day(iso, -1))}T09:30:00.000Z`); // 15:00 Colombo, before the cutoff
  for (const r of scen) {
    // An outlet with two orders (chilled + ambient) keeps its most recent delivery date.
    const lastServed = day(iso, -Number(r.days_since_last_served ?? 1));
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
    await addLines(prisma, created, r.brand as Brand, r.order_ref!);
    if (r.deferred_yesterday === '1') {
      // Yesterday's order for this outlet, deferred: this is what makes the outlet "skipped last run".
      const prev = await prisma.order.create({
        data: {
          outletId: r.outlet_id!, deliveryDate: day(iso, -1), temp: r.temp_requirement as Temp, units: Number(r.order_units),
          weightKg: Number(r.order_weight_kg), volumeM3: Number(r.order_volume_m3), status: 'deferred', sourceRef: `${r.order_ref}-prev`,
        },
      });
      await addLines(prisma, prev, r.brand as Brand, `${r.order_ref}-prev`);
      await prisma.deferral.create({
        data: { orderId: prev.id, reason: r.temp_requirement === 'chilled' ? 'no_reefer_capacity' : 'vehicle_full', type: 'unavoidable', newDate: demo, detail: 'Seeded history' },
      });
    }
  }
  // Three orders that arrived after the 16:00 cutoff: they go on the next run, and the queue shows them greyed out.
  const late = new Date(`${isoOf(day(iso, -1))}T10:50:00.000Z`); // 16:20 Colombo
  const nextRun = day(iso, 1);
  for (const [outletId, temp, units, kg, m3] of [['OUT014', 'ambient', 30, 276.0, 1.5], ['OUT047', 'ambient', 12, 180.4, 1.1], ['OUT061', 'chilled', 22, 154.2, 0.8]] as const) {
    const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) continue;
    const o = await prisma.order.create({ data: { outletId, deliveryDate: nextRun, temp, units, weightKg: kg, volumeM3: m3, status: 'placed', placedAt: late, note: 'Received after the 16:00 cutoff' } });
    await addLines(prisma, o, outlet.brand, `late-${outletId}`);
  }
  for (const r of csv('task2b_peak_day_fleet.csv').filter((f) => f.scenario === 'S1' && f.status === 'in_workshop')) {
    await prisma.vehicleDayStatus.upsert({
      where: { vehicleId_date: { vehicleId: r.vehicle_id!, date: demo } },
      update: { status: 'in_workshop' },
      create: { vehicleId: r.vehicle_id!, date: demo, status: 'in_workshop', note: 'Seeded from Task 2B fleet' },
    });
  }
  await buildStoreHistory(prisma, iso);
  return true;
}

/** The demo store's recent history (delivered and confirmed), so Orders and Receipts are not empty. Built once. */
async function buildStoreHistory(prisma: PrismaClient, iso: string) {
  if ((await prisma.receipt.count({ where: { order: { outletId: DEMO_STORE } } })) > 0) return;
  const store = await prisma.outlet.findUnique({ where: { id: DEMO_STORE } });
  if (!store) return;
  const history: [number, Temp, number, number, string, string, number][] = [
    // days before, temp, units, kg, delivered, confirmed, short units
    [2, 'ambient', 64, 520.4, '06:02', '06:20', 0],
    [2, 'chilled', 58, 410.8, '05:31', '05:48', 0],
    [4, 'chilled', 61, 433.0, '05:28', '06:05', 1],
    [4, 'ambient', 70, 566.2, '05:52', '06:14', 0],
  ];
  for (const [back, temp, units, kg, delivered, confirmed, short] of history) {
    const d = isoOf(day(iso, -back));
    const o = await prisma.order.create({
      data: { outletId: DEMO_STORE, deliveryDate: day(iso, -back), temp, units, weightKg: kg, volumeM3: Math.round(kg / 180 * 10) / 10, status: 'received', placedAt: new Date(`${isoOf(day(iso, -back - 1))}T08:40:00.000Z`), sourceRef: `hist-${DEMO_STORE}-${d}-${temp}` },
    });
    await addLines(prisma, o, store.brand, o.sourceRef!);
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
