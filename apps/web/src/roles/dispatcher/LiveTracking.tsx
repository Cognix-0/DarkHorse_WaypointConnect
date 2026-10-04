// D5 Live tracking: every trip's progress against its stores' windows, and the exceptions that need a decision.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TPod } from '@waypoint/shared/contract';
import { api } from '../../api';
import { Modal } from '../../ui/Modal';
import type { TLiveAlertDto, TLiveRowDto } from '@waypoint/shared/contract';
import { Badge, type Tone } from '../../ui/Badge';
import { Progress } from '../../ui/Meter';
import { Empty, ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, shortDate } from '../../ui/format';
import { useAlertAction, useLive } from './api';
import { PageHeader } from './PageHeader';

const STATUS: Record<TLiveRowDto['status'], { label: string; tone: Tone; bar: 'ok' | 'warn' | 'bad' | 'offline' | 'neutral' }> = {
  late: { label: 'Late', tone: 'bad', bar: 'bad' },
  at_risk: { label: 'At risk', tone: 'warn', bar: 'warn' },
  offline: { label: 'Offline', tone: 'offline', bar: 'offline' },
  short_loaded: { label: 'Short-loaded', tone: 'warn', bar: 'warn' },
  on_time: { label: 'On time', tone: 'ok', bar: 'ok' },
  not_started: { label: 'At depot', tone: 'neutral', bar: 'neutral' },
  trip_done: { label: 'Trip 1 done', tone: 'ok', bar: 'ok' },
  done: { label: 'Completed', tone: 'ok', bar: 'ok' },
};

const ALERT: Record<TLiveAlertDto['kind'], { label: string; card: string; tone: Tone }> = {
  late: { label: 'Late', card: 'border-l-bad bg-bad-tint', tone: 'bad' },
  loader_flag: { label: 'Loader flag', card: 'border-l-warn bg-warn-tint', tone: 'warn' },
  offline: { label: 'Offline', card: 'border-l-offline bg-offline-tint', tone: 'offline' },
  pod: { label: 'POD', card: 'border-l-ok bg-ok-tint', tone: 'ok' },
  failed: { label: 'Failed stop', card: 'border-l-bad bg-bad-tint', tone: 'bad' },
  receipt_issue: { label: 'Store issue', card: 'border-l-warn bg-warn-tint', tone: 'warn' },
  info: { label: 'Update', card: 'border-l-primary bg-primary-tint', tone: 'info' },
};

export function LiveTracking() {
  const q = useLive();
  const act = useAlertAction();
  const toast = useToast();
  const [pod, setPod] = useState<TPod | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const open = d.alerts.filter((a) => !a.done && a.actions.length > 0);

  async function doAction(a: TLiveAlertDto, action: string, label: string) {
    if (action === 'view_pod') {
      try { setPod(await api<TPod>(`/live/pod/${a.stopId}`)); } catch (e) { toast({ tone: 'bad', title: 'No proof of delivery', body: (e as Error).message }); }
      return;
    }
    try {
      await act.mutateAsync({ id: a.id, action });
      toast({ tone: 'ok', title: `${label}: done`, body: action === 'notify_store' ? 'The store manager sees it on their screen now.' : undefined });
    } catch (e) { toast({ tone: 'bad', title: `${label} failed`, body: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title={`Live Status · ${shortDate(d.date)} · ${d.now}`}>
        {d.published && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Trip status counts">
            <span className="h-6 px-2 rounded-md bg-ok-soft text-ok text-xs font-semibold grid place-items-center">On time {d.counts.onTime}</span>
            <span className="h-6 px-2 rounded-md bg-warn-tint text-warn text-xs font-semibold grid place-items-center">At risk {d.counts.atRisk}</span>
            <span className="h-6 px-2 rounded-md bg-bad-tint text-bad text-xs font-semibold grid place-items-center">Late {d.counts.late}</span>
            <span className="h-6 px-2 rounded-md bg-offline text-white text-xs font-semibold grid place-items-center">Offline {d.counts.offline}</span>
          </div>
        )}
      </PageHeader>

      {!d.published ? (
        <Empty title="Nothing on the road yet">
          Tracking starts when the plan is published. <Link to="/dispatcher/board" className="text-primary font-semibold">Open the planning board</Link>
        </Empty>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_376px] items-start">
          <section className="card overflow-x-auto" aria-label="Trips">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-line">
                <tr>{['Vehicle', 'Route', 'Progress', 'Next stop', 'ETA vs window', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const st = STATUS[r.status];
                  const etaTone = r.status === 'late' ? 'text-bad' : r.status === 'at_risk' ? 'text-warn' : r.status === 'offline' ? 'text-ink-2' : 'text-ok';
                  return (
                    <tr key={r.tripId} className="border-b border-line last:border-0">
                      <td className="td"><strong className="text-ink">{r.vehicleId}</strong>{r.tripNo === 2 && <span className="text-2xs text-ink-3"> · trip 2</span>}</td>
                      <td className="td">{r.route}</td>
                      <td className="td"><Progress done={r.stopsDone} total={r.stopsTotal} tone={st.bar} /></td>
                      <td className="td">{r.nextStop ? `${r.nextStop.outletId} ${r.nextStop.district}` : r.status === 'trip_done' ? 'Back to depot' : '—'}</td>
                      <td className={cx('td font-medium tabular', etaTone)}>
                        {r.nextStop ? (r.status === 'offline' ? `~${r.nextStop.eta} (last known)` : `${r.nextStop.eta} · closes ${r.nextStop.windowClose}`) : r.lastSeenAt ? `Last stop ${r.lastSeenAt}` : '—'}
                      </td>
                      <td className="td">
                        {r.status === 'offline' && r.lastSeenAt
                          ? <Badge tone="offline">Offline {minutesSince(d.now, r.lastSeenAt)} min</Badge>
                          : <Badge tone={st.tone}>{st.label}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card p-4 grid gap-3" aria-labelledby="alerts-h">
            <div className="flex items-center">
              <h2 id="alerts-h" className="text-[15px] font-semibold">Alerts &amp; exceptions</h2>
              {open.length > 0 && <span className="ml-auto h-6 px-2 rounded-md bg-bad-tint text-bad text-xs font-semibold grid place-items-center">{open.length} need action</span>}
            </div>
            {d.alerts.length === 0 && <p className="text-[13px] text-ink-3 py-4">No exceptions. Drivers' deliveries and loader flags appear here as they happen.</p>}
            {d.alerts.map((a) => {
              const k = ALERT[a.kind];
              return (
                <article key={a.id} className={cx('rounded-lg border-l-4 p-3 grid gap-2', k.card, a.done && 'opacity-60')}>
                  <Badge tone={k.tone} solid className="justify-self-start">{k.label}</Badge>
                  <strong className="text-[14px] text-ink">{a.title}</strong>
                  <p className="text-xs text-ink-2">{a.detail}</p>
                  {a.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {a.actions.map((x, i) => (
                        <button key={x.id} className={cx(i === 0 ? 'btn-primary' : 'btn-secondary', 'btn-sm')} disabled={act.isPending} onClick={() => doAction(a, x.id, x.label)}>{x.label}</button>
                      ))}
                    </div>
                  )}
                  {a.done && <span className="text-2xs text-ink-3">Handled</span>}
                </article>
              );
            })}
          </section>
        </div>
      )}
      {pod && (
        <Modal title={`Proof of delivery · ${pod.vehicleId}`} onClose={() => setPod(null)} footer={<button className="btn-primary" onClick={() => setPod(null)}>Close</button>}>
          <p>Delivered {new Date(pod.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })} by {pod.driverName ?? 'the driver'} · received by <strong className="text-ink">{pod.receiverName ?? '—'}</strong></p>
          {pod.photo ? <img src={pod.photo} alt="Goods at delivery" className="w-full rounded-lg border border-line" /> : <p className="text-ink-3">No photo was taken.</p>}
          {pod.signature && <img src={pod.signature} alt="Signature" className="h-20 bg-white border border-line rounded-lg" />}
        </Modal>
      )}
    </>
  );
}

const minutesSince = (now: string, then: string) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return Math.max(0, m(now) - m(then));
};
