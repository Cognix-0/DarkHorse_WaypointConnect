// M3 · Route progress (Run tab) and the Stops tab.
import { useNavigate } from 'react-router-dom';
import type { TDriverTripDto, TStopDto } from '@waypoint/shared/contract';
import { cx } from '../../ui/format';
import { clock, useDriver, uuid } from './store';
import { activeTrip, BigButton, Card, Chip, expectedEta, isDone, nextStop, Notice, Screen, SeqDot, Stat, tempLabel, toMin } from './ui';

export function RouteProgress() {
  const d = useDriver();
  const nav = useNavigate();
  const r = d.route;
  const t = activeTrip(r);
  if (!r || !t) {
    return (
      <Screen title="Route" tabs>
        <Notice tone="blue" title={r ? 'All trips done' : 'No route on this phone yet'}>{r ? 'Every stop today is delivered or reported.' : 'Open the app once with signal.'}</Notice>
      </Screen>
    );
  }
  if (t.status !== 'departed') {
    return (
      <Screen title={`Trip ${t.tripNo} · not started`} tabs>
        <Notice title="Start from the load check">Check the load and confirm departure first.</Notice>
        <BigButton onClick={() => nav(`/driver/load/${t.tripId}`)}>Open load check</BigButton>
      </Screen>
    );
  }
  const done = t.stops.filter(isDone).length;
  const next = nextStop(t)!;
  const later = t.stops.filter((s) => !isDone(s) && s !== next);
  const eta = expectedEta(t, next);
  const close = toMin(next.outlet.windowClose);
  const etaMin = toMin(eta);
  const risk = Math.max(0, Math.min(99, Math.round(((etaMin - (close - 40)) / 40) * 100)));
  const late = etaMin > close;

  async function arrived() {
    if (next.status === 'pending') await d.enqueue({ eventId: uuid(), type: 'stop.arrived', stopId: next.stopId, occurredAt: new Date().toISOString() }, `Arrived · ${next.outlet.id} ${next.outlet.district}`);
    nav(`/driver/stop/${next.stopId}`);
  }

  return (
    <Screen title={`Trip ${t.tripNo} · in progress`} tabs>
      {!d.online && <OfflineStrip />}
      <Card className="py-3">
        <div className="flex items-center text-[14px]">
          <strong>{done} of {t.stops.length} stops done</strong>
          <span className="ml-auto text-[13px] text-drv-muted">Dep {t.departAt}</span>
        </div>
        <div className="h-2 rounded bg-drv-soft mt-2 overflow-hidden"><div className="h-full rounded bg-ok" style={{ width: `${(done / t.stops.length) * 100}%` }} /></div>
      </Card>

      <Card active>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="solid">NEXT · STOP {next.seq}</Chip>
          {late ? <Chip tone="red">Late</Chip> : risk >= 30 && <Chip tone="orange">Late risk {risk}%</Chip>}
          {next.status === 'arrived' && <Chip tone="green">Arrived</Chip>}
        </div>
        <h2 className="text-[18px] font-bold mt-2">{next.outlet.id} · {next.outlet.district}</h2>
        <p className="text-[13px] text-drv-muted mt-1">{next.outlet.brand} · {tempLabel(next.temp)} · {next.units} {next.unitLabel} · {Math.round(next.weightKg)} kg</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Stat label="ETA" value={eta} tone={late ? 'red' : undefined} />
          <Stat label="Window closes" value={next.outlet.windowClose} />
        </div>
        {late && <p className="text-[12px] font-medium text-ok mt-2">Store manager told to expect ~{eta}</p>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <BigButton secondary onClick={() => nav(`/driver/stop/${next.stopId}/navigate`)}>Navigate</BigButton>
          <BigButton onClick={arrived}>{next.status === 'arrived' ? 'Open stop' : "I've arrived"}</BigButton>
        </div>
      </Card>

      {t.stops.filter(isDone).map((s) => <DoneStop key={s.stopId} s={s} queued={d.queue.some((q) => 'stopId' in q && q.stopId === s.stopId)} />)}
      {later.length > 0 && (
        <Card className="py-3">
          <p className="text-[13px] font-medium text-drv-muted">Then: {later.map((s) => `${s.outlet.id} ${s.outlet.district}`).join(' · ')}</p>
        </Card>
      )}
    </Screen>
  );
}

function DoneStop({ s, queued }: { s: TStopDto; queued: boolean }) {
  const at = s.deliveredAt ?? s.arrivedAt;
  const onTime = at ? toMin(clock(new Date(at))) <= toMin(s.outlet.windowClose) || Math.abs(toMin(clock(new Date(at))) - toMin(s.plannedArrival)) > 180 : true;
  return (
    <Card className="py-3">
      <div className="flex items-center gap-3">
        <SeqDot n={s.seq} done={s.status === 'delivered'} />
        <div className="grid min-w-0">
          <strong className="text-[15px] truncate">{s.outlet.id} · {s.outlet.district}</strong>
          <span className="text-[12px] text-drv-muted">
            {s.status === 'failed' ? 'Not delivered · reported' : `Delivered ${at ? clock(new Date(at)) : ''}`} · {queued ? 'saved on phone' : 'POD sent'}
          </span>
        </div>
        <span className="ml-auto">{s.status === 'failed' ? <Chip tone="red">Failed</Chip> : onTime ? <Chip tone="green">On time</Chip> : <Chip tone="amber">Late</Chip>}</span>
      </div>
    </Card>
  );
}

function OfflineStrip() {
  const d = useDriver();
  const nav = useNavigate();
  return (
    <button className="text-left" onClick={() => nav('/driver/sync')}>
      <Notice tone="orange" title="No signal · keep working">Everything saves on this phone{d.queue.length ? ` (${d.queue.length} waiting)` : ''}. It sends itself when signal returns.</Notice>
    </button>
  );
}

/** Stops tab: every stop of every trip today. */
export function StopsList() {
  const d = useDriver();
  const nav = useNavigate();
  const r = d.route;
  return (
    <Screen title="Stops today" sub={r ? `${r.trips.reduce((n, t) => n + t.stops.length, 0)} stops · plan v${r.version}` : undefined} tabs>
      {(r?.trips ?? []).map((t: TDriverTripDto) => (
        <section key={t.tripId} className="grid gap-2">
          <h2 className="text-[13px] font-semibold text-drv-muted mt-1">Trip {t.tripNo} · {t.district} · Dep {t.departAt}</h2>
          {t.stops.map((s) => (
            <button key={s.stopId} className="text-left" onClick={() => nav(`/driver/stop/${s.stopId}`)} disabled={t.status !== 'departed' && !isDone(s)}>
              <Card className={cx('py-3', t.status !== 'departed' && !isDone(s) && 'opacity-70')}>
                <div className="flex items-center gap-3">
                  <SeqDot n={s.seq} done={s.status === 'delivered'} />
                  <div className="grid min-w-0">
                    <strong className="text-[15px] truncate">{s.outlet.id} · {s.outlet.district}</strong>
                    <span className="text-[12px] text-drv-muted">{s.units} {s.unitLabel} · ETA {s.plannedArrival} · window {s.outlet.windowOpen}–{s.outlet.windowClose}</span>
                  </div>
                  <span className="ml-auto">
                    {s.status === 'delivered' ? <Chip tone="green">Done</Chip> : s.status === 'failed' ? <Chip tone="red">Failed</Chip> : s.status === 'arrived' ? <Chip tone="blue">Here</Chip> : null}
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </section>
      ))}
    </Screen>
  );
}
