// D5 Live tracking: trip progress from driver events, plus the dispatcher's alerts.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { toHHMM, toMin } from '@waypoint/shared';
import { AlertActionRequest, type TLiveAlertDto, type TLiveResponse, type TLiveRowDto, type TPod } from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { colomboNow, shortDate } from '../reference.ts';
import { loadDay, type Day } from '../day.ts';
import { alertDispatcher, emit, notifyStore } from '../events.ts';
import { HttpError } from '../plans.ts';
import { dayOf } from './dispatch.ts';

type TripRow = NonNullable<Day['plan']>['trips'][number];

const OFFLINE_AFTER_MIN = 30;
const AT_RISK_MIN = 20;

/** HH:MM in Colombo for a timestamp. */
const clockOf = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
/** Timestamp for HH:MM Colombo on a date (Colombo is UTC+5:30, no DST). */
const atClock = (iso: string, hhmm: string) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + (toMin(hhmm) - 330) * 60_000);

const ACTIONS: Record<string, { id: string; label: string }[]> = {
  late: [{ id: 'notify_store', label: 'Notify store' }, { id: 'resequence', label: 'Re-sequence' }],
  loader_flag: [{ id: 'send_on', label: 'Send on next trip' }, { id: 'notify_store', label: 'Notify store' }],
  offline: [{ id: 'call_driver', label: 'Call driver' }],
  pod: [{ id: 'view_pod', label: 'View POD' }],
  failed: [{ id: 'notify_store', label: 'Notify store' }, { id: 'reschedule', label: 'Move to next run' }],
  receipt_issue: [{ id: 'notify_store', label: 'Reply to store' }],
};
const KINDS = ['late', 'loader_flag', 'offline', 'pod', 'failed', 'receipt_issue', 'info'] as const;

export async function computeLive(day: Day): Promise<TLiveResponse> {
  const now = colomboNow();
  const nowMin = toMin(now);
  const notes = await prisma.notification.findMany({
    where: { role: 'dispatcher', refs: { path: ['date'], equals: day.date } }, orderBy: { createdAt: 'desc' }, take: 30,
  });
  const alerts: TLiveAlertDto[] = notes.map((n) => {
    const kind = (KINDS as readonly string[]).includes(n.kind) ? (n.kind as TLiveAlertDto['kind']) : 'info';
    return { id: n.id, kind, title: n.title ?? n.kind, detail: n.message, at: n.createdAt.toISOString(), actions: n.done && kind !== 'pod' ? [] : ACTIONS[kind] ?? [], done: n.done, stopId: ((n.refs ?? {}) as Record<string, string>).stopId ?? null };
  }).sort((a, b) => Number(a.done) - Number(b.done) || rank(a.kind) - rank(b.kind));

  const plan = day.plan;
  if (!plan || plan.version === 0) {
    return { date: day.date, now, published: false, counts: { onTime: 0, atRisk: 0, late: 0, offline: 0 }, rows: [], alerts };
  }
  const tripIds = plan.trips.map((t) => t.id);
  const [events, shorts] = await Promise.all([
    prisma.deliveryEvent.findMany({ where: { stop: { tripId: { in: tripIds } } }, include: { stop: true }, orderBy: { occurredAt: 'asc' } }),
    prisma.loadCheck.findMany({ where: { tripId: { in: tripIds }, shortUnits: { gt: 0 } } }),
  ]);
  const vehicles = new Map(day.vehicles.map((v) => [v.id, v]));
  const orders = new Map(day.orders.map((o) => [o.id, o]));

  const rows: TLiveRowDto[] = plan.trips.map((t) => {
    const done = t.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length;
    const tEvents = events.filter((e) => e.stop.tripId === t.id);
    const last = tEvents.at(-1);
    const lastSeen = last ? clockOf(last.occurredAt) : null;
    const next = t.stops.find((s) => s.status === 'pending' || s.status === 'arrived');
    const nextOrder = next ? orders.get(next.orderId) : undefined;
    const hasTrip2 = plan.trips.some((x) => x.vehicleId === t.vehicleId && x.tripNo === 2);
    let status: TLiveRowDto['status'];
    let eta = next?.plannedArrival ?? null;
    if (!next) status = t.tripNo === 1 && hasTrip2 ? 'trip_done' : 'done';
    // A reading from the future means the phone and the (demo) clock disagree: treat it as just seen.
    else if (lastSeen && nowMin - toMin(lastSeen) > OFFLINE_AFTER_MIN && toMin(lastSeen) <= nowMin) status = 'offline';
    else if (nowMin < toMin(t.departAt) && !tEvents.length) status = shorts.some((s) => s.tripId === t.id) ? 'short_loaded' : 'not_started';
    else {
      // Lateness so far = when the driver actually reached the last stop minus when the plan said.
      // Measured per vehicle, so a delay on trip 1 carries into trip 2.
      const vehicleTrips = new Set(plan.trips.filter((x) => x.vehicleId === t.vehicleId).map((x) => x.id));
      const arrivals = events.filter((e) => e.type === 'stop.arrived' && vehicleTrips.has(e.stop.tripId));
      const lastArr = arrivals.at(-1);
      const rawLate = lastArr ? toMin(clockOf(lastArr.occurredAt)) - toMin(lastArr.stop.plannedArrival) : 0;
      // More than 3 h off the plan is clock skew (e.g. a demo run in the evening), not lateness.
      const lateBy = rawLate > 0 && rawLate <= 180 ? rawLate : 0;
      const projected = next.status === 'arrived' ? toMin(next.plannedArrival) : Math.max(toMin(next.plannedArrival) + lateBy, nowMin);
      eta = toHHMM(projected);
      const close = toMin(nextOrder?.outlet.windowClose ?? '23:59');
      status = projected > close ? 'late' : projected > close - AT_RISK_MIN ? 'at_risk' : 'on_time';
      if (status === 'on_time' && shorts.some((s) => s.tripId === t.id)) status = 'short_loaded';
    }
    return {
      tripId: t.id, vehicleId: t.vehicleId, tripNo: t.tripNo, route: `${t.brand} · ${t.district}`,
      driverName: vehicles.get(t.vehicleId)?.driverName ?? null,
      stopsDone: done, stopsTotal: t.stops.length,
      nextStop: next && nextOrder && eta ? { outletId: nextOrder.outletId, district: nextOrder.outlet.district, eta, windowClose: nextOrder.outlet.windowClose } : null,
      status, lastSeenAt: lastSeen,
    };
  });
  const order = ['late', 'offline', 'at_risk', 'short_loaded', 'on_time', 'not_started', 'trip_done', 'done'];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.vehicleId.localeCompare(b.vehicleId) || a.tripNo - b.tripNo);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    date: day.date, now, published: true,
    counts: { onTime: count('on_time') + count('not_started') + count('trip_done') + count('done') + count('short_loaded'), atRisk: count('at_risk'), late: count('late'), offline: count('offline') },
    rows, alerts,
  };
}

const rank = (k: string) => ['late', 'loader_flag', 'offline', 'failed', 'receipt_issue', 'pod', 'info'].indexOf(k);

export async function liveRoutes(app: FastifyInstance) {
  const dispatcher = { preHandler: requireRole('dispatcher') };

  app.get('/live', dispatcher, async (req) => {
    const { date, depot } = dayOf(req);
    return computeLive(await loadDay(date, depot));
  });

  // "View POD" on an alert: the photo, signature and receiver the driver recorded.
  app.get('/live/pod/:stopId', dispatcher, async (req): Promise<TPod> => {
    const stop = await prisma.tripStop.findUnique({ where: { id: (req.params as { stopId: string }).stopId }, include: { trip: { include: { vehicle: true } }, events: { where: { type: 'stop.delivered' }, orderBy: { occurredAt: 'desc' }, take: 1 } } });
    const ev = stop?.events[0];
    if (!stop || !ev) throw new HttpError(404, 'No proof of delivery recorded for this stop yet.');
    return { receiverName: ev.receiverName, at: ev.occurredAt.toISOString(), photo: ev.photo, signature: ev.signature, driverName: stop.trip.vehicle.driverName, vehicleId: stop.trip.vehicleId };
  });

  app.post('/live/alerts/:id/action', dispatcher, async (req) => {
    const { action } = AlertActionRequest.parse(req.body);
    const n = await prisma.notification.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!n) throw new HttpError(404, 'Alert not found');
    const refs = (n.refs ?? {}) as Record<string, string>;
    if (action === 'notify_store' && refs.outletId) {
      await notifyStore(refs.outletId, 'dispatch.update', n.title ?? 'Delivery update', `${n.message} The dispatcher is on it and will update you.`, refs);
    }
    await prisma.notification.update({ where: { id: n.id }, data: { done: true } });
    return { ok: true, action };
  });

  /**
   * Demo only (DEMO_MODE=1): plays driver progress up to the current clock so the walkthrough shows a
   * live morning without three phones. One trip runs late and one goes offline, so every alert type appears.
   * Real progress comes from the driver app's offline sync (Part 3).
   */
  app.post('/live/simulate', dispatcher, async (req) => {
    if (process.env.DEMO_MODE !== '1') throw new HttpError(403, 'Simulation is only available in demo mode.');
    const { date, depot } = dayOf(req);
    const day = await loadDay(date, depot);
    if (!day.plan || day.plan.version === 0) throw new HttpError(400, 'Publish the plan first.');
    const nowMin = toMin(colomboNow());
    const OFF_LAG = OFFLINE_AFTER_MIN + 15;
    const started = (t: TripRow, lag: number) =>
      t.stops.some((s) => toMin(s.plannedArrival) + lag <= nowMin) && t.stops.some((s) => s.status === 'pending' && toMin(s.plannedArrival) + lag > nowMin);
    const closeOf = (orderId: string) => toMin(day.orders.find((o) => o.id === orderId)?.outlet.windowClose ?? '23:59');
    // Late = the running trip that needs the smallest delay (15–90 min) to miss its next shop's window.
    const delayToMiss = (t: TripRow) => {
      for (let lag = 15; lag <= 90; lag += 5) {
        const next = t.stops.find((s) => s.status === 'pending' && toMin(s.plannedArrival) + lag > nowMin);
        const seen = day.plan!.trips.some((x) => x.vehicleId === t.vehicleId && x.stops.some((st) => toMin(st.plannedArrival) + lag <= nowMin));
        if (seen && toMin(t.departAt) <= nowMin && next && Math.max(toMin(next.plannedArrival) + lag, nowMin) > closeOf(next.orderId)) return lag;
      }
      return Infinity;
    };
    const ranked = day.plan.trips.map((t) => ({ t, lag: delayToMiss(t) })).filter((x) => x.lag < Infinity).sort((a, b) => a.lag - b.lag);
    const lateTrip = ranked[0]?.t;
    const LATE = ranked[0]?.lag ?? 0;
    // Offline = delivered something, then silent for more than OFFLINE_AFTER_MIN.
    const offlineTrip = day.plan.trips.find((t) => t.vehicleId !== lateTrip?.vehicleId && started(t, OFF_LAG));
    let delivered = 0;
    for (const t of day.plan.trips) {
      const isLate = !!lateTrip && t.vehicleId === lateTrip.vehicleId;
      const lag = isLate ? LATE : t === offlineTrip ? OFF_LAG : 0;
      for (const s of t.stops) {
        if (s.status !== 'pending' || toMin(s.plannedArrival) > nowMin - lag) continue;
        const o = day.orders.find((x) => x.id === s.orderId);
        // The late trip really arrives LATE minutes behind plan; the others on time.
        const at = atClock(date, toHHMM(toMin(s.plannedArrival) + (isLate ? LATE : 0)));
        await prisma.deliveryEvent.createMany({ data: [
          { eventId: randomUUID(), stopId: s.id, type: 'stop.arrived', occurredAt: at, deviceId: 'demo-simulator' },
          { eventId: randomUUID(), stopId: s.id, type: 'stop.delivered', occurredAt: new Date(at.getTime() + 12 * 60_000), deviceId: 'demo-simulator', receiverName: 'Store manager', deliveredUnits: o?.units ?? 0 },
        ] });
        await prisma.tripStop.update({ where: { id: s.id }, data: { status: 'delivered' } });
        await prisma.order.update({ where: { id: s.orderId }, data: { status: 'delivered' } });
        if (delivered === 0 && o) {
          await alertDispatcher('pod', `${o.outletId} received · ${s.plannedArrival}`, 'Signed by store manager · photo attached · no issues reported.', { date, outletId: o.outletId, stopId: s.id });
        }
        delivered++;
      }
    }
    if (lateTrip) {
      const next = lateTrip.stops.find((s) => toMin(s.plannedArrival) + LATE > nowMin);
      const o = next && day.orders.find((x) => x.id === next.orderId);
      if (next && o) {
        const eta = toHHMM(Math.max(toMin(next.plannedArrival) + LATE, nowMin));
        await alertDispatcher('late', `${lateTrip.vehicleId} → ${o.outletId} ${o.outlet.district}`, `ETA ${eta}, window closes ${o.outlet.windowClose}. Running ${LATE} min behind plan${o.outlet.brand === 'Fresh' ? '; this Fresh outlet may miss its morning opening' : ''}.`, { date, outletId: o.outletId, tripId: lateTrip.id });
      }
    }
    if (offlineTrip) {
      await alertDispatcher('offline', `${offlineTrip.vehicleId} · no signal`, 'The driver app keeps recording deliveries on the phone and syncs when signal returns. The latest plan is already on the device.', { date, tripId: offlineTrip.id });
    }
    emit('stop.delivered', `Simulated ${delivered} deliveries up to ${colomboNow()} on ${shortDate(date)}`, { date });
    return { delivered };
  });
}
