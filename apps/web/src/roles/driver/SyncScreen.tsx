// M7 · Offline mode / Sync tab: what is saved on the phone and waiting to send.
import { useNavigate } from 'react-router-dom';
import { clock, minutesSince, useDriver } from './store';
import { activeTrip, BigButton, Card, Chip, expectedEta, nextStop, Notice, Screen } from './ui';

const DISPATCH_PHONE = '+94112000100';

export function SyncScreen() {
  const d = useDriver();
  const nav = useNavigate();
  const t = activeTrip(d.route);
  const next = nextStop(t);
  return (
    <Screen
      tabs
      footer={
        <>
          <BigButton onClick={() => nav('/driver/run')}>Continue route</BigButton>
          <BigButton secondary href={`tel:${DISPATCH_PHONE}`}>Call dispatcher</BigButton>
        </>
      }
    >
      {d.online ? (
        <Notice tone="blue" title={d.queue.length ? `Sending ${d.queue.length} record(s)…` : 'Everything is sent'}>
          Last sync {d.lastSyncAt ? clock(new Date(d.lastSyncAt)) : 'not yet'}. If signal drops, keep working: the app saves on this phone.
        </Notice>
      ) : (
        <Notice tone="orange" title="Signal lost">
          Last connected {d.lastSyncAt ? clock(new Date(d.lastSyncAt)) : d.offlineSince ? clock(new Date(d.offlineSince)) : 'earlier'}. You can keep working. Everything saves on this phone.
        </Notice>
      )}

      <Card>
        <p className="text-[12px] font-semibold text-drv-muted">Available offline</p>
        <ul className="grid gap-2 mt-2 text-[14px] font-medium">
          {[`Plan v${d.route?.version ?? '–'} and route`, 'Stop list and contact numbers', 'Photo, signature and POD capture'].map((x) => (
            <li key={x} className="flex items-center gap-2"><span className="text-ok font-bold" aria-hidden="true">✓</span>{x}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center">
          <strong className="text-[14px]">Waiting to sync ({d.queue.length})</strong>
          <span className="ml-auto"><Chip>Auto-sync on signal</Chip></span>
        </div>
        {d.queue.length === 0 && <p className="text-[13px] text-drv-muted mt-2">Nothing waiting.</p>}
        <ul className="grid gap-3 mt-3">
          {d.queue.map((q) => (
            <li key={q.eventId} className="flex items-center gap-2">
              <div className="grid">
                <strong className="text-[14px]">{q.label.split(' · ').slice(1).join(' · ') || q.label}</strong>
                <span className="text-[12px] text-drv-muted">{q.label.split(' · ')[0]}{'photoBase64' in q && q.photoBase64 ? ' + photo' : ''} · {clock(new Date(q.queuedAt))}</span>
              </div>
              <span className="ml-auto"><Chip tone="amber">{d.syncing ? 'Sending' : 'Queued'}</Chip></span>
            </li>
          ))}
        </ul>
      </Card>

      {d.rejected.length > 0 && (
        <Notice tone="red" title="Some records were not accepted">
          {d.rejected.map((r, i) => <div key={i}>{r.label}: {r.reason}</div>)}
        </Notice>
      )}

      {t && next && (
        <Card className="py-3">
          <p className="text-[13px] font-medium">Next: {next.outlet.id} · ETA ~{expectedEta(t, next)}{d.online ? '' : ' (last known)'}</p>
          {!d.online && <p className="text-[12px] text-drv-muted mt-0.5">The dispatcher sees you as Offline {minutesSince(d.offlineSince)} min</p>}
        </Card>
      )}
    </Screen>
  );
}
