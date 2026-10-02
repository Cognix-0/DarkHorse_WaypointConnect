// D1 Overview, D4 Deferral review (with engine what-ifs), D6 Capacity forecast, and the SSE stream.
import type { FastifyInstance } from 'fastify';
import { suggestPlan, type Order as EOrder, type Vehicle as EVehicle } from '@waypoint/shared';
import type { TAttentionItem, TDeferralReviewResponse, TForecastResponse, TOverviewResponse, TRecoveryOption } from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { addDays, calendar, festivalFor, isoOf, shortDate } from '../reference.ts';
import { loadDay, planStatusOf, toOrderDto, unassignedOrders, type Day } from '../day.ts';
import { alertDispatcher, bus } from '../events.ts';
import { HttpError, suggest } from '../plans.ts';
import { computeLive } from './live.ts';
import { dayOf } from './dispatch.ts';

const FORECAST_DAYS = 21;
const t = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
const reeferKg = (vs: EVehicle[]) => vs.filter((v) => v.available && v.temp === 'reefer').reduce((s, v) => s + v.weightCapKg, 0);
const chilledKg = (os: Iterable<EOrder>) => [...os].filter((o) => o.temp === 'chilled').reduce((s, o) => s + o.weightKg, 0);

export async function insightRoutes(app: FastifyInstance) {
  const dispatcher = { preHandler: requireRole('dispatcher') };

  // ---------- D1 Overview ----------
  app.get('/overview', dispatcher, async (req): Promise<TOverviewResponse> => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    const other = await loadDay(date, depot === 'Peliyagoda' ? 'Kandy' : 'Peliyagoda');
    const plan = day.plan;
    const onTrip = new Set(plan?.trips.flatMap((x) => x.stops.map((s) => s.orderId)) ?? []);
    const deferred = new Set(plan?.deferrals.map((d) => d.orderId) ?? []);
    const live = plan && plan.version > 0 ? await computeLive(day) : null;
    const eo = [...day.engineOrders.values()];
    const demandKg = chilledKg(eo);
    const capKg = reeferKg(day.engineVehicles);

    const attention: TAttentionItem[] = [];
    const second = plan?.deferrals.filter((d) => {
      const o = day.orders.find((x) => x.id === d.orderId);
      return o && day.skipped.has(o.outletId) && !d.confirmedAt;
    }) ?? [];
    if (second.length) attention.push({ kind: 'second_deferral', severity: 'high', title: `${second.length} shop(s) would be skipped twice`, detail: 'Confirm each second deferral with a note before publishing.', link: '/dispatcher/deferrals' });
    if (demandKg > capKg) attention.push({ kind: 'reefer_short', severity: 'high', title: `Chilled demand ${t(demandKg)} vs ${t(capKg)} reefer space`, detail: calendar.get(date)?.payday ? 'Payday peak: review recovery options before publishing.' : 'Review recovery options before publishing.', link: '/dispatcher/deferrals' });
    if (live && live.counts.late) attention.push({ kind: 'late', severity: 'high', title: `${live.counts.late} trip(s) running late`, detail: 'Notify the stores or re-sequence.', link: '/dispatcher/live' });
    if (!plan) attention.push({ kind: 'plan_unpublished', severity: 'medium', title: 'No plan yet', detail: `${day.orders.length} locked orders are waiting. Auto-allocate from the order queue.`, link: '/dispatcher/queue' });
    else if (plan.status === 'draft') attention.push({ kind: 'plan_unpublished', severity: 'medium', title: plan.version ? `Plan v${plan.version} has unpublished changes` : 'Draft plan not published', detail: 'Loaders start at 02:30. Publish so they can load.', link: '/dispatcher/board' });
    const workshop = day.engineVehicles.filter((v) => !v.available);
    if (workshop.length) attention.push({ kind: 'workshop', severity: 'low', title: `${workshop.length} vehicles in the workshop`, detail: workshop.slice(0, 4).map((v) => v.id).join(', ') + (workshop.length > 4 ? ` +${workshop.length - 4}` : ''), link: '/dispatcher/board' });
    if (day.afterCutoff.length) attention.push({ kind: 'after_cutoff', severity: 'low', title: `${day.afterCutoff.length} order(s) after the 16:00 cutoff`, detail: `Moved to the ${shortDate(day.nextRun)} run; stores were told.`, link: '/dispatcher/queue' });

    const brands = ['Fresh', 'Style', 'Tech'] as const;
    const depotCard = (d: Day) => ({
      depot: d.depot, orders: d.orders.length,
      vehiclesAvailable: d.engineVehicles.filter((v) => v.available).length, vehiclesTotal: d.engineVehicles.length,
      reefersAvailable: d.engineVehicles.filter((v) => v.available && v.temp === 'reefer').length, planStatus: planStatusOf(d.plan),
    });
    return {
      date, depot, planStatus: planStatusOf(plan), planVersion: plan?.version ?? 0,
      kpis: {
        ordersLocked: day.orders.length, chilled: eo.filter((o) => o.temp === 'chilled').length,
        planned: onTrip.size, deferred: deferred.size, trips: plan?.trips.length ?? 0,
        vehiclesUsed: new Set(plan?.trips.map((x) => x.vehicleId) ?? []).size,
        vehiclesAvailable: day.engineVehicles.filter((v) => v.available).length, vehiclesTotal: day.engineVehicles.length,
        chilledDemandKg: Math.round(demandKg), reeferCapacityKg: Math.round(capKg),
        skippedLastRun: eo.filter((o) => o.deferredYesterday).length, afterCutoff: day.afterCutoff.length,
      },
      brandDemand: brands.map((b) => {
        const os = eo.filter((o) => o.brand === b);
        return { brand: b, orders: os.length, units: os.reduce((s, o) => s + o.units, 0), weightKg: Math.round(os.reduce((s, o) => s + o.weightKg, 0)), planned: os.filter((o) => onTrip.has(o.ref)).length, deferred: os.filter((o) => deferred.has(o.ref)).length };
      }),
      depots: [depotCard(day), depotCard(other)],
      attention,
    };
  });

  // ---------- D4 Deferral review ----------
  app.get('/deferrals', dispatcher, async (req): Promise<TDeferralReviewResponse> => {
    const { date, depot } = dayOf(req);
    return review(await loadDay(date, depot));
  });

  app.post('/deferrals/options/:id', dispatcher, async (req) => {
    const { date, depot } = dayOf(req);
    const id = (req.params as { id: string }).id as 'A' | 'B' | 'C';
    if (!['A', 'B', 'C'].includes(id)) throw new HttpError(400, 'Unknown option');
    let day = await loadDay(date, depot);
    if (id === 'A') {
      await suggest(day);
      day = await loadDay(date, depot);
    }
    const opts = whatIfs(day);
    const o = opts.find((x) => x.id === id)!;
    const planId = day.plan?.id;
    if (planId) {
      const prev = (day.plan!.options ?? {}) as Record<string, string>;
      await prisma.plan.update({ where: { id: planId }, data: { options: { ...prev, [id]: id === 'A' ? 'applied' : 'requested' } } });
    }
    if (id !== 'A') await alertDispatcher('info', `Requested: ${o.title}`, `Sent to the fleet manager. If approved, re-run the plan: ${o.served} served, ${o.deferred} deferred.`, { date });
    return review(await loadDay(date, depot));
  });

  // ---------- D6 Capacity forecast ----------
  app.get('/forecast', dispatcher, async (req): Promise<TForecastResponse> => {
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    const index = (iso: string) => {
      const c = calendar.get(iso);
      return c ? 1 + (c.payday ? 0.25 : 0) + 0.6 * c.festivalRamp : 1;
    };
    const base = [...day.engineOrders.values()].map((o) => ({ ...o, deferredYesterday: false }));
    const i0 = index(date);
    const days: TForecastResponse["days"] = [];
    for (let k = 0; k < FORECAST_DAYS; k++) {
      const iso = addDays(date, k);
      const c = calendar.get(iso);
      const idx = index(iso);
      const vehicles = k === 0 ? day.engineVehicles : day.engineVehicles.map((v) => ({ ...v, available: true }));
      const scale = idx / i0;
      const orders = base.map((o) => ({ ...o, ref: `${o.ref}@${iso}`, weightKg: o.weightKg * scale, volumeM3: o.volumeM3 * scale, units: Math.round(o.units * scale) }));
      const operating = c ? c.operating : true;
      const plan = operating ? suggestPlan(orders, vehicles, day.ctx) : { trips: [], deferred: [] };
      const served = plan.trips.reduce((s, x) => s + x.orders.length, 0);
      const ck = chilledKg(orders);
      const rk = reeferKg(vehicles);
      days.push({
        date: iso, dow: c?.dow ?? '', operating, payday: !!c?.payday, festival: festivalFor(iso), festivalRamp: c?.festivalRamp ?? 0,
        monsoon: !!c?.monsoon, holiday: !!c?.holiday, demandIndex: Math.round(idx * 100) / 100,
        orders: operating ? orders.length : 0, weightKg: operating ? Math.round(orders.reduce((s, o) => s + o.weightKg, 0)) : 0,
        chilledKg: operating ? Math.round(ck) : 0, reeferCapacityKg: Math.round(rk),
        fleetCapacityKg: Math.round(vehicles.filter((v) => v.available).reduce((s, v) => s + v.weightCapKg, 0)),
        served, deferred: plan.deferred.length,
        risk: (!operating ? 'closed' : plan.deferred.length > orders.length * 0.05 ? 'over' : plan.deferred.length >= 3 || ck > rk * 0.85 ? 'tight' : 'ok') as 'ok' | 'tight' | 'over' | 'closed',
      });
    }
    return {
      from: date, depot, days,
      method: `Calendar estimate: the ${shortDate(date)} order book scaled by payday (+25%) and festival build-up (up to +60%), then planned with the same engine as the board. Today uses the real workshop list; later days assume the full fleet. The Datathon demand model will replace the scaling.`,
    };
  });

  // ---------- live events (EventSource cannot send headers, so the token comes in the query) ----------
  app.get('/events', async (req, reply) => {
    const token = (req.query as { token?: string }).token ?? '';
    try { app.jwt.verify(token); } catch { return reply.code(401).send({ error: 'Sign in again' }); }
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    reply.raw.write(': connected\n\n');
    const send = (ev: unknown) => reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    bus.on('event', send);
    req.raw.on('close', () => { clearInterval(ping); bus.off('event', send); });
    return reply;
  });
}

/** Engine what-ifs for the three recovery options. */
function whatIfs(day: Day): TRecoveryOption[] {
  const orders = [...day.engineOrders.values()].filter((o) => {
    const r = day.orders.find((x) => x.id === o.ref);
    return r && ['placed', 'locked', 'planned', 'deferred'].includes(r.status);
  });
  const run = (vs: EVehicle[]) => {
    const p = suggestPlan(orders, vs, day.ctx);
    return { served: p.trips.reduce((s, x) => s + x.orders.length, 0), deferred: p.deferred.length };
  };
  const state = (day.plan?.options ?? {}) as Record<string, string>;
  const st = (id: string) => (state[id] === 'applied' ? 'applied' : state[id] === 'requested' ? 'requested' : 'available') as TRecoveryOption['state'];
  const now = run(day.engineVehicles);

  const workshopReefer = day.engineVehicles.filter((v) => !v.available && v.temp === 'reefer').sort((a, b) => b.weightCapKg - a.weightCapKg)[0];
  const b = workshopReefer ? run(day.engineVehicles.map((v) => (v.id === workshopReefer.id ? { ...v, available: true } : v))) : now;
  const spec = day.engineVehicles.filter((v) => v.temp === 'reefer' && v.type === 'truck').sort((a, b2) => b2.weightCapKg - a.weightCapKg)[0];
  const hired: EVehicle | null = spec ? { ...spec, id: 'HIRE-R1', available: true, weeklyFuelQuotaL: 10_000 } : null;
  const c = hired ? run([...day.engineVehicles, hired]) : now;

  return [
    { id: 'A', title: 'Re-plan by priority policy', detail: 'Skipped shops first, then Fresh chilled, Fresh ambient, Tech, Style. Reefers kept for chilled goods, vans for van-only shops.', ...now, action: 'apply', state: st('A') },
    { id: 'B', title: workshopReefer ? `Release ${workshopReefer.id} from the workshop` : 'Release a workshop reefer', detail: workshopReefer ? `${workshopReefer.id} (${t(workshopReefer.weightCapKg)} reefer ${workshopReefer.type}) is in for service. Ask the workshop to finish it by 03:00.` : 'No refrigerated vehicle is in the workshop today.', ...b, action: 'request', state: workshopReefer ? st('B') : 'available' },
    { id: 'C', title: 'Hire one reefer truck for the day', detail: hired ? `A ${t(hired.weightCapKg)} hired reefer from the approved supplier, booked before 20:00.` : 'No reefer spec to copy.', ...c, action: 'request', state: st('C') },
  ];
}

function review(day: Day): TDeferralReviewResponse {
  const eo = [...day.engineOrders.values()];
  const demand = chilledKg(eo);
  const cap = reeferKg(day.engineVehicles);
  const cal = calendar.get(day.date);
  const deferrals = (day.plan?.deferrals ?? []).flatMap((d) => {
    const o = day.orders.find((x) => x.id === d.orderId);
    if (!o) return [];
    return [{
      id: d.id, order: toOrderDto(o, day), reason: d.reason, type: d.type, detail: d.detail, note: d.note, newDate: isoOf(d.newDate),
      secondDeferral: day.skipped.has(o.outletId), confirmed: !!d.confirmedAt,
    }];
  }).sort((a, b) => Number(b.secondDeferral && !b.confirmed) - Number(a.secondDeferral && !a.confirmed) || a.order.priority - b.order.priority);
  const seconds = deferrals.filter((d) => d.secondDeferral).length;
  const loose = unassignedOrders(day).length;
  const title = cal?.payday ? 'Payday overload' : cal && cal.festivalRamp > 0 ? 'Festival build-up' : 'Capacity shortfall';
  return {
    date: day.date, depot: day.depot, planId: day.plan?.id ?? null, planStatus: planStatusOf(day.plan),
    overload: {
      active: deferrals.length > 0 || demand > cap || loose > 0,
      title,
      detail: `Chilled demand is ${t(demand)} against ${t(cap)} of refrigerated space (one load per reefer). ${deferrals.length} order(s) can't go on ${shortDate(day.date)}${seconds ? `; ${seconds} of them were already skipped on the last run` : ''}.`,
      chilledDemandKg: Math.round(demand), reeferCapacityKg: Math.round(cap),
    },
    options: day.orders.length ? whatIfs(day) : [],
    deferrals,
  };
}

