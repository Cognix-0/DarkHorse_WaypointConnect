// Store manager app: desktop (sidebar, Figma D-SM1–D-SM9) and phone (dark header + tabs, Figma SM1–SM9) from one set of screens.
import { useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../../api';
import { Icon } from '../../ui/Icon';
import { ToastProvider } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useMarkRead, useNotifications, useToday } from './api';
import { hhmm } from './ui';
import { Today } from './Today';
import { PlaceOrder } from './PlaceOrder';
import { OrderDetail } from './OrderDetail';
import { ConfirmReceipt } from './ConfirmReceipt';
import { Orders } from './Orders';
import { Receipts } from './Receipts';
import { Help } from './Help';

export function StoreApp() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-page lg:grid lg:grid-cols-[240px_1fr]">
        <Sidebar />
        <div className="min-w-0 flex flex-col min-h-screen pb-[76px] lg:pb-0">
          <Routes>
            <Route index element={<Today />} />
            <Route path="order" element={<PlaceOrder />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="orders/:id/receipt" element={<ConfirmReceipt />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<Navigate to="/store" replace />} />
          </Routes>
        </div>
        <TabBar />
      </div>
    </ToastProvider>
  );
}

const NAV: [string, string, string, boolean][] = [
  ['/store', 'Today', 'overview', true], ['/store/orders', 'Orders', 'queue', false], ['/store/receipts', 'Receipts', 'check', false], ['/store/help', 'Help', 'alert', false],
];

function Sidebar() {
  const s = getSession();
  const t = useToday();
  const nav = useNavigate();
  const o = t.data?.outlet;
  return (
    <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen bg-nav px-5 py-6 gap-5">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center h-[38px] w-[38px] rounded-[10px] bg-surface"><img src="/logo-mark.png" alt="" className="w-7" /></span>
        <span className="grid leading-tight"><strong className="text-[16px] text-white">Waypoint</strong><span className="text-xs text-nav-sub">Store manager</span></span>
      </div>
      <div className="rounded-[10px] bg-st-outlet px-3 py-2.5 leading-tight">
        <strong className="block text-[13px] text-white">{o ? o.name.split(',')[0] : '…'}</strong>
        <span className="text-xs text-nav-sub">{o ? `${o.district} · ${o.id}` : ''}</span>
      </div>
      <nav aria-label="Store" className="grid gap-1.5">
        {NAV.map(([to, label, icon, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }: { isActive: boolean }) => cx('flex items-center gap-3 h-[42px] px-3 rounded-[10px] text-sm', isActive ? 'bg-nav-active text-white font-semibold' : 'text-nav-soft font-medium hover:bg-white/5')}>
            <Icon name={icon} className="text-nav-muted" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5">
        <span className="grid place-items-center h-9 w-9 rounded-full bg-teal text-white text-xs font-bold" aria-hidden="true">{(s?.user.name ?? 'S').split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
        <span className="grid leading-tight"><strong className="text-[13px] text-white">{s?.user.name}</strong><span className="text-[11px] text-nav-sub">{o?.district ?? ''}</span></span>
        <button className="ml-auto p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5" aria-label="Sign out" title="Sign out" onClick={() => { setSession(null); nav('/login'); }}><Icon name="logout" /></button>
      </div>
    </aside>
  );
}

function TabBar() {
  return (
    <nav aria-label="Store" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-drv-line flex pb-[env(safe-area-inset-bottom)]">
      {NAV.map(([to, label, , end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }: { isActive: boolean }) => cx('flex-1 grid place-items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-drv-primary' : 'text-drv-muted')}>
          <span className="h-1.5 w-6 rounded-full bg-current opacity-80" aria-hidden="true" />{label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Every store screen: white top bar on desktop, dark header on the phone. */
export function Page({ title, sub, pill, children }: { title: string; sub?: ReactNode; pill?: ReactNode; children: ReactNode }) {
  const t = useToday();
  const o = t.data?.outlet;
  return (
    <>
      <header className="lg:hidden sticky top-0 z-20 bg-drv-header px-5 pt-[max(12px,env(safe-area-inset-top))] pb-3 flex items-center gap-3">
        <span className="grid place-items-center h-9 w-9 rounded-lg bg-surface shrink-0"><img src="/logo-mark.png" alt="" className="w-6" /></span>
        <span className="grid leading-tight min-w-0"><strong className="text-[15px] text-white truncate">{o ? o.name.split(',')[0] : 'Waypoint'}</strong><span className="text-xs text-drv-sub truncate">{o ? `${o.district} · ${o.id}` : ''}</span></span>
        <span className="ml-auto"><Updates dark /></span>
      </header>
      <header className="hidden lg:flex items-center gap-4 bg-surface border-b border-st-bar px-8 h-[91px] sticky top-0 z-20">
        <div className="grid gap-1 mr-auto">
          <h1 className="text-[26px] font-bold text-st-navy leading-tight">{title}</h1>
          {sub && <p className="text-[13px] text-st-muted">{sub}</p>}
        </div>
        {pill}
        <Updates />
      </header>
      <main className="px-4 py-4 lg:px-8 lg:py-7 grid gap-5 content-start">
        <div className="lg:hidden grid gap-1">
          <h1 className="text-[22px] font-bold text-st-ink leading-tight">{title}</h1>
          {sub && <p className="text-[13px] text-st-muted">{sub}</p>}
        </div>
        {children}
      </main>
    </>
  );
}

/** "2 updates": the store's notifications (deliveries, deferrals, shortfalls). Opening it marks them read. */
function Updates({ dark }: { dark?: boolean }) {
  const t = useToday();
  const n = useNotifications();
  const read = useMarkRead();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = t.data?.unread ?? 0;
  return (
    <div className="relative">
      <button onClick={() => { setOpen((x) => !x); if (!open && unread) read.mutate(); }} aria-expanded={open}
        className={cx('h-7 px-3 rounded-full text-[13px] font-semibold', unread ? 'bg-teal text-white' : dark ? 'bg-white/10 text-white' : 'bg-offline-tint text-st-muted')}>
        {unread ? `${unread} update${unread === 1 ? '' : 's'}` : 'Updates'}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-32px))] max-h-[60vh] overflow-auto card p-2 z-40 text-left">
          {(n.data ?? []).length === 0 && <p className="p-3 text-[13px] text-st-muted">No updates yet.</p>}
          {(n.data ?? []).map((x) => (
            <button key={x.id} className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-sunk grid gap-0.5" onClick={() => { setOpen(false); if (x.orderId) nav(`/store/orders/${x.orderId}`); }}>
              <span className="flex items-center gap-2"><strong className="text-[13px] text-st-ink">{x.title}</strong>{!x.read && <i className="h-2 w-2 rounded-full bg-teal" />}<span className="ml-auto text-[11px] text-st-muted">{hhmm(x.at)}</span></span>
              <span className="text-xs text-st-muted">{x.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
