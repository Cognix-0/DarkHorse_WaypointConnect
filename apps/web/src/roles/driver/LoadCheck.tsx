// M2 · Load check: what the loader put on the truck, then "Confirm load & depart".
import { useNavigate, useParams } from 'react-router-dom';
import { useDriver, uuid } from './store';
import { BigButton, Card, Chip, DOCK, Notice, Screen, SeqDot } from './ui';

export function LoadCheck() {
  const { tripId } = useParams();
  const d = useDriver();
  const nav = useNavigate();
  const t = d.route?.trips.find((x) => x.tripId === tripId);
  if (!t || !d.route) return <Screen title="Load check"><Notice title="Trip not found">Go back to today&apos;s runs.</Notice></Screen>;
  const sealed = t.status === 'sealed' || t.status === 'departed' || t.status === 'done';

  async function depart() {
    await d.enqueue({ eventId: uuid(), type: 'trip.departed', tripId: t!.tripId, occurredAt: new Date().toISOString() }, `Trip ${t!.tripNo} departed`);
    nav('/driver/run');
  }

  return (
    <Screen
      title={`Load check · Trip ${t.tripNo}`}
      sub={sealed ? `Loaded by ${t.loadedBy ?? 'the loader'} at Bay ${t.bay}${t.sealedAt ? ` · ${new Date(t.sealedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}` : `Being loaded at Bay ${t.bay}${t.loadedBy ? ` by ${t.loadedBy}` : ''}`}
      footer={
        <>
          {t.status === 'sealed' && <BigButton onClick={depart}>Confirm load &amp; depart</BigButton>}
          {t.status === 'departed' && <BigButton onClick={() => nav('/driver/run')}>Back to route</BigButton>}
          {!sealed && <BigButton disabled>Waiting for the seal</BigButton>}
          <p className="text-[12px] text-drv-muted text-center">Plan v{d.route.version} is saved on this phone</p>
        </>
      }
    >
      {t.stops.map((s) => (
        <Card key={s.stopId} className="py-3">
          <div className="flex items-center gap-3">
            <SeqDot n={s.seq} />
            <div className="grid min-w-0">
              <strong className="text-[15px] truncate">{s.outlet.id} · {s.outlet.district}</strong>
              <span className="text-[12px] text-drv-muted">{s.units} {s.unitLabel} · {Math.round(s.weightKg)} kg · {DOCK[s.outlet.dockType]}</span>
            </div>
            <span className="ml-auto">
              {s.shortUnits > 0 ? <Chip tone="amber">Short {s.shortUnits}</Chip> : sealed ? <Chip tone="green">Loaded</Chip> : <Chip>Loading</Chip>}
            </span>
          </div>
        </Card>
      ))}
      {t.loaderNotes.map((n, i) => {
        const [head, ...rest] = n.split('. ');
        return <Notice key={i} title={head!}>{rest.join('. ')} No call needed.</Notice>;
      })}
    </Screen>
  );
}
