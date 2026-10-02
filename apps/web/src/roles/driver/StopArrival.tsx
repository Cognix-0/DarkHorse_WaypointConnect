// M4 · Stop arrival
import { useNavigate, useParams } from 'react-router-dom';
import { clock, useDriver } from './store';
import { BigButton, Card, Chip, DOCK, findStop, Notice, Screen, tempLabel, toMin } from './ui';

export function StopArrival() {
  const { stopId } = useParams();
  const d = useDriver();
  const nav = useNavigate();
  const f = findStop(d.route, stopId ?? '');
  if (!f) return <Screen title="Stop"><Notice title="Stop not found" /></Screen>;
  const { trip, stop } = f;
  const arrived = stop.arrivedAt ? clock(new Date(stop.arrivedAt)) : null;
  const lateBy = arrived ? toMin(arrived) - toMin(stop.outlet.windowClose) : 0;
  const realLate = lateBy > 0 && lateBy < 180;
  const finished = stop.status === 'delivered' || stop.status === 'failed';
  const access = `${DOCK[stop.outlet.dockType] ?? ''}${stop.outlet.parking === 'van_only' ? ' · vans only' : stop.outlet.parking === 'mall_dock' ? ' · mall dock' : ''}`;
  return (
    <Screen
      footer={finished ? <BigButton onClick={() => nav('/driver/run')}>Back to route</BigButton> : (
        <>
          <BigButton onClick={() => nav(`/driver/stop/${stop.stopId}/pod`)}>Start unloading</BigButton>
          <BigButton secondary onClick={() => nav(`/driver/stop/${stop.stopId}/problem`)}>Can&apos;t deliver — report a problem</BigButton>
        </>
      )}
    >
      <p className="text-[13px] font-medium text-drv-muted">Stop {stop.seq} of {trip.stops.length}</p>
      <h1 className="text-[22px] font-bold leading-tight -mt-1">{stop.outlet.id} · {stop.outlet.district}</h1>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={stop.outlet.brand === 'Fresh' ? 'green' : 'blue'}>{stop.outlet.brand}</Chip>
        <Chip tone={stop.temp === 'chilled' ? 'chill' : 'grey'}>{tempLabel(stop.temp)}</Chip>
        <Chip>{(DOCK[stop.outlet.dockType] ?? '').replace(/^./, (c) => c.toUpperCase())} unloading</Chip>
        {stop.status === 'delivered' && <Chip tone="green">Delivered</Chip>}
        {stop.status === 'failed' && <Chip tone="red">Reported</Chip>}
      </div>
      {realLate && (
        <Notice tone="red" title={`Arrived ${lateBy} min after the window closed`}>The store manager has been told. Staff may have moved on, so call before unloading.</Notice>
      )}
      {stop.shortUnits > 0 && <Notice title={`${stop.shortUnits} ${stop.unitLabel} short from the dock`}>Deliver {stop.units - stop.shortUnits} of {stop.units}. The rest comes on the next run; the store already knows.</Notice>}
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
          <dt className="text-drv-muted">Window</dt><dd className={`text-right font-semibold ${realLate ? 'text-drv-red' : ''}`}>{stop.outlet.windowOpen} – {stop.outlet.windowClose}</dd>
          <dt className="text-drv-muted">Order</dt><dd className="text-right font-semibold">{stop.orderRef} · {stop.units} {stop.unitLabel}</dd>
          <dt className="text-drv-muted">Weight · volume</dt><dd className="text-right font-semibold">{Math.round(stop.weightKg)} kg · {stop.volumeM3.toFixed(1)} m³</dd>
          <dt className="text-drv-muted">Access</dt><dd className="text-right font-semibold capitalize">{access}</dd>
          {stop.note && <><dt className="text-drv-muted">Note</dt><dd className="text-right font-semibold">{stop.note}</dd></>}
        </dl>
      </Card>
      {stop.managerName && (
        <Card className="flex items-center">
          <div className="grid">
            <span className="text-[12px] text-drv-muted">Store manager</span>
            <strong className="text-[15px]">{stop.managerName}</strong>
          </div>
          {stop.managerPhone && (
            <a href={`tel:${stop.managerPhone.replace(/\s/g, '')}`} className="ml-auto grid place-items-center h-12 w-12 rounded-full bg-drv-primary text-white" aria-label={`Call ${stop.managerName}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></svg>
            </a>
          )}
        </Card>
      )}
    </Screen>
  );
}
