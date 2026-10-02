// Shared reads for the dock (loader) and the road (driver): the published plan's trips with their goods.
import type { Prisma } from '@prisma/client';
import { toMin, toHHMM, type Depot } from '@waypoint/shared';
import { prisma } from './db.ts';
import { dbDate } from './reference.ts';
import { displayRef } from './day.ts';

export const tripInclude = {
  vehicle: true,
  loadChecks: { orderBy: { at: 'asc' } },
  stops: {
    orderBy: { seq: 'asc' },
    include: { order: { include: { outlet: true, lines: { orderBy: { seq: 'asc' } } } } },
  },
} satisfies Prisma.TripInclude;
export type OpsTrip = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

export async function opsPlan(date: string, depot: Depot) {
  const plan = await prisma.plan.findUnique({
    where: { date_depot: { date: dbDate(date), depot } },
    include: { trips: { include: tripInclude, orderBy: [{ departAt: 'asc' }, { vehicleId: 'asc' }] } },
  });
  // Loaders and drivers only work from a plan that has been published at least once.
  return plan && plan.version > 0 ? plan : null;
}
export type OpsPlan = NonNullable<Awaited<ReturnType<typeof opsPlan>>>;

export const kindOf = (v: { temp: string; type: string }) => `${v.temp === 'reefer' ? 'Reefer' : 'Dry'} ${v.type}`;
export const sealByOf = (departAt: string) => toHHMM(toMin(departAt) - 15);
export const unitLabelOf = (brand: string) => (brand === 'Fresh' ? 'crates' : brand === 'Style' ? 'cartons' : 'items');
export const refOf = displayRef;

export const PROBLEM_LABEL: Record<string, string> = {
  damaged: 'damaged', short: 'short or missing', wrong_pack: 'in the wrong pack size', no_space: "that don't fit",
  wrong_temp: 'at the wrong temperature', vehicle: 'held by a vehicle problem', other: 'with a problem',
};

/** Which plan version first put each order on each vehicle (for "new in plan v2" tags). */
export async function versionsFor(planId: string) {
  const versions = await prisma.planVersion.findMany({ where: { planId }, orderBy: { version: 'asc' } });
  const firstSeen = new Map<string, number>();
  for (const v of versions) {
    for (const t of v.snapshot as { vehicleId: string; orderIds: string[] }[]) {
      for (const id of t.orderIds) if (!firstSeen.has(`${t.vehicleId}|${id}`)) firstSeen.set(`${t.vehicleId}|${id}`, v.version);
    }
  }
  return { versions, firstSeen };
}
