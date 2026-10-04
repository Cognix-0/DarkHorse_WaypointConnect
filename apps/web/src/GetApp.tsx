// Public page (no sign-in): how to put Waypoint Connect on a phone.
// Android: download the APK (if the team has published one in public/downloads/) or install from Chrome.
// iPhone: Add to Home Screen. Both give the same offline app as the browser.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const APK_PATH = '/downloads/waypoint-connect.apk';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; listeners.forEach((f) => f()); });
}

const platform = () => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
};
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function GetApp() {
  const [os] = useState(platform);
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [apk, setApk] = useState<{ size: number } | null>(null);
  const [done, setDone] = useState(installed());

  useEffect(() => {
    const f = () => setCanPrompt(!!deferred);
    listeners.add(f);
    fetch(APK_PATH, { method: 'HEAD' })
      .then((r) => { if (r.ok && !(r.headers.get('content-type') ?? '').includes('html')) setApk({ size: Number(r.headers.get('content-length') ?? 0) }); })
      .catch(() => {});
    return () => { listeners.delete(f); };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null; setCanPrompt(false);
    if (r.outcome === 'accepted') setDone(true);
  }

  const url = window.location.origin;
  return (
    <main className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-md grid gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl" />
          <div className="grid leading-tight"><strong className="text-lg">Waypoint Connect</strong><span className="text-sm text-ink-3">For drivers, loaders and store managers</span></div>
        </div>

        {done && <section className="card p-4 text-sm"><strong className="text-ok">The app is installed on this device.</strong> Open it from your home screen.</section>}

        <section className={`card p-5 grid gap-3 ${os === 'android' ? 'ring-2 ring-primary' : ''}`} aria-labelledby="android-h">
          <h2 id="android-h" className="text-base font-semibold">Android</h2>
          {apk && (
            <>
              <a href={APK_PATH} download className="btn-primary h-12 grid place-items-center">Download the driver app (APK{apk.size ? ` · ${(apk.size / 1048576).toFixed(1)} MB` : ''})</a>
              <p className="text-xs text-ink-3">Open the downloaded file and allow “Install unknown apps” for your browser when Android asks. The app is not on the Play Store yet.</p>
            </>
          )}
          {canPrompt
            ? <button className={apk ? 'btn-secondary h-12' : 'btn-primary h-12'} onClick={install}>Install from Chrome</button>
            : !apk && <p className="text-sm">Open <strong>{url}</strong> in Chrome, tap <strong>⋮</strong> → <strong>Add to Home screen</strong> → <strong>Install</strong>.</p>}
        </section>

        <section className={`card p-5 grid gap-2 ${os === 'ios' ? 'ring-2 ring-primary' : ''}`} aria-labelledby="ios-h">
          <h2 id="ios-h" className="text-base font-semibold">iPhone and iPad</h2>
          <ol className="list-decimal pl-5 text-sm grid gap-1">
            <li>Open <strong>{url}</strong> in <strong>Safari</strong>.</li>
            <li>Tap <strong>Share</strong> (the square with an arrow).</li>
            <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        </section>

        <section className="card p-5 grid gap-1 text-sm">
          <h2 className="text-base font-semibold">Works without signal</h2>
          <p className="text-ink-2">Sign in once with signal. After that the driver app opens offline, keeps deliveries on the phone and sends them when the signal returns.</p>
        </section>

        <Link to="/login" className="text-primary font-semibold text-sm justify-self-center">Go to sign in</Link>
      </div>
    </main>
  );
}
