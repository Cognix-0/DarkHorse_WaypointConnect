// Demo mode, switched on and off by the admin (Admin → Demo mode). While it is on, every screen runs on the
// official peak day (Wed 25 Mar 2026, payday, chilled overload) with each role at the right hour of that day;
// it switches itself off when its time is up, and the system goes back to the real Sri Lanka date and time.
//
// The demo story: store OUT026 places its dry order the afternoon before (its scenario order is left out so it is
// placed live), the dispatcher plans it onto VEH024 trip 2 and handles the chilled deferrals, the loader loads,
// the driver delivers trip 1 then trip 2 at the store, and the store confirms receipt.
import type { Prisma } from '@prisma/client';
import { prisma } from './db.ts';
import { buildDemoDay } from '../../../prisma/demo-day.ts';

export const DEMO_DAY = '2026-03-25';
/** Each role at its moment of the demo day: loaders before the 03:30 departures, the dispatcher's live view
 * during the delivery window, the store manager the afternoon before (before the 16:00 cutoff). */
export const DEMO_CLOCKS = { dispatcher: '06:42', loader: '02:40', store: '14:18' };
export const DEMO_STORE = 'OUT026';
/** OUT026's dry order in the scenario: left out so the store places it live. */
export const DEMO_LIVE_ORDER = 'S1-027';

export interface DemoState {
  active: boolean;
  date: string;
  /** the store manager's day: the day before the demo run (orders for the run are placed then) */
  storeDate: string;
  clocks: typeof DEMO_CLOCKS;
  startedAt: string;
  endsAt: string;
  /** outlets' last-served dates before the demo, put back when it ends */
  lastServed: Record<string, string | null>;
}

const KEY = 'demo';
let state: DemoState | null = null;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The running demo, or null (off, or its time is up). Read on every request, so it must stay synchronous. */
export function demo(): DemoState | null {
  return state?.active && Date.parse(state.endsAt) > Date.now() ? state : null;
}

export async function loadDemo() {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  state = (row?.value as unknown as DemoState | undefined) ?? null;
}

async function save(next: DemoState | null) {
  state = next;
  const value = (next ?? { active: false }) as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

/** Clears everything that happened on the demo days and builds the starting point again. */
export async function resetDemoData() {
  const from = dbDate(addDays(DEMO_DAY, -1));
  const to = dbDate(addDays(DEMO_DAY, 1));
  const plans = await prisma.plan.findMany({ where: { date: { gte: from, lte: to } }, select: { id: true } });
  const planIds = plans.map((p) => p.id);
  const orders = await prisma.order.findMany({ where: { deliveryDate: { gte: from, lte: to } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.$transaction([
    prisma.deliveryEvent.deleteMany({ where: { OR: [{ stop: { trip: { planId: { in: planIds } } } }, { stop: { orderId: { in: orderIds } } }] } }),
    prisma.deferral.deleteMany({ where: { OR: [{ planId: { in: planIds } }, { orderId: { in: orderIds } }] } }),
    prisma.loadCheck.deleteMany({ where: { OR: [{ trip: { planId: { in: planIds } } }, { orderId: { in: orderIds } }] } }),
    prisma.tripStop.deleteMany({ where: { OR: [{ trip: { planId: { in: planIds } } }, { orderId: { in: orderIds } }] } }),
    prisma.planVersion.deleteMany({ where: { planId: { in: planIds } } }),
    prisma.planAck.deleteMany({ where: { planId: { in: planIds } } }),
    prisma.loadMove.deleteMany({ where: { planId: { in: planIds } } }),
    prisma.plan.deleteMany({ where: { id: { in: planIds } } }),
    prisma.receipt.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.vehicleDayStatus.deleteMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  // Messages and alerts about those days
  await prisma.$executeRaw`DELETE FROM "Notification" WHERE refs->>'date' BETWEEN ${addDays(DEMO_DAY, -1)} AND ${addDays(DEMO_DAY, 1)} OR refs->>'orderId' = ANY(${orderIds})`;
  await buildDemoDay(prisma, DEMO_DAY, [DEMO_LIVE_ORDER]);
}

export async function startDemo(hours: number, reset: boolean): Promise<DemoState> {
  const running = demo();
  const lastServed = running?.lastServed
    ?? Object.fromEntries((await prisma.outlet.findMany({ select: { id: true, lastServedOn: true } })).map((o) => [o.id, o.lastServedOn?.toISOString().slice(0, 10) ?? null]));
  if (reset || !running) await resetDemoData();
  const now = Date.now();
  const next: DemoState = {
    active: true, date: DEMO_DAY, storeDate: addDays(DEMO_DAY, -1), clocks: DEMO_CLOCKS,
    startedAt: running?.startedAt ?? new Date(now).toISOString(), endsAt: new Date(now + hours * 3_600_000).toISOString(), lastServed,
  };
  await save(next);
  return next;
}

/** Back to the real date and time. The demo days' data stays (it is in March) until the next reset. */
export async function endDemo() {
  const was = state;
  await save(null);
  if (was?.lastServed) {
    for (const [id, d] of Object.entries(was.lastServed)) {
      await prisma.outlet.update({ where: { id }, data: { lastServedOn: d ? dbDate(d) : null } }).catch(() => {});
    }
  }
}

/** Called every 30 s: a demo whose time is up is switched off properly (last-served dates put back). */
export async function expireDemo(): Promise<boolean> {
  if (state?.active && Date.parse(state.endsAt) <= Date.now()) { await endDemo(); return true; }
  return false;
}
