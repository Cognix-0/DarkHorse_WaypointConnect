// Driver offline store. The route is cached on the phone (IndexedDB); every action becomes an event in an
// outbox, is applied to the cached route at once, and is sent to POST /api/sync when there is signal.
// Each event has a UUID, so resending after a dropped connection is safe (the server skips duplicates).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TDriverRouteResponse, TSyncEvent, TSyncResponse } from '@waypoint/shared/contract';
import { api, ApiError } from '../../api';
import { kvGet, kvSet, outboxAll, outboxDelete, outboxPut } from '../../offline/idb';
import { colomboTime } from '../../ui/format';
import { CHANGED_EVENT } from '../../live';

export type Queued = TSyncEvent & { label: string; queuedAt: string };
export type SyncedItem = { label: string; at: string };
export type PlanChange = { from: number; to: number; lines: string[]; was: string; now: string };

type State = {
  route: TDriverRouteResponse | null;
  queue: Queued[];
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  offlineSince: string | null;
  /** plan changed since the driver last looked (M1 notice) */
  planNotice: PlanChange | null;
  /** shown once after coming back online with queued work (M8) */
  backOnline: { synced: SyncedItem[]; change: PlanChange | null } | null;
  rejected: { label: string; reason: string }[];
  loaded: boolean;
  error: string | null;
};

type Ctx = State & {
  enqueue: (ev: TSyncEvent, label: string) => Promise<void>;
  refresh: () => Promise<void>;
  flush: () => Promise<void>;
  dismissNotice: () => void;
  dismissBackOnline: () => void;
};

const C = createContext<Ctx | null>(null);
export const useDriver = () => {
  const c = useContext(C);
  if (!c) throw new Error('useDriver outside DriverStore');
  return c;
};

export const uuid = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (ch) => (Number(ch) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(ch) / 4)))).toString(16));

function deviceId(): string {
  let id = localStorage.getItem('waypoint.device');
  if (!id) { id = `phone-${uuid().slice(0, 8)}`; localStorage.setItem('waypoint.device', id); }
  return id;
}

/** Applies one event to the cached route so the screen changes at once, signal or not. */
export function applyEvent(route: TDriverRouteResponse, ev: TSyncEvent): TDriverRouteResponse {
  const r: TDriverRouteResponse = structuredClone(route);
  for (const t of r.trips) {
    if (ev.type === 'trip.departed' && t.tripId === ev.tripId && t.status !== 'done') t.status = 'departed';
    for (const s of t.stops) {
      if (!('stopId' in ev) || s.stopId !== ev.stopId) continue;
      if (ev.type === 'stop.arrived' && s.status === 'pending') { s.status = 'arrived'; s.arrivedAt = ev.occurredAt; }
      if (ev.type === 'stop.delivered') { s.status = 'delivered'; s.deliveredAt = ev.occurredAt; s.deliveredUnits = ev.deliveredUnits; s.arrivedAt ??= ev.occurredAt; }
      if (ev.type === 'stop.failed') { s.status = 'failed'; s.failedReason = ev.reason; s.arrivedAt ??= ev.occurredAt; }
    }
    if (t.stops.length && t.stops.every((s) => s.status === 'delivered' || s.status === 'failed')) t.status = 'done';
  }
  return r;
}

const order = (r: TDriverRouteResponse | null) =>
  (r?.trips ?? []).map((t) => `T${t.tripNo}: ${t.stops.map((s) => `${s.seq} · ${s.outlet.id}`).join('   ')}`).join('\n');

/** What changed between two versions of the route, in the driver's words. */
function diff(a: TDriverRouteResponse, b: TDriverRouteResponse): PlanChange {
  const stops = (r: TDriverRouteResponse) => r.trips.flatMap((t) => t.stops.map((s) => ({ id: s.orderId, label: `${s.outlet.id} ${s.outlet.district}` })));
  const before = stops(a);
  const after = stops(b);
  const added = after.filter((x) => !before.some((y) => y.id === x.id)).map((x) => x.label);
  const removed = before.filter((x) => !after.some((y) => y.id === x.id)).map((x) => x.label);
  const lines: string[] = [];
  if (added.length) lines.push(`New stop${added.length > 1 ? 's' : ''}: ${added.join(', ')}. ${added.length > 1 ? 'They are' : 'It is'} already on your phone.`);
  if (removed.length) lines.push(`Removed: ${removed.join(', ')}. Don't deliver ${removed.length > 1 ? 'these' : 'this'} today.`);
  if (!added.length && !removed.length && before.map((x) => x.id).join() !== after.map((x) => x.id).join()) lines.push('The dispatcher changed the order of your stops.');
  if (!lines.length) lines.push('Times were updated. Your stops are the same.');
  return { from: a.version, to: b.version, lines, was: order(a), now: order(b) };
}

export function DriverStore({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>({
    route: null, queue: [], online: navigator.onLine, syncing: false, lastSyncAt: null, offlineSince: null,
    planNotice: null, backOnline: null, rejected: [], loaded: false, error: null,
  });
  const ref = useRef(s);
  ref.current = s;
  const busy = useRef(false);
  const patch = (p: Partial<State>) => set((x) => ({ ...x, ...p }));

  const goOffline = useCallback(() => {
    if (!ref.current.offlineSince) { const at = new Date().toISOString(); patch({ online: false, offlineSince: at }); void kvSet('offlineSince', at); }
    else patch({ online: false });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const server = await api<TDriverRouteResponse>('/driver/route');
      const prev = (await kvGet<TDriverRouteResponse>('route.server')) ?? null;
      await kvSet('route.server', server);
      const merged = ref.current.queue.reduce(applyEvent, server);
      await kvSet('route', merged);
      const seen = (await kvGet<number>('seenVersion')) ?? 0;
      let planNotice = ref.current.planNotice;
      if (prev && prev.published && server.version > prev.version) planNotice = diff(prev, server);
      if (!seen) await kvSet('seenVersion', server.version);
      patch({ route: merged, planNotice, error: null, online: true });
    } catch (e) {
      if (e instanceof ApiError) patch({ error: e.message });
      else goOffline();
    }
  }, [goOffline]);

  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    const queue = ref.current.queue;
    if (!queue.length) return;
    busy.current = true;
    patch({ syncing: true });
    const wasOffline = !!ref.current.offlineSince;
    const synced: SyncedItem[] = [];
    const rejected: { label: string; reason: string }[] = [];
    let routeVersion = 0;
    try {
      for (let i = 0; i < queue.length; i += 20) {
        const batch = queue.slice(i, i + 20);
        const events = batch.map(({ label: _l, queuedAt: _q, ...ev }) => ev as TSyncEvent);
        const res = await api<TSyncResponse>('/sync', { method: 'POST', body: JSON.stringify({ deviceId: deviceId(), events }) });
        routeVersion = Math.max(routeVersion, res.routeVersion);
        const done = [...res.accepted, ...res.duplicates, ...res.rejected.map((x) => x.eventId)];
        for (const q of batch) {
          if (res.accepted.includes(q.eventId) || res.duplicates.includes(q.eventId)) synced.push({ label: q.label, at: new Date().toISOString() });
          const rj = res.rejected.find((x) => x.eventId === q.eventId);
          if (rj) rejected.push({ label: q.label, reason: rj.reason });
        }
        await outboxDelete(done);
        set((x) => ({ ...x, queue: x.queue.filter((q) => !done.includes(q.eventId)) }));
      }
      const at = new Date().toISOString();
      await kvSet('lastSyncAt', at);
      await kvSet('offlineSince', null);
      const before = ref.current.route;
      if (routeVersion > (before?.version ?? 0)) await refresh();
      const after = ref.current.route;
      const change = before && after && after.version > before.version ? diff(before, after) : null;
      patch({
        lastSyncAt: at, offlineSince: null, online: true,
        rejected: [...ref.current.rejected, ...rejected],
        backOnline: wasOffline && synced.length ? { synced, change } : ref.current.backOnline,
      });
    } catch (e) {
      if (!(e instanceof ApiError)) goOffline();
    } finally {
      busy.current = false;
      patch({ syncing: false });
    }
  }, [refresh, goOffline]);

  const enqueue = useCallback(async (ev: TSyncEvent, label: string) => {
    const item: Queued = { ...ev, label, queuedAt: new Date().toISOString() } as Queued;
    await outboxPut(item);
    const route = ref.current.route ? applyEvent(ref.current.route, ev) : null;
    if (route) await kvSet('route', route);
    set((x) => ({ ...x, route, queue: [...x.queue, item] }));
    setTimeout(() => void flush(), 0);
  }, [flush]);

  // start-up: everything from the phone first, then the network
  useEffect(() => {
    (async () => {
      const [route, queue, lastSyncAt, offlineSince] = await Promise.all([
        kvGet<TDriverRouteResponse>('route'), outboxAll<Queued>(), kvGet<string>('lastSyncAt'), kvGet<string | null>('offlineSince'),
      ]);
      patch({ route: route ?? null, queue: queue.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)), lastSyncAt: lastSyncAt ?? null, offlineSince: offlineSince ?? null, loaded: true });
      if (navigator.onLine) { await refresh(); await flush(); } else goOffline();
    })();
    const on = () => { patch({ online: true }); void flush().then(refresh); };
    const off = () => goOffline();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const tick = setInterval(() => { if (navigator.onLine) void flush().then(() => refresh()); }, 20_000);
    // Realtime: the dispatcher republished, the loader sealed… (src/live.tsx) → fetch the route now.
    const changed = () => { if (navigator.onLine) void refresh(); };
    window.addEventListener(CHANGED_EVENT, changed);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener(CHANGED_EVENT, changed); clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Ctx>(() => ({
    ...s, enqueue, refresh, flush,
    dismissNotice: () => { if (s.route) void kvSet('seenVersion', s.route.version); patch({ planNotice: null }); },
    dismissBackOnline: () => patch({ backOnline: null }),
  }), [s, enqueue, refresh, flush]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Phone clock as HH:MM. */
export const clock = (d = new Date()) => colomboTime(d);
export const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
