// Admin Console (desktop first, works on a phone): drivers on vehicles, account access, and system health.
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../../api';
import { Icon } from '../../ui/Icon';
import { ToastProvider } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { System } from './System';
import { Fleet } from './Fleet';
import { Accounts } from './Accounts';
import { Demo } from './Demo';

export function AdminApp() {
  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
        <Sidebar />
        <main className="min-w-0 px-4 py-6 sm:px-7 lg:py-7">
          <Routes>
            <Route index element={<System />} />
            <Route path="fleet" element={<Fleet />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="demo" element={<Demo />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

/** Icons for this console only (the shared icon set has no people or gauge glyphs). */
const Glyph = ({ d }: { d: string }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-nav-muted" aria-hidden="true"><path d={d} /></svg>
);
const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/admin', label: 'System', end: true, icon: <Glyph d="M12 3a9 9 0 1 0 9 9M12 12l5-5M3 12h2M12 3v2M19 12h2" /> },
  { to: '/admin/fleet', label: 'Vehicles & drivers', icon: <Icon name="truck" className="text-nav-muted" /> },
  { to: '/admin/demo', label: 'Demo mode', icon: <Glyph d="M5 4l14 8-14 8V4Z" /> },
  { to: '/admin/accounts', label: 'Accounts', icon: <Glyph d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" /> },
];

function Sidebar() {
  const s = getSession();
  const nav = useNavigate();
  const initials = (s?.user.name ?? 'A').split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <aside className="bg-nav text-nav-text lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-4 px-4 py-4 lg:px-5 lg:py-6 overflow-x-auto">
      <div className="flex items-center gap-3 shrink-0 lg:mb-2">
        <span className="grid place-items-center h-10 w-10 rounded-lg bg-surface">
          <img src="/logo-mark.png" alt="" className="w-7" />
        </span>
        <span className="hidden sm:grid leading-tight">
          <strong className="text-[15px] text-white">Waypoint</strong>
          <span className="text-xs text-nav-muted">Admin Console</span>
        </span>
      </div>
      <nav aria-label="Admin" className="flex lg:grid gap-1 lg:gap-2">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cx('flex items-center gap-3 h-11 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors', isActive ? 'bg-nav-active text-white' : 'text-nav-text hover:bg-white/5')}>
            {n.icon}
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="lg:mt-auto flex items-center gap-3 shrink-0 ml-auto lg:ml-0">
        <span className="grid place-items-center h-9 w-9 rounded-full bg-teal text-white text-xs font-bold" aria-hidden="true">{initials}</span>
        <span className="hidden sm:grid leading-tight text-xs">
          <strong className="text-[13px] text-white">{s?.user.name}</strong>
          <span className="text-nav-muted">Administrator</span>
        </span>
        <button className="ml-1 p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5" title="Sign out" aria-label="Sign out"
          onClick={() => { setSession(null); nav('/login'); }}>
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
