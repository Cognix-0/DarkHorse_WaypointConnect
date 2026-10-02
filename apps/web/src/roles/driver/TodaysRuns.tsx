// M1 · Today's runs
import { useNavigate } from 'react-router-dom';
import type { TDriverTripDto } from '@waypoint/shared/contract';
import { shortDate } from '../../ui/format';
import { useDriver } from './store';
import { activeTrip, BigButton, Card, Chip, Notice, Screen, Stat, tempLabel } from './ui';

const STATUS: Record<TDriverTripDto['status'], [string, 'green' | 'grey' | 'amber' | 'blue']> = {
  to_load: ['Not loaded', 'grey'], loading: ['Loading', 'amber'], sealed: ['Loaded', 'green'], departed: ['On the road', 'blue'], done: ['Done', 'green'],
};

export function TodaysRuns() {
  const d = useDriver();
  const nav = useNavigate();
  const r = d.route;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (r?.driverName ?? '').split(' ')[0];

  if (!d.loaded) return <Screen><p className="text-drv-muted">Opening your runs…</p></Screen>;
  if (!r) {
    return (
      <Screen title={`${hello}${first ? `, ${first}` : ''}`}>
        <Notice title={d.online ? 'Getting your runs' : 'No signal and nothing saved yet'}>
          {d.online ? d.error ?? 'One moment.' : 'Open the app once with signal before you leave the depot; after that it works offline.'}
        </Notice>
      </Screen>
    );
  }
  const trip = activeTrip(r);
  const fuelTotal = r.fuel.usedL + r.fuel.planL;

  let cta = <BigButton disabled>All runs done for today</BigButton>;
  if (trip) {
    if (trip.status === 'departed') cta = <BigButton onClick={() => nav('/driver/run')}>Continue Trip {trip.tripNo}</BigButton>;
    else if (trip.status === 'sealed') cta = <BigButton onClick={() => nav(`/driver/load/${trip.tripId}`)}>Review load &amp; start Trip {trip.tripNo}</BigButton>;
    else cta = (
      <>
        <BigButton secondary onClick={() => nav(`/driver/load/${trip.tripId}`)}>See what is being loaded</BigButton>
        <p className="text-[12px] text-drv-muted text-center">Waiting for the loader to seal {r.vehicleId} at Bay {trip.bay}. You can start once it is sealed.</p>
      </>
    );
  }

  return (
    <Screen title={`${hello}${first ? `, ${first}` : ''}`} sub={`${shortDate(r.date)} · ${r.vehicleId} · ${r.vehicleKind} · ${r.depot}`} footer={cta}>
      {d.planNotice && (
        <button className="text-left" onClick={d.dismissNotice}>
          <Notice title={`Plan updated to v${d.planNotice.to}`}>{d.planNotice.lines.join(' ')} <span className="text-drv-muted">Tap to dismiss.</span></Notice>
        </button>
      )}
      {!r.published && <Notice title="No plan yet">The dispatcher has not published tonight&apos;s plan. Pull down or reopen the app later.</Notice>}
      {r.published && r.trips.length === 0 && <Notice title="No runs for you today">{r.vehicleId} has no trips in plan v{r.version}.</Notice>}

      {r.trips.map((t) => {
        const isActive = t.tripId === trip?.tripId;
        const [label, tone] = STATUS[t.status];
        if (!isActive) {
          const locked = trip && t.tripNo > trip.tripNo;
          return (
            <Card key={t.tripId} className="py-3">
              <div className="flex items-center">
                <strong className="text-[15px] text-drv-muted">Trip {t.tripNo}</strong>
                <span className="ml-auto"><Chip tone={locked ? 'grey' : tone}>{locked ? 'Locked' : label}</Chip></span>
              </div>
              <p className="text-[12px] text-drv-muted mt-1">
                {t.stops.length} stops · {t.district} · Dep {t.departAt}{locked ? ` · unlocks after Trip ${trip!.tripNo}` : ''}
              </p>
            </Card>
          );
        }
        const open = t.stops.map((s) => s.outlet.windowOpen).sort()[0];
        const close = t.stops.map((s) => s.outlet.windowClose).sort().at(-1);
        return (
          <Card key={t.tripId} active>
            <div className="flex items-center">
              <strong className="text-[18px]">Trip {t.tripNo}</strong>
              <span className="ml-auto"><Chip tone={tone}>{label}</Chip></span>
            </div>
            <p className="text-[14px] text-drv-muted mt-1">{r.depot} → {t.district}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Chip tone={t.brand === 'Fresh' ? 'green' : 'blue'}>{t.brand}</Chip>
              <Chip tone={t.temp === 'chilled' ? 'chill' : 'grey'}>{tempLabel(t.temp)}</Chip>
              <Chip tone="blue">Window {open}–{close}</Chip>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Stat label="Depart" value={t.departAt} />
              <Stat label="Stops" value={t.stops.length} />
              <Stat label="Load" value={`${t.weightKg.toLocaleString('en-US')} kg`} />
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="flex items-center text-[13px] font-semibold">
          <span>Fuel this week</span>
          <span className="ml-auto tabular">{fuelTotal} / {r.fuel.quotaL} L</span>
        </div>
        <div className="h-2 rounded bg-drv-soft mt-2 overflow-hidden">
          <div className="h-full rounded bg-drv-primary" style={{ width: `${Math.min(100, (fuelTotal / Math.max(1, r.fuel.quotaL)) * 100)}%` }} />
        </div>
        <p className="text-[12px] text-drv-muted mt-2">This plan uses about {r.fuel.planL} L</p>
      </Card>
    </Screen>
  );
}
