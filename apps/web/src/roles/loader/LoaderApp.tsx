// Dock Console (tablet 1280 × 800, Figma L1–L5): sidebar + choose vehicle, load goods, plan changes.
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../../api';
import { Icon } from '../../ui/Icon';
import { ToastProvider } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useVehicles } from './api';
import { ChooseVehicle } from './ChooseVehicle';
import { LoadGoods } from './LoadGoods';
import { PlanChanges } from './PlanChanges';

export const LAST_TRIP = 'waypoint.loader.trip';

export function LoaderApp() {
  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] bg-page">
        <Sidebar />
        <main className="min-w-0 px-4 py-5 sm:px-6">
          <Routes>
            <Route index element={<ChooseVehicle />} />
            <Route path="trip/:tripId" element={<LoadGoods />} />
            <Route path="changes" element={<PlanChanges />} />
            <Route path="*" element={<Navigate to="/loader" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

function Sidebar() {
  const s = getSession();
  const nav = useNavigate();
  const v = useVehicles();
  const toMove = v.data?.changes.toMove ?? 0;
  const pending = v.data && !v.data.changes.acknowledged && v.data.changes.toVersion > 1 ? Math.max(toMove, 1) : toMove;
  const last = localStorage.getItem(LAST_TRIP);
  const item = (to: string, label: string, icon: string, end = false, badge = 0, disabled = false) => disabled ? (
    <span className="flex items-center gap-3 h-[42px] px-3 rounded-[10px] text-sm font-medium text-nav-soft opacity-50" title="Choose a vehicle first">
      <Icon name={icon} className="text-nav-muted" /><span>{label}</span>
    </span>
  ) : (
    <NavLink to={to} end={end} aria-disabled={disabled}
      className={({ isActive }: { isActive: boolean }) => cx('flex items-center gap-3 h-[42px] px-3 rounded-[10px] text-sm whitespace-nowrap', isActive ? 'bg-nav-active text-white font-semibold' : 'text-nav-soft font-medium hover:bg-white/5', disabled && 'pointer-events-none opacity-50')}>
      <Icon name={icon} className="text-nav-muted" />
      <span>{label}</span>
      {badge > 0 && <span className="ml-1 grid place-items-center min-w-[22px] h-5 px-1.5 rounded-full bg-bad text-white text-2xs font-bold">{badge}</span>}
    </NavLink>
  );
  return (
    <aside className="bg-nav text-nav-text lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-3 px-4 py-4 lg:px-5 lg:py-6 overflow-x-auto">
      <div className="flex items-center gap-2.5 shrink-0 lg:mb-8">
        <span className="grid place-items-center h-[38px] w-[38px] rounded-[10px] bg-surface"><img src="/logo-mark.png" alt="" className="w-7" /></span>
        <span className="hidden sm:grid leading-tight">
          <strong className="text-[16px] text-white">Waypoint</strong>
          <span className="text-xs text-nav-sub">Dock Console</span>
        </span>
      </div>
      <p className="hidden lg:block text-[10px] font-semibold tracking-wider text-nav-label px-3.5 -mb-1">LOADING</p>
      <nav aria-label="Loader" className="flex lg:grid gap-1.5">
        {item('/loader', 'Choose vehicle', 'truck', true)}
        {item(last ? `/loader/trip/${last}` : '/loader', 'Load goods', 'queue', false, 0, !last)}
        {item('/loader/changes', 'Plan changes', 'board', false, pending)}
      </nav>
      <div className="lg:mt-auto flex items-center gap-2.5 shrink-0 ml-auto lg:ml-0">
        <span className="grid place-items-center h-9 w-9 rounded-full bg-teal text-white text-xs font-bold" aria-hidden="true">{(s?.user.name ?? 'L').split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
        <span className="hidden sm:grid leading-tight text-[11px]">
          <strong className="text-[13px] text-white">{s?.user.name}</strong>
          <span className="text-nav-sub">Loader · {s?.user.depot ?? 'Peliyagoda'} DC</span>
          <span className={!!v.error ? 'text-warn-chip' : 'text-ok-online'}>{!!v.error ? 'No connection · retrying' : `Online · synced ${v.data?.now ?? ''}`}</span>
        </span>
        <button className="ml-1 p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5" title="Sign out" aria-label="Sign out" onClick={() => { setSession(null); nav('/login'); }}>
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
