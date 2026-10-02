// Dispatch Console (desktop 1440 × 900): dark sidebar + six screens, as in Figma frames D1–D6.
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { TLiveEvent } from '@waypoint/shared/contract';
import { getSession, setSession } from '../../api';
import { Icon } from '../../ui/Icon';
import { ToastProvider, useToast } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useLive, useOverview } from './api';
import { Overview } from './Overview';
import { OrderQueue } from './OrderQueue';
import { PlanningBoard } from './PlanningBoard';
import { DeferralReview } from './DeferralReview';
import { LiveTracking } from './LiveTracking';
import { CapacityForecast } from './CapacityForecast';

export function DispatcherApp() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const synced = useLiveEvents();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <Sidebar synced={synced} />
      <main className="min-w-0 px-4 py-6 sm:px-7 lg:py-7">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="queue" element={<OrderQueue />} />
          <Route path="board" element={<PlanningBoard />} />
          <Route path="deferrals" element={<DeferralReview />} />
          <Route path="live" element={<LiveTracking />} />
          <Route path="forecast" element={<CapacityForecast />} />
          <Route path="*" element={<Navigate to="/dispatcher" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const NAV = [
  { to: '/dispatcher', label: 'Overview', icon: 'overview', end: true },
  { to: '/dispatcher/queue', label: 'Order Queue', icon: 'queue' },
  { to: '/dispatcher/board', label: 'Planning Board', icon: 'board' },
  { to: '/dispatcher/deferrals', label: 'Deferrals', icon: 'defer', badge: 'deferrals' },
  { to: '/dispatcher/live', label: 'Live Tracking', icon: 'live', badge: 'live' },
  { to: '/dispatcher/forecast', label: 'Capacity Forecast', icon: 'forecast' },
] as const;

function Sidebar({ synced }: { synced: string | null }) {
  const s = getSession();
  const nav = useNavigate();
  const overview = useOverview();
  const live = useLive();
  const counts: Record<string, number> = {
    deferrals: overview.data?.kpis.deferred ?? 0,
    live: live.data?.alerts.filter((a) => !a.done && a.kind !== 'info' && a.kind !== 'pod').length ?? 0,
  };
  const initials = (s?.user.name ?? 'D').split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <aside className="bg-nav text-nav-text lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-4 px-4 py-4 lg:px-5 lg:py-6 overflow-x-auto">
      <div className="flex items-center gap-3 shrink-0 lg:mb-6">
        <span className="grid place-items-center h-10 w-10 rounded-lg bg-surface">
          <img src="/logo-mark.png" alt="" className="w-7" />
        </span>
        <span className="hidden sm:grid leading-tight">
          <strong className="text-[15px] text-white">Waypoint</strong>
          <span className="text-xs text-nav-muted">Dispatch Console</span>
        </span>
      </div>
      <nav aria-label="Dispatcher" className="flex lg:grid gap-1 lg:gap-2">
        {NAV.map((n) => {
          const c = 'badge' in n ? counts[n.badge] ?? 0 : 0;
          return (
            <NavLink key={n.to} to={n.to} end={'end' in n && n.end}
              className={({ isActive }) => cx('flex items-center gap-3 h-11 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors', isActive ? 'bg-nav-active text-white' : 'text-nav-text hover:bg-white/5')}>
              <Icon name={n.icon} className="text-nav-muted" />
              <span>{n.label}</span>
              {c > 0 && (
                <span className={cx('ml-auto lg:ml-1 grid place-items-center min-w-[24px] h-5 px-1.5 rounded-full text-2xs font-bold',
                  'badge' in n && n.badge === 'deferrals' ? 'bg-bad text-white' : 'bg-warn-chip text-nav')}>{c}</span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="lg:mt-auto flex items-center gap-3 shrink-0 ml-auto lg:ml-0">
        <span className="grid place-items-center h-9 w-9 rounded-full bg-teal text-white text-xs font-bold" aria-hidden="true">{initials}</span>
        <span className="hidden sm:grid leading-tight text-xs">
          <strong className="text-[13px] text-white">{s?.user.name}</strong>
          <span className="text-nav-muted">Dispatcher · {s?.user.depot ?? 'Peliyagoda'} DC</span>
          <span className="text-ok-online">Online{synced ? ` · synced ${synced}` : ''}</span>
        </span>
        <button className="ml-1 p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5" title="Sign out" aria-label="Sign out"
          onClick={() => { setSession(null); nav('/login'); }}>
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}

/** Server-Sent Events: any change (publish, deferral, delivery) refreshes the dispatcher screens. */
function useLiveEvents() {
  const qc = useQueryClient();
  const toast = useToast();
  const [synced, setSynced] = useState<string | null>(null);
  useEffect(() => {
    const token = getSession()?.token;
    if (!token) return;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    const stamp = () => setSynced(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    es.onopen = stamp;
    es.onmessage = (m) => {
      stamp();
      const ev = JSON.parse(m.data) as TLiveEvent;
      qc.invalidateQueries({ queryKey: ['dispatch'] });
      if (ev.kind === 'stop.failed' || ev.kind === 'load.shortfall' || ev.kind === 'receipt.issue') toast({ tone: 'bad', title: ev.message });
    };
    return () => es.close();
  }, [qc, toast]);
  return synced;
}
