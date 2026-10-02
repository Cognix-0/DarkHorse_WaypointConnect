// L4 · Plan changes: the difference between the plan version the dock is working from and the new one.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TPlanChangeRow } from '@waypoint/shared/contract';
import { Badge } from '../../ui/Badge';
import { Empty, ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useAck, useChanges, useMarkMoved, useVehicles } from './api';

type F = 'all' | 'to_move' | 'moved' | 'added' | 'not_picked';

export function PlanChanges() {
  const q = useChanges();
  const v = useVehicles();
  const moved = useMarkMoved();
  const ack = useAck();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<F>('all');
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const active = d.rows.filter((r) => r.state !== 'not_picked' && (f === 'all' || r.state === f));
  const quiet = d.rows.filter((r) => r.state === 'not_picked' && (f === 'all' || f === 'not_picked'));
  const at = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

  async function acknowledge() {
    try {
      await ack.mutateAsync();
      toast({ tone: 'ok', title: `Plan v${d.toVersion} acknowledged`, body: 'The dispatcher sees that the dock works from the new plan.' });
    } catch (e) { toast({ tone: 'bad', title: 'Not acknowledged', body: (e as Error).message }); }
  }

  return (
    <div className="pb-28">
      <header className="flex flex-wrap items-start gap-3 mb-4">
        <div className="grid gap-1 mr-auto">
          <h1 className="text-[22px] font-bold text-nav">Plan changes · v{d.fromVersion} → v{d.toVersion}</h1>
          <p className="text-[12.5px] text-ink-3">{d.publishedAt ? `Published ${at(d.publishedAt)} by the dispatcher · ` : ''}{d.counts.all} order{d.counts.all === 1 ? '' : 's'} changed · {v.data?.now ?? ''}</p>
        </div>
        <button className="h-10 px-4 rounded-lg border border-line-strong bg-surface text-[13.5px] font-semibold" onClick={() => nav('/loader')}>Back to vehicles</button>
      </header>

      {d.toVersion <= 1 || d.counts.all === 0 ? (
        <Empty title="No changes">You are working from plan v{d.toVersion}. If the dispatcher changes it, the goods to move appear here.</Empty>
      ) : (
        <>
          <section className="rounded-[10px] border border-primary-line bg-primary-tint px-6 py-3.5 mb-4 flex gap-3">
            <span className="grid place-items-center h-6 w-6 rounded-full bg-primary text-white text-sm font-extrabold shrink-0" aria-hidden="true">i</span>
            <div className="grid gap-0.5">
              <strong className="text-[14px] text-primary">Why: the plan changed after loading started</strong>
              <span className="text-[12.5px] text-ink-2">{d.reason}</span>
            </div>
          </section>

          <div className="flex flex-wrap gap-2 mb-3">
            {([['all', 'All', d.counts.all], ['to_move', 'To move', d.counts.toMove], ['moved', 'Moved', d.counts.moved], ['added', 'Added', d.counts.added], ['not_picked', 'Not picked yet', d.counts.notPicked]] as [F, string, number][]).map(([id, label, n]) => (
              <button key={id} onClick={() => setF(id)} aria-pressed={f === id}
                className={cx('h-7 px-3 rounded-full border text-xs font-semibold', f === id ? 'bg-nav border-nav text-white' : 'bg-surface border-line text-ink')}>
                {label} <span className={cx('font-bold', id === 'to_move' && f !== id && n ? 'text-warn' : '')}>{n}</span>
              </button>
            ))}
          </div>

          <section className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-sunk-2 border-b border-line">
                <tr>{['Order', 'Outlet', 'Goods', 'Vehicle', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {active.map((r) => <ChangeRow key={r.orderId} r={r} busy={moved.isPending} onMoved={() => moved.mutate(r.orderId)} at={at} />)}
                {quiet.length > 0 && (
                  <tr className="bg-sunk border-y border-line-soft">
                    <td colSpan={5} className="td text-xs text-ink-3">Not picked yet ({quiet.length}) · the new vehicle is already on their goods list · nothing for you to do</td>
                  </tr>
                )}
                {quiet.map((r) => (
                  <tr key={r.orderId} className="border-b border-line-soft text-ink-4">
                    <td className="td text-ink-4">{r.orderRef}</td>
                    <td className="td text-ink-4">{r.outletId} · {r.district}</td>
                    <td className="td text-ink-4 whitespace-normal">{r.goods}</td>
                    <td className="td text-ink-4">{r.from} → {r.to}</td>
                    <td className="td text-ink-4">No action</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {d.toVersion > 1 && (
        <div className="fixed bottom-4 right-4 left-4 lg:left-[264px] z-20 card px-4 py-3 flex items-center gap-4 shadow-toast">
          <div className="grid">
            <strong className="text-[13px]">{d.acknowledged ? `Plan v${d.toVersion} acknowledged` : d.counts.toMove ? `${d.counts.toMove} move${d.counts.toMove === 1 ? '' : 's'} left` : 'All moves done'}</strong>
            <span className="text-xs text-ink-3">You can acknowledge now and finish the moves. The dispatcher sees who acknowledged plan v{d.toVersion} and when.</span>
          </div>
          <button className="ml-auto h-[52px] px-5 rounded-[10px] border border-line-strong bg-surface text-[15px] font-semibold whitespace-nowrap" onClick={() => nav('/loader')}>Save progress</button>
          <button className="h-[52px] px-5 rounded-[10px] bg-primary text-white text-[15px] font-semibold whitespace-nowrap disabled:opacity-50" disabled={d.acknowledged || ack.isPending} onClick={acknowledge}>
            {d.acknowledged ? 'Acknowledged' : `Acknowledge plan v${d.toVersion}`}
          </button>
        </div>
      )}
    </div>
  );
}

function ChangeRow({ r, busy, onMoved, at }: { r: TPlanChangeRow; busy: boolean; onMoved: () => void; at: (s: string | null) => string }) {
  return (
    <tr className={cx('border-b border-line-soft', r.state === 'to_move' && 'bg-warn-faint')}>
      <td className="td font-medium text-nav">{r.orderRef}</td>
      <td className="td"><strong className="block text-nav">{r.outletId}</strong><span className="text-[11px] text-ink-3">{r.district}</span></td>
      <td className="td whitespace-normal max-w-[380px]">{r.goods}</td>
      <td className="td">
        <span className="font-semibold text-nav">{r.from}</span> <span className="text-ink-3">→</span> <span className="font-semibold text-nav">{r.to}</span>
        <span className="block text-[11px] text-ink-3">{r.hint}</span>
      </td>
      <td className="td">
        {r.state === 'to_move' && <button className="h-[34px] px-3 rounded-lg bg-primary text-white text-[12.5px] font-semibold" disabled={busy} onClick={onMoved}>Mark moved</button>}
        {r.state === 'moved' && <Badge tone="ok">✓ Moved {at(r.movedAt)}</Badge>}
        {r.state === 'added' && <Badge tone="info">Added to {r.to} list</Badge>}
      </td>
    </tr>
  );
}
