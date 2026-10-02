// SM5 / D-SM5 · Confirm receipt: mark each line against the delivery. Issues go to the dispatcher.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, shortDate } from '../../ui/format';
import { useConfirmReceipt, useOrder } from './api';
import { Page } from './StoreApp';
import { Btn, hhmm, Panel } from './ui';

type St = 'ok' | 'short' | 'damaged';

export function ConfirmReceipt() {
  const { id = '' } = useParams();
  const q = useOrder(id);
  const confirm = useConfirmReceipt();
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, { received: number; status: St }>>({});
  const [note, setNote] = useState('');
  useEffect(() => {
    if (q.data) setRows(Object.fromEntries(q.data.lines.map((l) => [l.id, { received: l.packs - l.shortFromDock, status: 'ok' as St }])));
  }, [q.data]);

  if (q.isLoading) return <Page title="Confirm receipt"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Confirm receipt"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  if (!d.order.needsReceipt) {
    return (
      <Page title="Confirm receipt">
        <Panel>{d.receipt ? `Already confirmed at ${hhmm(d.receipt.at)} · ${d.receipt.result}.` : 'This order has not been delivered yet.'} <button className="text-st-navy font-semibold underline" onClick={() => nav(`/store/orders/${id}`)}>Back to the order</button></Panel>
      </Page>
    );
  }
  const issues = d.lines.filter((l) => {
    const r = rows[l.id];
    return r && (r.status !== 'ok' || r.received < l.packs - l.shortFromDock);
  });
  const set = (lineId: string, p: Partial<{ received: number; status: St }>) => setRows((x) => ({ ...x, [lineId]: { ...x[lineId]!, ...p } }));

  async function submit() {
    try {
      await confirm.mutateAsync({ orderId: id, lines: d.lines.map((l) => ({ lineId: l.id, ...rows[l.id]! })), note: note.trim() || undefined });
      toast({ tone: 'ok', title: issues.length ? `Receipt confirmed · ${issues.length} issue${issues.length > 1 ? 's' : ''} reported` : 'Receipt confirmed · all received', body: issues.length ? 'The dispatcher sees it now.' : undefined });
      nav('/store/receipts');
    } catch (e) { toast({ tone: 'bad', title: 'Not confirmed', body: (e as Error).message }); }
  }

  return (
    <Page title={`Confirm receipt · ${d.order.typeLabel}`} sub={`Delivered ${shortDate(d.order.deliveryDate)} at ${hhmm(d.order.deliveredAt)}${d.pod ? ` · ${d.pod.driverName ?? 'Driver'} · ${d.pod.vehicleId}` : ''}`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <Panel className="p-0 overflow-hidden">
          <div className="flex items-center px-5 py-4 border-b border-st-bar">
            <h2 className="text-[17px] font-semibold text-st-ink">Confirm what arrived</h2>
            <span className="ml-auto text-[13px] text-st-muted hidden md:block">Mark each line against the delivery</span>
          </div>
          <div className="hidden md:grid grid-cols-[1.5fr_0.8fr_150px_220px] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-st-muted border-b border-st-bar">
            <span>Item</span><span>Ordered</span><span>Received</span><span>Status</span>
          </div>
          <ul>
            {d.lines.map((l) => {
              const r = rows[l.id] ?? { received: l.packs, status: 'ok' as St };
              const expected = l.packs - l.shortFromDock;
              return (
                <li key={l.id} className="grid grid-cols-2 md:grid-cols-[1.5fr_0.8fr_150px_220px] gap-3 items-center px-5 py-3.5 border-b border-line-soft">
                  <div className="grid col-span-2 md:col-span-1">
                    <strong className="text-[15px] font-medium text-st-ink">{l.product} <span className="text-xs font-normal text-st-muted">{l.packSize}</span></strong>
                    {l.shortFromDock > 0 && <span className="text-xs text-st-orange font-medium">{l.shortFromDock} short from the dock (comes next run)</span>}
                  </div>
                  <span className="text-[14px] text-st-muted">{expected} {l.pack}</span>
                  <div className="flex items-center gap-1">
                    <button className="h-9 w-9 rounded-full border border-st-bar text-st-navy font-semibold" aria-label={`One less ${l.product}`} onClick={() => set(l.id, { received: Math.max(0, r.received - 1), status: r.status === 'ok' ? 'short' : r.status })}>−</button>
                    <span className={cx('w-10 text-center text-[15px] font-bold tabular', r.received < expected ? 'text-st-orange' : 'text-st-ink')}>{r.received}</span>
                    <button className="h-9 w-9 rounded-full border border-st-bar text-st-navy font-semibold" aria-label={`One more ${l.product}`} onClick={() => set(l.id, { received: Math.min(expected, r.received + 1), status: r.received + 1 >= expected && r.status === 'short' ? 'ok' : r.status })}>+</button>
                  </div>
                  <div className="flex gap-1 col-span-2 md:col-span-1" role="radiogroup" aria-label={`${l.product} status`}>
                    {(['ok', 'short', 'damaged'] as St[]).map((s) => (
                      <button key={s} role="radio" aria-checked={r.status === s} onClick={() => set(l.id, { status: s, received: s === 'ok' ? expected : r.received })}
                        className={cx('h-8 px-3 rounded-full text-xs font-semibold capitalize', r.status === s ? (s === 'ok' ? 'bg-st-green text-white' : s === 'short' ? 'bg-st-orange text-white' : 'bg-st-red text-white') : 'bg-offline-tint text-st-muted')}>
                        {s === 'ok' ? 'OK' : s}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="grid gap-4">
          {d.pod && (
            <Panel className="grid gap-3">
              <h2 className="text-[16px] font-semibold text-st-ink">Proof of delivery</h2>
              <div className="flex gap-3 items-start">
                {d.pod.photo ? <img src={d.pod.photo} alt="Goods at delivery" className="h-20 w-20 rounded-lg object-cover" /> : <span className="h-20 w-20 rounded-lg bg-sunk grid place-items-center text-[24px]" aria-hidden="true">📷</span>}
                <div className="grid text-[13px]">
                  <strong className="text-[14px] text-st-ink">{d.pod.driverName ?? 'Driver'} · {d.pod.vehicleId}</strong>
                  <span className="text-st-muted">{d.pod.signature ? 'Signature' : 'No signature'}{d.pod.photo ? ' and 1 photo' : ''} recorded at the door, {hhmm(d.pod.at)}</span>
                  <span className="text-st-muted">Received by {d.pod.receiverName ?? '—'}</span>
                </div>
              </div>
            </Panel>
          )}
          <Panel tone={issues.length ? 'orange' : 'green'} className="grid gap-2">
            <strong className={cx('text-[14px]', issues.length ? 'text-st-amber' : 'text-st-greenDark')}>{issues.length ? `${issues.length} issue${issues.length > 1 ? 's' : ''} will be reported` : 'Everything arrived'}</strong>
            {issues.map((l) => <span key={l.id} className="text-[13px] text-st-ink">{l.product}: {rows[l.id]!.received} of {l.packs - l.shortFromDock} {l.pack} received{rows[l.id]!.status === 'damaged' ? ', damaged' : ''}.</span>)}
            {issues.length > 0 && <span className="text-xs text-st-muted">This goes to the dispatcher and the {d.outlet.depot} dock.</span>}
            <textarea className="rounded-lg border border-st-bar bg-surface px-3 py-2 text-[13px] min-h-[52px]" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Panel>
          <Btn onClick={submit} disabled={confirm.isPending}>{issues.length ? `Confirm receipt · ${issues.length} issue${issues.length > 1 ? 's' : ''}` : 'Confirm receipt'}</Btn>
          <Btn kind="outline" onClick={() => nav(`/store/orders/${id}`)}>Finish later</Btn>
        </div>
      </div>
    </Page>
  );
}
