// Driver phone building blocks (Figma M1–M8): dark header with sync state, 56 px+ buttons, high-contrast chips.
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { TDriverRouteResponse, TDriverTripDto, TStopDto } from '@waypoint/shared/contract';
import { setSession } from '../../api';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/format';
import { clock, minutesSince, useDriver } from './store';

export function Screen({ title, sub, children, footer, tabs }: { title?: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; tabs?: boolean }) {
  return (
    <div className="min-h-screen bg-drv-page text-drv-ink flex flex-col max-w-[480px] mx-auto">
      <Header />
      <main className="flex-1 px-4 pt-4 pb-6 grid gap-3 content-start">
        {title && (
          <div className="grid gap-1 mb-1">
            <h1 className="text-[22px] font-bold leading-tight">{title}</h1>
            {sub && <p className="text-[13px] text-drv-muted">{sub}</p>}
          </div>
        )}
        {children}
      </main>
      {footer && <footer className="sticky bottom-0 bg-white border-t border-drv-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] grid gap-2">{footer}</footer>}
      {tabs && <TabBar />}
    </div>
  );
}

function Header() {
  const d = useDriver();
  const r = d.route;
  return (
    <header className="sticky top-0 z-20 bg-drv-header text-white px-5 pt-[max(12px,env(safe-area-inset-top))] pb-3 flex items-center gap-3">
      <div className="grid leading-tight min-w-0">
        <strong className="text-[18px]">Waypoint</strong>
        <span className="text-[11px] text-drv-sub truncate">Driver · {r?.vehicleId ?? '—'} · {r?.driverName ?? ''}</span>
      </div>
      <SyncPill />
      <SignOut />
    </header>
  );
}

/** Small sign-out icon in the header. Updates not sent yet stay on the phone and go out after the next sign-in. */
function SignOut() {
  const d = useDriver();
  function signOut() {
    const waiting = d.queue.length;
    if (waiting && !window.confirm(`${waiting} update${waiting > 1 ? 's are' : ' is'} not sent yet. They stay on this phone and are sent after you sign in again. Sign out?`)) return;
    setSession(null);
    window.location.assign('/login');
  }
  return (
    <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out"
      className="shrink-0 -mr-2 grid place-items-center h-10 w-10 rounded-full text-drv-sub hover:text-white hover:bg-white/10">
      <Icon name="logout" size={20} />
    </button>
  );
}

export function SyncPill() {
  const d = useDriver();
  const waiting = d.queue.length;
  if (!d.online) {
    return (
      <span className="ml-auto h-6 px-3 rounded-full bg-drv-offline text-drv-yellow text-[11px] font-medium grid place-items-center whitespace-nowrap" role="status">
        Offline · {minutesSince(d.offlineSince)} min{waiting ? ` · ${waiting} saved` : ''}
      </span>
    );
  }
  return (
    <span className="ml-auto h-6 px-3 rounded-full bg-drv-online text-ok-online text-[11px] font-medium grid place-items-center whitespace-nowrap" role="status">
      {d.syncing ? 'Syncing…' : waiting ? `Online · ${waiting} to send` : `Online · synced ${d.lastSyncAt ? clock(new Date(d.lastSyncAt)) : clock()}`}
    </span>
  );
}

function TabBar() {
  const d = useDriver();
  const tab = (to: string, label: string, end = false, badge = 0) => (
    <NavLink to={to} end={end} className={({ isActive }: { isActive: boolean }) => cx('flex-1 grid place-items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-drv-primary' : 'text-drv-muted')}>
      <span className={cx('h-1.5 w-6 rounded-full', 'bg-current opacity-80')} aria-hidden="true" />
      <span>{label}{badge ? ` (${badge})` : ''}</span>
    </NavLink>
  );
  return (
    <nav aria-label="Driver" className="sticky bottom-0 bg-white border-t border-drv-line flex pb-[env(safe-area-inset-bottom)]">
      {tab('/driver/run', 'Run')}
      {tab('/driver/stops', 'Stops')}
      {tab('/driver/sync', 'Sync', false, d.queue.length)}
    </nav>
  );
}

export const Card = ({ children, className, active }: { children: ReactNode; className?: string; active?: boolean }) => (
  <section className={cx('bg-white rounded-xl border p-4', active ? 'border-drv-primary border-2' : 'border-drv-line', className)}>{children}</section>
);

export function Chip({ tone = 'grey', children }: { tone?: 'green' | 'grey' | 'blue' | 'amber' | 'red' | 'solid' | 'orange' | 'chill'; children: ReactNode }) {
  const t = {
    green: 'bg-ok-soft text-ok', grey: 'bg-drv-soft text-drv-chip', blue: 'bg-primary-soft text-primary', amber: 'bg-drv-amberBg text-drv-amber',
    red: 'bg-drv-redBg text-drv-red', solid: 'bg-drv-primary text-white', orange: 'bg-warn-soft text-warn', chill: 'bg-chill-soft text-chill',
  }[tone];
  return <span className={cx('inline-flex items-center h-5 px-2 rounded-md text-[11px] font-semibold whitespace-nowrap', t)}>{children}</span>;
}

export const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' }) => (
  <div className="rounded-[10px] bg-drv-page px-3 py-2.5 grid gap-0.5">
    <span className="text-[11px] font-medium text-drv-muted">{label}</span>
    <strong className={cx('text-[16px] font-bold tabular', tone === 'red' ? 'text-drv-red' : 'text-drv-ink')}>{value}</strong>
  </div>
);

export function Notice({ tone = 'amber', title, children }: { tone?: 'amber' | 'red' | 'orange' | 'blue'; title: string; children?: ReactNode }) {
  const t = {
    amber: ['bg-drv-amberBg border-drv-amberLine', 'text-drv-amber', 'bg-drv-amber'],
    red: ['bg-drv-redBg border-drv-redLine', 'text-drv-red', 'bg-drv-red'],
    orange: ['bg-warn-tint border-warn-chip', 'text-warn', 'bg-warn'],
    blue: ['bg-drv-tint border-drv-tintLine', 'text-primary', 'bg-primary'],
  }[tone];
  return (
    <div className={cx('rounded-xl border p-3.5 flex gap-3', t[0])} role="status">
      <span className={cx('grid place-items-center h-6 w-6 rounded-full text-white text-xs font-bold shrink-0', t[2])} aria-hidden="true">!</span>
      <div className="grid gap-0.5">
        <strong className={cx('text-[13px] font-semibold', t[1])}>{title}</strong>
        {children && <div className="text-[12px] text-drv-ink">{children}</div>}
      </div>
    </div>
  );
}

export const BigButton = ({ children, onClick, secondary, disabled, href }: { children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean; href?: string }) => {
  const cls = cx('w-full min-h-[50px] rounded-xl text-[16px] font-semibold grid place-items-center px-4 text-center disabled:opacity-50',
    secondary ? 'bg-white text-drv-ink border border-drv-line' : 'bg-drv-primary text-white');
  return href ? <a className={cls} href={href} target="_blank" rel="noreferrer">{children}</a> : <button className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
};

export const SeqDot = ({ n, done }: { n: number; done?: boolean }) => (
  <span className={cx('grid place-items-center h-8 w-8 rounded-full text-[13px] font-bold shrink-0', done ? 'bg-ok-soft text-ok' : 'bg-drv-soft text-drv-chip')}>{done ? '✓' : n}</span>
);

// ---------- route helpers ----------
export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
export const isDone = (s: TStopDto) => s.status === 'delivered' || s.status === 'failed';
export const activeTrip = (r: TDriverRouteResponse | null): TDriverTripDto | undefined => r?.trips.find((t) => t.status !== 'done');
export const nextStop = (t: TDriverTripDto | undefined) => t?.stops.find((s) => !isDone(s));
export const findStop = (r: TDriverRouteResponse | null, stopId: string) => {
  for (const t of r?.trips ?? []) for (const s of t.stops) if (s.stopId === stopId) return { trip: t, stop: s };
  return null;
};
/** Expected arrival: the plan, or now + the drive if the plan time has already passed. */
export function expectedEta(t: TDriverTripDto, s: TStopDto): string {
  if (s.arrivedAt) return clock(new Date(s.arrivedAt));
  if (t.status !== 'departed') return s.plannedArrival;
  const now = toMin(clock());
  // Only project when the phone clock is on the same morning as the plan (demo runs happen at any hour).
  if (Math.abs(now - toMin(s.plannedArrival)) > 180) return s.plannedArrival;
  return toHHMM(Math.max(toMin(s.plannedArrival), now + s.legMin));
}
export const DOCK: Record<string, string> = { rear_dock: 'rear dock', street: 'street', mall_bay: 'mall bay' };
export const tempLabel = (t: string) => (t === 'chilled' ? 'Chilled' : 'Ambient');
