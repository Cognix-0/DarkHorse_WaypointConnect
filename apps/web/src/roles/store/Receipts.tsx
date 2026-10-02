// SM8 / D-SM8 · Receipts
import { useNavigate } from 'react-router-dom';
import { ErrorBox, Loading } from '../../ui/States';
import { shortDate } from '../../ui/format';
import { useReceipts } from './api';
import { Page } from './StoreApp';
import { Btn, hhmm, PAGE_GRID, Panel, Pill } from './ui';

export function Receipts() {
  const q = useReceipts();
  const nav = useNavigate();
  if (q.isLoading) return <Page title="Receipts"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Receipts"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  return (
    <Page title="Receipts" sub="Confirm deliveries and review past receipts">
      {d.pending.map((o) => (
        <section key={o.id} className="rounded-2xl border border-st-orangeLine bg-st-orangeTint p-5 flex flex-wrap items-center gap-4">
          <div className="grid gap-1">
            <span className="text-xs font-bold text-st-orange">Needs your confirmation</span>
            <strong className="text-[17px] text-st-ink">{o.typeLabel} · {shortDate(o.deliveryDate)}</strong>
            <span className="text-[13px] text-st-muted">Delivered {hhmm(o.deliveredAt)}. Proof of delivery recorded. Confirm what arrived.</span>
          </div>
          <Btn className="ml-auto" onClick={() => nav(`/store/orders/${o.id}/receipt`)}>Confirm receipt</Btn>
        </section>
      ))}
      <div className={PAGE_GRID}>
        <Panel className="p-0 overflow-hidden">
          <h2 className="px-5 pt-5 pb-3 text-[17px] font-semibold text-st-ink">Past receipts</h2>
          <div className="hidden md:grid grid-cols-[1.4fr_0.7fr_0.7fr_1.5fr] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-st-muted border-y border-st-bar">
            <span>Delivery</span><span>Delivered</span><span>Confirmed</span><span>Result</span>
          </div>
          <ul>
            {d.past.map((r) => (
              <li key={r.orderId}>
                <button className="w-full text-left grid grid-cols-2 md:grid-cols-[1.4fr_0.7fr_0.7fr_1.5fr] gap-3 items-center px-5 py-3.5 border-b border-line-soft hover:bg-sunk" onClick={() => nav(`/store/orders/${r.orderId}`)}>
                  <span className="text-[14px] font-medium text-st-ink">{r.typeLabel} · {shortDate(r.deliveryDate)}</span>
                  <span className="text-[14px] text-st-muted justify-self-end md:justify-self-start">{hhmm(r.deliveredAt)}</span>
                  <span className="hidden md:block text-[14px] text-st-muted">{hhmm(r.confirmedAt)}</span>
                  <span className="col-span-2 md:col-span-1"><Pill tone={r.ok ? 'green' : 'orange'}>{r.result}</Pill></span>
                </button>
              </li>
            ))}
            {d.past.length === 0 && <li className="px-5 py-8 text-center text-[14px] text-st-muted">No receipts yet.</li>}
          </ul>
        </Panel>
        <Panel className="grid gap-5">
          <h2 className="text-[16px] font-semibold text-st-ink">Last 30 days</h2>
          <div className="grid"><strong className="text-[26px] font-bold text-st-green">{d.stats.fullPct}%</strong><span className="text-xs font-medium text-st-muted">received in full</span></div>
          <div className="grid"><strong className="text-[26px] font-bold text-st-orange">{d.stats.issues}</strong><span className="text-xs font-medium text-st-muted">issue{d.stats.issues === 1 ? '' : 's'} raised</span></div>
          <div className="grid"><strong className="text-[26px] font-bold text-st-navy">{d.stats.avgConfirmMin != null ? `${d.stats.avgConfirmMin} min` : '—'}</strong><span className="text-xs font-medium text-st-muted">average time to confirm</span></div>
        </Panel>
      </div>
    </Page>
  );
}
