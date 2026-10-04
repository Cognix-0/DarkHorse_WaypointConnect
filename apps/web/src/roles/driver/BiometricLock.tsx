// Fingerprint lock screen and the "turn on fingerprint" card for the driver app (see biometric.ts).
import { useEffect, useState, type ReactNode } from 'react';
import { getSession, setSession } from '../../api';
import {
  biometricEnabled, biometricError, biometricSupported, disableBiometric, enableBiometric, isUnlocked, lockNow, RELOCK_AFTER_MS, verifyBiometric,
} from './biometric';
import { BigButton, Card } from './ui';

const DISMISSED = 'waypoint.driver.biometricOffer';

const Fingerprint = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className} aria-hidden="true">
    <path d="M12 11v3a8 8 0 0 1-1.5 4.7" /><path d="M8.5 12.5a3.5 3.5 0 0 1 7 0v1.5a12 12 0 0 1-.8 4.3" /><path d="M5.6 15.5A13 13 0 0 0 6 12.5a6 6 0 0 1 12 0v1" />
    <path d="M18.5 17.5c.3-1 .5-2 .5-3" /><path d="M4 11a8 8 0 0 1 13.6-5.6" /><path d="M8 21c.6-.8 1-1.7 1.4-2.6" /><path d="M12 21.5c.4-.6.7-1.3 1-2" />
  </svg>
);

/** Wraps the driver screens: if fingerprint unlock is on, nothing shows until the phone verifies its owner. */
export function BiometricGate({ children }: { children: ReactNode }) {
  const user = getSession()?.user;
  const enabled = !!user && biometricEnabled(user.id);
  const [locked, setLocked] = useState(() => enabled && !isUnlocked());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock again when the driver comes back after RELOCK_AFTER_MS in the background.
  useEffect(() => {
    if (!enabled) return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) { lockNow(); setLocked(true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);

  async function unlock() {
    setBusy(true); setError(null);
    try {
      if (await verifyBiometric()) setLocked(false);
      else setError('Not recognised. Try again.');
    } catch (e) { setError(biometricError(e)); } finally { setBusy(false); }
  }

  // Android Chrome can show the prompt straight away; iPhone needs a tap first, so the button stays.
  useEffect(() => { if (locked && /android/i.test(navigator.userAgent)) void unlock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked) return <>{children}</>;
  return (
    <div className="min-h-screen bg-drv-header text-white flex flex-col max-w-[480px] mx-auto px-6 pt-[max(48px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl" />
        <div className="grid leading-tight"><strong className="text-[18px]">Waypoint</strong><span className="text-[12px] text-drv-sub">Driver · {user?.vehicleId ?? ''}</span></div>
      </div>
      <div className="flex-1 grid place-items-center content-center gap-5 text-center">
        <button onClick={unlock} disabled={busy} aria-label="Unlock with fingerprint"
          className="h-28 w-28 rounded-full border-2 border-drv-sub grid place-items-center text-white disabled:opacity-60">
          <Fingerprint className="h-16 w-16" />
        </button>
        <div className="grid gap-1">
          <h1 className="text-[22px] font-bold">Hello{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p className="text-[14px] text-drv-sub">Touch the sensor or look at the phone to open your runs.</p>
        </div>
        {error && <p role="alert" className="text-[14px] font-semibold text-drv-yellow">{error}</p>}
      </div>
      <div className="grid gap-3">
        <BigButton onClick={unlock} disabled={busy}>{busy ? 'Waiting for fingerprint…' : 'Unlock with fingerprint'}</BigButton>
        <button className="h-12 text-[14px] font-semibold text-drv-sub" onClick={() => { setSession(null); window.location.assign('/login'); }}>
          Use password instead
        </button>
      </div>
    </div>
  );
}

/** On Today's runs: offer fingerprint unlock once, then show a small on/off row. */
export function BiometricSetting() {
  const user = getSession()?.user;
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(() => !!user && biometricEnabled(user.id));
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED) === '1');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void biometricSupported().then(setSupported); }, []);
  if (!user || !supported) return null;

  async function turnOn() {
    setBusy(true); setMsg(null);
    try { await enableBiometric({ id: user!.id, name: user!.name }); setOn(true); } catch (e) { setMsg(biometricError(e)); } finally { setBusy(false); }
  }
  function turnOff() { disableBiometric(); setOn(false); setMsg(null); }

  if (!on && !dismissed) {
    return (
      <Card className="grid gap-3">
        <div className="flex gap-3 items-start">
          <span className="h-10 w-10 rounded-full bg-drv-tint text-drv-primary grid place-items-center shrink-0"><Fingerprint className="h-6 w-6" /></span>
          <div className="grid gap-0.5">
            <strong className="text-[15px]">Open the app with your fingerprint</strong>
            <span className="text-[13px] text-drv-muted">No password at every stop. Works without signal. Your fingerprint stays on the phone.</span>
          </div>
        </div>
        {msg && <p role="status" className="text-[13px] font-semibold text-drv-red">{msg}</p>}
        <div className="grid grid-cols-2 gap-2">
          <BigButton secondary onClick={() => { localStorage.setItem(DISMISSED, '1'); setDismissed(true); }}>Not now</BigButton>
          <BigButton onClick={turnOn} disabled={busy}>{busy ? 'Waiting…' : 'Turn on'}</BigButton>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-1 px-1">
      <div className="flex items-center gap-2 text-[13px]">
        <Fingerprint className="h-5 w-5 text-drv-muted" />
        <span className="text-drv-muted whitespace-nowrap">Fingerprint unlock: <strong className="text-drv-ink">{on ? 'On' : 'Off'}</strong></span>
        <button className="ml-auto font-semibold text-drv-primary h-10 px-2" disabled={busy} onClick={on ? turnOff : turnOn}>{busy ? 'Waiting…' : on ? 'Turn off' : 'Turn on'}</button>
      </div>
      {msg && <p role="status" className="text-[12px] font-semibold text-drv-red">{msg}</p>}
    </div>
  );
}
