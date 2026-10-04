// Keeps every screen current without a browser refresh:
// 1. Data: listens to GET /api/changes (Server-Sent Events). When anything changes (a store order, a plan, loading,
//    a delivery, an admin edit, the 16:00 run switch) the screen refetches what it shows. It also catches up after
//    the connection drops or the tab comes back to the front.
// 2. App: compares this build with /version.json; when a new version is deployed it shows an "Update" bar (it never
//    reloads by itself, so nobody loses a form they are filling in).
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getSession } from './api';

declare const __BUILD_ID__: string;

/** Screens outside React Query (the driver's offline store) listen for this window event. */
export const CHANGED_EVENT = 'waypoint:changed';

export function LiveSync() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const token = getSession()?.token ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Data
  useEffect(() => {
    const refresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void qc.invalidateQueries();
        window.dispatchEvent(new Event(CHANGED_EVENT));
      }, 300);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);

    let es: EventSource | null = null;
    let dropped = false;
    if (token && typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/changes?token=${encodeURIComponent(token)}`);
      es.onmessage = refresh;
      // The browser reconnects by itself; after a drop, catch up on what was missed.
      es.onerror = () => { dropped = true; };
      es.onopen = () => { if (dropped) { dropped = false; refresh(); } };
    }
    return () => {
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
    // Reconnect when the signed-in account changes (sign in, sign out).
  }, [qc, token, pathname.split('/')[1]]);

  return <UpdateBanner />;
}

/** "New version available" bar after a deploy. */
function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (stop || !build || build === __BUILD_ID__) return;
        // Never reload on its own: a driver may be half-way through a proof of delivery (the camera hides the tab).
        setReady(true);
      } catch { /* offline: try again later */ }
    };
    void check();
    const every = setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearInterval(every); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!ready) return null;
  return (
    <div role="status" className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 w-[min(440px,calc(100vw-32px))] rounded-xl shadow-toast bg-nav text-white px-4 py-3 flex items-center gap-3">
      <span className="text-[13px] mr-auto">A new version of Waypoint Connect is available.</span>
      <button className="btn-sm btn bg-surface text-ink hover:bg-sunk" onClick={() => window.location.reload()}>Update</button>
      <button className="text-nav-muted hover:text-white text-lg leading-none px-1" aria-label="Later" onClick={() => setReady(false)}>×</button>
    </div>
  );
}
