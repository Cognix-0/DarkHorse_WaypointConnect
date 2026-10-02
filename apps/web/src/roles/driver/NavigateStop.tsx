// M3A · Navigate: route summary on the phone, then hand over to Google Maps.
import { useNavigate, useParams } from 'react-router-dom';
import { useDriver } from './store';
import { BigButton, Card, expectedEta, findStop, Notice, Screen, Stat, toMin } from './ui';

export function NavigateStop() {
  const { stopId } = useParams();
  const d = useDriver();
  const nav = useNavigate();
  const f = findStop(d.route, stopId ?? '');
  if (!f || !d.route) return <Screen title="Navigate"><Notice title="Stop not found" /></Screen>;
  const { trip, stop } = f;
  const eta = expectedEta(trip, stop);
  const late = toMin(eta) > toMin(stop.outlet.windowClose);
  const prev = trip.stops.find((s) => s.seq === stop.seq - 1);
  const from = prev ? `${prev.outlet.id}` : `${d.route.depot} depot`;
  const q = encodeURIComponent(`${stop.outlet.district}, Sri Lanka`);
  const h = Math.floor(stop.legMin / 60);
  return (
    <Screen
      title="Navigate to next stop"
      sub={`${from} → ${stop.outlet.id} · ${stop.outlet.district}`}
      footer={
        <>
          <BigButton href={`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`}>Open in Google Maps</BigButton>
          <BigButton secondary onClick={() => nav('/driver/run')}>Back to route</BigButton>
          <p className="text-[12px] text-drv-muted text-center">Opens Google Maps with directions to this stop</p>
        </>
      }
    >
      <div className="rounded-[14px] border border-drv-line overflow-hidden bg-drv-map" aria-hidden="true">
        <svg viewBox="0 0 358 240" className="w-full h-auto block">
          <rect width="358" height="240" fill="#eaeff3" />
          <path d="M215 14h120v66H215z" fill="#cfe6cf" /><path d="M20 20h70v50H20z" fill="#cfe6cf" /><path d="M0 190h358v50H0z" fill="#b7d6f0" />
          <path d="M-10 90 C 80 70, 160 110, 368 100" stroke="#fff" strokeWidth="10" fill="none" />
          <path d="M70 -10 C 60 80, 90 160, 80 250" stroke="#fff" strokeWidth="10" fill="none" />
          <path d="M-10 160 C 120 150, 230 180, 368 140" stroke="#fff" strokeWidth="8" fill="none" />
          <path d="M60 175 C 110 150, 150 120, 190 95 S 270 60, 300 45" stroke="#2a4bd7" strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="60" cy="175" r="9" fill="#0f1629" /><circle cx="300" cy="45" r="11" fill="#b42318" /><circle cx="300" cy="45" r="4" fill="#fff" />
        </svg>
      </div>
      <Card>
        <h2 className="text-[16px] font-bold">{stop.outlet.id} · {stop.outlet.district}</h2>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="Distance" value={`${stop.legKm} km`} />
          <Stat label="Drive time" value={h ? `${h} h ${String(stop.legMin % 60).padStart(2, '0')}` : `${stop.legMin} min`} />
          <Stat label="ETA" value={eta} tone={late ? 'red' : undefined} />
        </div>
        {late && <p className="text-[12px] font-medium text-drv-amber mt-3">~{toMin(eta) - toMin(stop.outlet.windowClose)} min after the {stop.outlet.windowClose} window. The store manager is told.</p>}
        <p className="text-[12px] font-medium text-ok mt-2">Run and POD capture stay available offline</p>
      </Card>
    </Screen>
  );
}
