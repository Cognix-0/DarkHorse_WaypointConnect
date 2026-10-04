// D4 Deferral review: why orders can't go today, what would fix it (engine what-ifs), and an explicit
// confirmation for any shop that would be skipped twice. Publishing tells every affected store.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TDeferralRowDto, TRecoveryOption } from '@waypoint/shared/contract';
import { Badge, brandTone } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Meter } from '../../ui/Meter';
import { Modal } from '../../ui/Modal';
import { Empty, ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, generateAutomatedReason, kg, num, pct, REASON_LABEL, shortDate, tonnes, unitLabel } from '../../ui/format';
import { useConfirmDeferral, useOption, usePublish, useReview } from './api';
import { PageHeader } from './PageHeader';

export function DeferralReview() {
  const q = useReview();
  const option = useOption();
  const publish = usePublish();
  const toast = useToast();
  const [confirming, setConfirming] = useState<TDeferralRowDto | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pending = d.deferrals.filter((x) => x.secondDeferral && !x.confirmed);
  const seconds = d.deferrals.filter((x) => x.secondDeferral).length;
  const current = d.options.find((o) => o.id === 'A');

  async function runOption(o: TRecoveryOption) {
    try {
      await option.mutateAsync(o.id);
      toast({ tone: 'ok', title: o.action === 'apply' ? 'Plan rebuilt with the priority policy' : `Request sent: ${o.title}`, body: o.action === 'apply' ? 'Check the board, then publish.' : 'You will see the answer under Live Tracking alerts.' });
    } catch (e) { toast({ tone: 'bad', title: 'Could not do that', body: (e as Error).message }); }
  }
  async function doPublish() {
    try {
      const r = await publish.mutateAsync();
      toast({ tone: 'ok', title: `Plan v${r.version} published`, body: `${d.deferrals.length} store manager(s) told about their new delivery day.` });
    } catch (e) { toast({ tone: 'bad', title: 'Not published yet', body: (e as Error).message }); }
  }

  return (
    <div className="pb-20">
      <PageHeader title={`Deferral review · ${shortDate(d.date)}`} sub={`${d.depot} DC · every deferral has a reason and is marked unavoidable or a dispatcher's choice`}>
        <Link to="/dispatcher/board" className="btn-secondary">Open planning board</Link>
      </PageHeader>

      {d.overload.active && (
        <section className="card mb-5 p-5 border-l-4 border-l-bad bg-bad-tint grid gap-4 md:grid-cols-[1fr_320px] items-center" aria-label="Capacity warning">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Badge tone="bad" solid><Icon name="alert" size={12} /> {d.overload.title}</Badge>
              {seconds > 0 && <Badge tone="bad">{seconds} shop(s) at risk of a second skip</Badge>}
            </div>
            <p className="text-[13px] text-ink-2 max-w-2xl">{d.overload.detail}</p>
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between text-xs"><span className="text-ink-3">Chilled demand</span><strong className="text-bad tabular">{tonnes(d.overload.chilledDemandKg)}</strong></div>
            <Meter used={d.overload.chilledDemandKg} cap={d.overload.reeferCapacityKg} text={`${pct(d.overload.chilledDemandKg, d.overload.reeferCapacityKg)}% of ${tonnes(d.overload.reeferCapacityKg)} reefer space`} />
          </div>
        </section>
      )}

      {d.options.length > 0 && (
        <section className="mb-6" aria-labelledby="opt-h">
          <h2 id="opt-h" className="text-[15px] font-semibold mb-3">Recovery options <span className="text-xs font-normal text-ink-3">· each one re-planned by the engine</span></h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {d.options.map((o) => {
              const gain = current ? current.deferred - o.deferred : 0;
              return (
                <article key={o.id} className={cx('card p-4 grid gap-3 content-between', o.state !== 'available' && 'ring-2 ring-primary/30')}>
                  <div className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="grid place-items-center h-7 w-7 rounded-full bg-primary-tint text-primary text-[13px] font-bold">{o.id}</span>
                      <strong className="text-[14px] leading-snug">{o.title}</strong>
                    </div>
                    <p className="text-xs text-ink-2">{o.detail}</p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="grid">
                      <span className="text-2xs uppercase tracking-wide text-ink-3">Result</span>
                      <span className="text-[13px] tabular"><strong className="text-ok">{o.served}</strong> served · <strong className={o.deferred ? 'text-bad' : 'text-ok'}>{o.deferred}</strong> deferred</span>
                      {o.id !== 'A' && <span className={cx('text-xs font-semibold', gain > 0 ? 'text-ok' : 'text-ink-3')}>{gain > 0 ? `${gain} more orders delivered today` : 'No change today'}</span>}
                    </div>
                    <span className="ml-auto">
                      {o.state === 'applied' ? <Badge tone="ok">Applied</Badge> : o.state === 'requested' ? <Badge tone="info">Requested</Badge> : (
                        <button className={o.action === 'apply' ? 'btn-primary' : 'btn-secondary'} disabled={option.isPending || (o.id !== 'A' && gain <= 0)} onClick={() => runOption(o)}>
                          {o.action === 'apply' ? 'Apply' : 'Request'}
                        </button>
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="def-h">
        <div className="flex items-center mb-3">
          <h2 id="def-h" className="text-[15px] font-semibold">Deferrals <span className="text-ink-3 font-normal">({d.deferrals.length})</span></h2>
        </div>
        {d.deferrals.length === 0 ? (
          <Empty title={d.planStatus === 'none' ? 'No plan yet' : 'Nothing deferred'}>
            {d.planStatus === 'none' ? 'Auto-allocate from the order queue first.' : 'Every order fits on a trip today.'}
          </Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead className="border-b border-line">
                <tr>{['Order', 'Outlet', 'Brand', 'Load', 'Reason', 'Type', 'Why', 'New date', 'Last run', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {d.deferrals.map((x) => (
                  <tr key={x.id} className={cx('border-b border-line last:border-0', x.secondDeferral && !x.confirmed && 'bg-bad-tint')}>
                    <td className="td font-mono text-xs text-ink">{x.order.ref}</td>
                    <td className="td"><strong className="block text-ink">{x.order.outlet.id}</strong><span className="text-xs text-ink-3">{x.order.outlet.district}</span></td>
                    <td className="td"><Badge tone={brandTone(x.order.outlet.brand)}>{x.order.outlet.brand}</Badge></td>
                    <td className="td tabular"><span className="block">{num(x.order.units)} {unitLabel(x.order.outlet.brand)} · {kg(x.order.weightKg)}</span>{x.order.temp === 'chilled' && <Badge tone="chill" className="mt-1 h-5 text-2xs">Chilled</Badge>}</td>
                    <td className="td font-medium text-ink">{REASON_LABEL[x.reason]}</td>
                    <td className="td">{x.type === 'unavoidable' ? <Badge tone="neutral">Unavoidable</Badge> : <Badge tone="warn">Choice</Badge>}</td>
                    <td className="td whitespace-normal min-w-[280px] max-w-[360px] text-xs">{x.note ?? x.detail}</td>
                    <td className="td tabular">{shortDate(x.newDate)}</td>
                    <td className="td">{x.secondDeferral ? <Badge tone="bad">Skipped</Badge> : <span className="text-ink-3 text-xs">Served</span>}</td>
                    <td className="td text-right">
                      {x.secondDeferral && (x.confirmed
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><Icon name="check" size={14} />Confirmed</span>
                        : <button className="btn-primary btn-sm" onClick={() => setConfirming(x)}>Confirm…</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {d.planStatus !== 'none' && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-[240px] z-30 bg-surface border-t border-line px-4 sm:px-7 py-3 flex flex-wrap items-center gap-3 shadow-toast" role="region" aria-label="Confirm deferrals">
          <span className="text-[13px] text-ink-2">
            <strong className="text-ink">{d.deferrals.length} deferral(s)</strong> to {d.deferrals[0] ? shortDate(d.deferrals[0].newDate) : 'the next run'}
            {pending.length > 0 ? <> · <strong className="text-bad">{pending.length} second deferral(s) need your confirmation</strong></> : seconds ? ' · second deferrals confirmed' : ''}
            {' '}· stores are notified when you publish
          </span>
          <button className="btn-primary ml-auto" disabled={pending.length > 0 || publish.isPending || d.planStatus === 'published'} onClick={doPublish}>
            {d.planStatus === 'published' ? 'Published' : 'Confirm & publish plan'}
          </button>
        </div>
      )}

      {confirming && <ConfirmModal row={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}

function ConfirmModal({ row, onClose }: { row: TDeferralRowDto; onClose: () => void }) {
  const confirm = useConfirmDeferral();
  const toast = useToast();
  const defaultNote = row.note || generateAutomatedReason(row.reason, row.order.outlet.id);
  const [note, setNote] = useState(defaultNote);

  function autoFill() {
    setNote(generateAutomatedReason(row.reason, row.order.outlet.id));
  }

  async function submit() {
    try {
      await confirm.mutateAsync({ id: row.id, note });
      toast({ tone: 'ok', title: `Second deferral confirmed for ${row.order.outlet.id}` });
      onClose();
    } catch (e) { toast({ tone: 'bad', title: 'Not confirmed', body: (e as Error).message }); }
  }

  return (
    <Modal title={`Skip ${row.order.outlet.id} a second time?`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={note.trim().length < 3 || confirm.isPending} onClick={submit}>Confirm second deferral</button></>}>
      <p><strong className="text-ink">{row.order.outlet.id}</strong> ({row.order.outlet.district}) was not delivered on the last run either. {REASON_LABEL[row.reason]}: {row.detail}</p>
      <p>Before you confirm, try dragging it onto a vehicle on the planning board, or request option B or C above.</p>
      <div className="grid gap-1 font-medium text-ink">
        <div className="flex items-center justify-between">
          <label>Message to the store manager (required)</label>
          <button
            type="button"
            onClick={autoFill}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>Auto-generate reason ✨</span>
          </button>
        </div>
        <textarea className="input h-24 py-2 text-xs" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Payday peak: all reefers are full. Your order is first on tomorrow's run." />
      </div>
    </Modal>
  );
}
