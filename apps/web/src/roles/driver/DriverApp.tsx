// Driver phone app (390 × 844, Figma M1–M8). Works with no signal: see store.tsx.
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { DriverStore, useDriver } from './store';
import { BigButton, Card, Chip } from './ui';
import { TodaysRuns } from './TodaysRuns';
import { LoadCheck } from './LoadCheck';
import { RouteProgress, StopsList } from './RouteProgress';
import { NavigateStop } from './NavigateStop';
import { StopArrival } from './StopArrival';
import { ProofOfDelivery } from './ProofOfDelivery';
import { ReportProblem } from './ReportProblem';
import { SyncScreen } from './SyncScreen';
import { BiometricGate } from './BiometricLock';

export function DriverApp() {
  return (
    <DriverStore>
      {/* Fingerprint lock (if the driver turned it on). The store above keeps syncing while it is shown. */}
      <BiometricGate>
      <Routes>
        <Route index element={<TodaysRuns />} />
        <Route path="load/:tripId" element={<LoadCheck />} />
        <Route path="run" element={<RouteProgress />} />
        <Route path="stops" element={<StopsList />} />
        <Route path="sync" element={<SyncScreen />} />
        <Route path="stop/:stopId" element={<StopArrival />} />
        <Route path="stop/:stopId/navigate" element={<NavigateStop />} />
        <Route path="stop/:stopId/pod" element={<ProofOfDelivery />} />
        <Route path="stop/:stopId/problem" element={<ReportProblem />} />
        <Route path="*" element={<Navigate to="/driver" replace />} />
      </Routes>
      <BackOnline />
      </BiometricGate>
    </DriverStore>
  );
}

/** M8 · Back online: what was sent, and what changed in the plan while the phone had no signal. */
function BackOnline() {
  const d = useDriver();
  const nav = useNavigate();
  const b = d.backOnline;
  if (!b) return null;
  return (
    <div className="fixed inset-0 z-40 bg-drv-header/60 grid items-end sm:place-items-center" role="dialog" aria-modal="true" aria-label="Back online">
      <div className="bg-drv-page w-full max-w-[480px] mx-auto rounded-t-2xl sm:rounded-2xl p-4 grid gap-3 max-h-[92vh] overflow-auto">
        <div className="grid gap-1">
          <h2 className="text-[22px] font-bold">Back online</h2>
          <p className="text-[13px] text-drv-muted">Your saved work has been sent to the dispatcher.</p>
        </div>
        <Card>
          <div className="flex items-center mb-2">
            <strong className="text-[15px]">Synced {b.synced.length} of {b.synced.length} records</strong>
            <span className="ml-auto"><Chip tone="green">Complete</Chip></span>
          </div>
          <div className="h-2 rounded bg-ok mb-3" />
          <ul className="grid gap-2">
            {b.synced.map((x, i) => (
              <li key={i} className="flex items-center gap-2 text-[14px]">
                <span className="text-ok font-bold" aria-hidden="true">✓</span>
                <span className="font-medium">{x.label}</span>
                <span className="ml-auto text-[12px] text-drv-muted">{new Date(x.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </Card>
        {b.change && (
          <section className="rounded-xl border border-drv-amberLine bg-drv-amberBg p-4 grid gap-2">
            <strong className="text-[14px] text-drv-amber">Plan updated to v{b.change.to} while offline</strong>
            {b.change.lines.map((l, i) => <p key={i} className="text-[12px]">{l}</p>)}
            <div className="rounded-lg bg-white px-3 py-2 text-[12px] grid grid-cols-[40px_1fr] gap-1">
              <span className="text-drv-muted font-medium">Was</span><pre className="font-sans whitespace-pre-wrap text-drv-muted">{b.change.was}</pre>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 text-[12px] grid grid-cols-[40px_1fr] gap-1">
              <span className="text-drv-muted font-medium">Now</span><pre className="font-sans whitespace-pre-wrap font-semibold">{b.change.now}</pre>
            </div>
            <p className="text-[12px] font-medium text-ok">Your delivered records were kept. Nothing to fix.</p>
          </section>
        )}
        <BigButton onClick={() => { d.dismissBackOnline(); nav('/driver/run'); }}>{b.change ? 'Go to updated route' : 'Continue route'}</BigButton>
      </div>
    </div>
  );
}
