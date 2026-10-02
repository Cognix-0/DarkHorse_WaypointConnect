// Loader dock tablet (L1–L5): choose a vehicle, tick goods, report problems, follow plan changes, seal & release.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { toMin, type Depot } from '@waypoint/shared';
import {
  ReportProblemRequest, SealRequest, TickLineRequest,
  type TLoaderTripDetail, type TLoaderVehicleCard, type TLoaderVehiclesResponse, type TPlanChangeRow, type TPlanChangesResponse,
} from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { calendar, clockOf, DEMO_DATE, dbDate, loaderNow, nextOperatingDay, shortDate } from '../reference.ts';
import { HttpError, copyLines } from '../plans.ts';
import { alertDispatcher, emit, notifyStore } from '../events.ts';
import { kindOf, opsPlan, PROBLEM_LABEL, refOf, sealByOf, versionsFor, type OpsPlan, type OpsTrip } from '../ops.ts';

const dayOf = (req: FastifyRequest) => {
  const q = req.query as { date?: string };
  return { date: q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : DEMO_DATE, depot: (req.user.depot ?? 'Peliyagoda') as Depot };
};

const lineDone = (l: { loadedAt: Date | null; shortPacks: number; packs: number }) => !!l.loadedAt || l.shortPacks >= l.packs;
const tripLines = (t: OpsTrip) => t.stops.flatMap((s) => s.order.lines);

function card(t: OpsTrip, plan: OpsPlan, me: string, now: string): TLoaderVehicleCard {
  const lines = tripLines(t);
  const done = lines.filter(lineDone).length;
  const temps = [...new Set<'ambient' | 'chilled'>(t.stops.map((s) => s.order.temp))];
  let status: TLoaderVehicleCard['status'];
  let note: string | null = null;
  if (t.departedAt) { status = 'departed'; note = `Left the dock ${clockOf(t.departedAt)}`; }
  else if (t.sealedAt) { status = 'sealed'; note = `Sealed ${clockOf(t.sealedAt)} · waiting for the driver`; }
  else if (t.heldAt) { status = 'held'; note = 'Held for the dispatcher'; }
  else if (t.loaderId || done > 0) { status = 'loading'; }
  else {
    // A bay serves one vehicle at a time: wait for an earlier, unsealed vehicle in the same bay.
    const before = plan.trips.find((x) => x.id !== t.id && x.bay === t.bay && !x.sealedAt && x.departAt < t.departAt);
    const soon = toMin(t.departAt) - toMin(now) <= 180;
    if (before) { status = 'waiting'; note = `After ${before.vehicleId} in Bay ${t.bay}`; }
    else if (t.brand !== 'Fresh' && !soon) { status = 'waiting'; note = 'Day shift'; }
    else { status = 'ready'; note = 'Ready to load'; }
  }
  const tripCount = plan.trips.filter((x) => x.vehicleId === t.vehicleId).length;
  return {
    tripId: t.id, vehicleId: t.vehicleId, tripNo: t.tripNo, bay: t.bay || 1,
    kind: kindOf(t.vehicle), brands: [t.brand], temps, departAt: t.departAt, sealBy: sealByOf(t.departAt),
    route: `${kindOf(t.vehicle)} · ${t.district}${tripCount > 1 ? ` · trip ${t.tripNo}` : ''}`,
    stops: t.stops.length, items: lines.length, itemsDone: done,
    weightKg: Math.round(t.stops.reduce((s, x) => s + x.order.weightKg, 0)),
    status, loaderName: t.loaderName, isMine: t.loaderId === me, note,
  };
}

async function findTrip(id: string, depot: Depot) {
  const t = await prisma.trip.findUnique({ where: { id }, include: { plan: true } });
  if (!t || t.plan.depot !== depot) throw new HttpError(404, 'That vehicle is not on your depot plan.');
  return t;
}

/** Diff between the version this loader last acknowledged (or v1) and the current published version. */
async function changes(plan: OpsPlan, userId: string): Promise<TPlanChangesResponse> {
  const { versions } = await versionsFor(plan.id);
  const acks = await prisma.planAck.findMany({ where: { planId: plan.id, userId }, orderBy: { version: 'desc' } });
  const to = plan.version;
  const acked = acks[0]?.version ?? 0;
  const from = Math.max(1, Math.min(acked || 1, to));
  const snap = (v: number) => {
    const m = new Map<string, string>();
    for (const t of (versions.find((x) => x.version === v)?.snapshot ?? []) as { vehicleId: string; orderIds: string[] }[]) for (const id of t.orderIds) m.set(id, t.vehicleId);
    return m;
  };
  const a = snap(from === to ? Math.max(1, to - 1) : from);
  const b = snap(to);
  const moves = await prisma.loadMove.findMany({ where: { planId: plan.id, version: to } });
  const ids = [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id));
  const orders = await prisma.order.findMany({ where: { id: { in: ids } }, include: { outlet: true, lines: { orderBy: { seq: 'asc' } } } });
  const vehicles = new Map<string, { temp: string }>((await prisma.vehicle.findMany()).map((v) => [v.id, v]));
  const startedVehicles = new Set(plan.trips.filter((t) => t.loaderId || tripLines(t).some((l) => l.loadedAt)).map((t) => t.vehicleId));
  const rows: TPlanChangeRow[] = orders.map((o) => {
    const fromV = a.get(o.id) ?? null;
    const toV = b.get(o.id) ?? null;
    const moved = moves.find((m) => m.orderId === o.id);
    const picked = (fromV && startedVehicles.has(fromV)) || o.lines.some((l) => l.loadedAt);
    const state: TPlanChangeRow['state'] = !fromV ? 'added' : moved ? 'moved' : picked ? 'to_move' : 'not_picked';
    const k = (id: string | null) => (id ? (vehicles.get(id)?.temp === 'reefer' ? 'reefer' : 'dry') : null);
    const hint = !fromV ? 'freed space' : !toV ? 'deferred to the next run' : `${k(fromV)} → ${k(toV)}`;
    return {
      orderId: o.id, orderRef: refOf(o), outletId: o.outletId, district: o.outlet.district,
      goods: o.lines.slice(0, 2).map((l) => `${l.product} ${l.packSize} × ${l.packs} ${l.pack}`).join(' · ') + (o.lines.length > 2 ? ` +${o.lines.length - 2}` : ''),
      from: fromV ?? 'Unassigned', to: toV ?? 'Next run', hint, state, movedAt: moved?.movedAt.toISOString() ?? null,
    };
  }).sort((x, y) => ['to_move', 'added', 'moved', 'not_picked'].indexOf(x.state) - ['to_move', 'added', 'moved', 'not_picked'].indexOf(y.state) || x.orderRef.localeCompare(y.orderRef));
  const cal = calendar.get(plan.date.toISOString().slice(0, 10));
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  return {
    date: plan.date.toISOString().slice(0, 10), fromVersion: from === to ? Math.max(1, to - 1) : from, toVersion: to,
    publishedAt: plan.publishedAt?.toISOString() ?? null,
    reason: to <= 1 ? 'This is the first plan for the night. Nothing has changed.' : `The dispatcher moved ${rows.length} order(s) between vehicles${cal?.payday ? ' to fit the payday chilled peak' : ''}. Move goods that are already picked before those vehicles load.`,
    acknowledged: acked >= to,
    counts: { all: rows.length, toMove: count('to_move'), moved: count('moved'), added: count('added'), notPicked: count('not_picked') },
    rows,
  };
}

export async function loaderRoutes(app: FastifyInstance) {
  const loader = { preHandler: requireRole('loader') };

  // L1 Choose vehicle
  app.get('/loader/vehicles', loader, async (req): Promise<TLoaderVehiclesResponse> => {
    const { date, depot } = dayOf(req);
    const plan = await opsPlan(date, depot);
    const now = loaderNow();
    if (!plan) return { date, now, depot, published: false, planVersion: 0, payday: !!calendar.get(date)?.payday, changes: { fromVersion: 0, toVersion: 0, changed: 0, toMove: 0, acknowledged: true }, vehicles: [] };
    const ch = await changes(plan, req.user.id);
    return {
      date, now, depot, published: true, planVersion: plan.version, payday: !!calendar.get(date)?.payday,
      changes: { fromVersion: ch.fromVersion, toVersion: ch.toVersion, changed: ch.counts.all, toMove: ch.counts.toMove, acknowledged: ch.acknowledged },
      vehicles: plan.trips.map((t) => card(t, plan, req.user.id, now)),
    };
  });

  // L2 Load goods (stops in load order: the last stop goes on first)
  app.get('/loader/trips/:id', loader, async (req): Promise<TLoaderTripDetail> => {
    const { date, depot } = dayOf(req);
    const plan = await opsPlan(date, depot);
    const t = plan?.trips.find((x) => x.id === (req.params as { id: string }).id);
    if (!plan || !t) throw new HttpError(404, 'That vehicle is not on tonight’s published plan.');
    const { firstSeen } = await versionsFor(plan.id);
    const lineById = new Map<string, { product: string; packSize: string }>(tripLines(t).map((l) => [l.id, l]));
    return {
      card: card(t, plan, req.user.id, loaderNow()), date, now: loaderNow(), planVersion: plan.version,
      driverName: t.vehicle.driverName,
      reefer: t.vehicle.temp === 'reefer' ? { range: '2–4 °C', lastTempC: t.reeferTempC } : null,
      sealNo: t.sealNo,
      stops: [...t.stops].reverse().map((s, i) => {
        const v = firstSeen.get(`${t.vehicleId}|${s.orderId}`);
        return {
          stopSeq: s.seq, loadOrder: i + 1, orderId: s.orderId, orderRef: refOf(s.order), outletId: s.order.outletId, district: s.order.outlet.district,
          brand: s.order.outlet.brand, temp: s.order.temp, windowOpen: s.order.outlet.windowOpen, windowClose: s.order.outlet.windowClose,
          units: s.order.units, weightKg: s.order.weightKg, newInVersion: v && v > 1 ? v : null,
          lines: s.order.lines.map((l) => ({
            id: l.id, seq: l.seq, product: l.product, pack: l.pack, packSize: l.packSize, packs: l.packs, ordered: l.ordered, weightKg: l.weightKg,
            loadedAt: l.loadedAt?.toISOString() ?? null, shortPacks: l.shortPacks, problem: (l.problem as never) ?? null,
          })),
        };
      }),
      problems: t.loadChecks.map((c) => {
        const l = c.lineId ? lineById.get(c.lineId) : undefined;
        const stop = t.stops.find((s) => s.orderId === c.orderId);
        return {
          id: c.id, lineId: c.lineId, orderRef: stop ? refOf(stop.order) : '', outletId: stop?.order.outletId ?? '', product: l?.product ?? 'Goods',
          packs: c.shortUnits, packSize: l?.packSize ?? '', problem: (c.problem ?? 'other') as never, action: (c.action ?? 'carry_over') as never, note: c.note, at: c.at.toISOString(),
        };
      }),
    };
  });

  // Claim the vehicle so two loaders don't load the same truck.
  app.post('/loader/trips/:id/claim', loader, async (req) => {
    const t = await findTrip((req.params as { id: string }).id, dayOf(req).depot);
    if (t.sealedAt) throw new HttpError(409, `${t.vehicleId} is already sealed.`);
    if (t.loaderId && t.loaderId !== req.user.id && !(req.body as { takeOver?: boolean } | undefined)?.takeOver) {
      throw new HttpError(409, `${t.loaderName} is loading ${t.vehicleId}.`, { code: 'TAKEN', loaderName: t.loaderName });
    }
    await prisma.trip.update({ where: { id: t.id }, data: { loaderId: req.user.id, loaderName: req.user.name, loadingStartedAt: t.loadingStartedAt ?? new Date(), loadStatus: 'loading' } });
    return { ok: true };
  });

  // Tick (or untick) one goods line
  app.post('/loader/lines/:id/tick', loader, async (req) => {
    const { loaded } = TickLineRequest.parse(req.body);
    const line = await prisma.orderLine.findUnique({ where: { id: (req.params as { id: string }).id }, include: { order: { include: { stop: { include: { trip: true } } } } } });
    const trip = line?.order.stop?.trip;
    if (!line || !trip) throw new HttpError(404, 'Goods line not found on a planned trip.');
    if (trip.sealedAt) throw new HttpError(409, `${trip.vehicleId} is sealed. Ask the dispatcher to reopen it.`);
    await prisma.orderLine.update({ where: { id: line.id }, data: { loadedAt: loaded ? new Date() : null } });
    if (!trip.loaderId) await prisma.trip.update({ where: { id: trip.id }, data: { loaderId: req.user.id, loaderName: req.user.name, loadingStartedAt: new Date(), loadStatus: 'loading' } });
    emit('load.progress', `${trip.vehicleId}: ${line.product} ${loaded ? 'loaded' : 'unticked'}`, { tripId: trip.id });
    return { ok: true };
  });

  // L3 Report a problem
  app.post('/loader/trips/:id/problems', loader, async (req) => {
    const { date, depot } = dayOf(req);
    const body = ReportProblemRequest.parse(req.body);
    const trip = await findTrip((req.params as { id: string }).id, depot);
    const line = await prisma.orderLine.findUnique({ where: { id: body.lineId }, include: { order: { include: { outlet: true } } } });
    if (!line) throw new HttpError(404, 'Goods line not found.');
    const packs = Math.min(body.packs, line.packs);
    const nextRun = nextOperatingDay(date);
    if (body.action === 'carry_over') {
      // the rest of the line goes on the truck now
      await prisma.orderLine.update({ where: { id: line.id }, data: { shortPacks: packs, problem: body.problem, loadedAt: packs < line.packs ? new Date() : line.loadedAt } });
    } else {
      await prisma.orderLine.update({ where: { id: line.id }, data: { problem: body.problem } });
    }
    if (body.action === 'hold') await prisma.trip.update({ where: { id: trip.id }, data: { heldAt: new Date() } });
    await prisma.loadCheck.create({
      data: { tripId: trip.id, orderId: line.orderId, lineId: line.id, shortUnits: packs, problem: body.problem, action: body.action, note: body.note ?? null, photo: body.photo ?? null, byUserId: req.user.id, byName: req.user.name },
    });
    const ref = refOf(line.order);
    const what = `${packs} ${line.pack} of ${line.product} (${line.packSize}) ${PROBLEM_LABEL[body.problem]}`;
    const next = body.action === 'carry_over' ? `${trip.vehicleId} leaves at ${trip.departAt} with the rest; the ${packs} ${line.pack} go on the ${shortDate(nextRun)} run.`
      : body.action === 'replace' ? 'The loader is replacing them from stock; departure may slip.' : `${trip.vehicleId} is held at the dock until you decide.`;
    await alertDispatcher('loader_flag', `${trip.vehicleId} · ${depot} dock · ${loaderNow()}`, `Loader reported ${what} for ${ref} (${line.order.outletId}). ${next}`, { date, outletId: line.order.outletId, tripId: trip.id, orderId: line.orderId });
    if (body.action === 'carry_over') {
      await notifyStore(line.order.outletId, 'load.shortfall', `${packs} ${line.pack} of ${line.product} come on ${shortDate(nextRun)}`,
        `They were ${PROBLEM_LABEL[body.problem]} at loading. The rest of ${ref} arrives as planned today.`, { date, orderId: line.orderId });
    }
    emit('load.shortfall', `${trip.vehicleId}: ${what}`, { tripId: trip.id, outletId: line.order.outletId });
    return { ok: true };
  });

  // L5 Seal & release
  app.post('/loader/trips/:id/seal', loader, async (req) => {
    const { date, depot } = dayOf(req);
    const body = SealRequest.parse(req.body);
    const plan = await opsPlan(date, depot);
    const t = plan?.trips.find((x) => x.id === (req.params as { id: string }).id);
    if (!plan || !t) throw new HttpError(404, 'That vehicle is not on tonight’s published plan.');
    if (t.sealedAt) throw new HttpError(409, `${t.vehicleId} is already sealed.`);
    const open = tripLines(t).filter((l) => !lineDone(l));
    if (open.length) throw new HttpError(422, `${open.length} item(s) are not ticked or reported yet.`, { lineIds: open.map((l) => l.id) });
    if (t.vehicle.temp === 'reefer' && body.reeferTempC == null) throw new HttpError(400, 'Log the reefer temperature before sealing.');

    const nextRun = nextOperatingDay(date);
    // Short packs (carry over) become an order on the next run with only those packs.
    const carried: string[] = [];
    for (const s of t.stops) {
      const short = s.order.lines.filter((l) => l.shortPacks > 0);
      if (!short.length) continue;
      const ref = `short:${s.orderId}`;
      if (await prisma.order.findFirst({ where: { sourceRef: ref } })) continue;
      const packs = short.reduce((n, l) => n + l.shortPacks, 0);
      const kg = short.reduce((n, l) => n + (l.weightKg * l.shortPacks) / Math.max(1, l.packs), 0);
      const o = await prisma.order.create({
        data: {
          outletId: s.order.outletId, deliveryDate: dbDate(nextRun), temp: s.order.temp, units: packs, weightKg: Math.round(kg * 10) / 10,
          volumeM3: Math.round((s.order.volumeM3 * packs) / Math.max(1, s.order.units) * 100) / 100, status: 'locked', placedAt: s.order.placedAt,
          sourceRef: ref, note: body.carryOverNote ?? `Short from ${refOf(s.order)} on ${shortDate(date)}`,
        },
      });
      await copyLines(s.orderId, o.id, short.map((l) => ({ lineId: l.id, packs: l.shortPacks })));
      carried.push(`${s.order.outletId} (${packs} ${short[0]!.pack})`);
    }
    await prisma.trip.update({ where: { id: t.id }, data: { sealedAt: new Date(), sealNo: body.sealNo, reeferTempC: body.reeferTempC, loadStatus: 'sealed', heldAt: null } });
    await prisma.order.updateMany({ where: { id: { in: t.stops.map((s) => s.orderId) } }, data: { status: 'loaded' } });
    const shortItems = tripLines(t).filter((l) => l.shortPacks > 0).length;
    await alertDispatcher('info', `${t.vehicleId} sealed · ${loaderNow()}`,
      `${tripLines(t).length - shortItems} items loaded${shortItems ? `, ${shortItems} short (carried to ${shortDate(nextRun)}: ${carried.join(', ')})` : ''}. Seal ${body.sealNo}${body.reeferTempC != null ? ` · reefer ${body.reeferTempC} °C` : ''}. Loaded by ${req.user.name}.`, { date, tripId: t.id });
    emit('load.sealed', `${t.vehicleId} sealed`, { tripId: t.id });
    return { ok: true, carried };
  });

  // L4 Plan changes
  app.get('/loader/changes', loader, async (req): Promise<TPlanChangesResponse> => {
    const { date, depot } = dayOf(req);
    const plan = await opsPlan(date, depot);
    if (!plan) throw new HttpError(404, 'No published plan yet.');
    return changes(plan, req.user.id);
  });

  app.post('/loader/changes/:orderId/moved', loader, async (req) => {
    const { date, depot } = dayOf(req);
    const plan = await opsPlan(date, depot);
    if (!plan) throw new HttpError(404, 'No published plan yet.');
    const orderId = (req.params as { orderId: string }).orderId;
    await prisma.loadMove.upsert({
      where: { planId_version_orderId: { planId: plan.id, version: plan.version, orderId } },
      update: {}, create: { planId: plan.id, version: plan.version, orderId, byName: req.user.name },
    });
    return { ok: true };
  });

  app.post('/loader/changes/ack', loader, async (req) => {
    const { date, depot } = dayOf(req);
    const plan = await opsPlan(date, depot);
    if (!plan) throw new HttpError(404, 'No published plan yet.');
    const ch = await changes(plan, req.user.id);
    await prisma.planAck.upsert({
      where: { planId_version_userId: { planId: plan.id, version: plan.version, userId: req.user.id } },
      update: {}, create: { planId: plan.id, version: plan.version, userId: req.user.id, userName: req.user.name, role: 'loader' },
    });
    await alertDispatcher('info', `${req.user.name} acknowledged plan v${plan.version} · ${loaderNow()}`,
      ch.counts.toMove ? `${ch.counts.toMove} move(s) still to do at the ${depot} dock.` : `The ${depot} dock is working from plan v${plan.version}.`, { date });
    emit('plan.acknowledged', `${req.user.name} acknowledged plan v${plan.version}`, { version: String(plan.version) });
    return { ok: true };
  });
}

