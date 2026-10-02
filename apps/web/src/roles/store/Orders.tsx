// SM7 / D-SM7 · Orders
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBox, Loading } from '../../ui/States';
import { cx, shortDate } from '../../ui/format';
import { useOrders } from './api';
import { Page } from './StoreApp';
import { Btn, leftText, Panel, Pill, STAGE_TONE } from './ui';

type F = 'all' | 'action' | 'deferred';

export function Orders() {
  const q = useOrders();
  const nav = useNavigate();
  const [f, setF] = useState<F>('all');
  if (q.isLoading) return <Page title="Orders"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Orders"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const action = (o: (typeof d.orders)[number]) => o.needsReceipt || o.stage === 'deferred' || o.stage === 'failed';
  const list = d.orders.filter((o) => f === 'all' || (f === 'action' ? action(o) : o.stage === 'deferred' || o.statusText.startsWith('Rescheduled')));
  const open = d.orders.filter((o) => o.deliveryDate === d.cutoff.forDate && o.stage !== 'cancelled' && !o.statusText.startsWith('Rescheduled'));
  return (
    <Page title="Orders" sub="Upcoming and past orders for your store">
      <Panel tone="teal" className="flex flex-wrap items-center gap-4">
        <div className="grid gap-0.5">
          <strong className="text-[16px] text-st-navy">{shortDate(d.cutoff.forDate)} orders {d.cutoff.open ? 'close at 4:00 PM' : 'closed at 4:00 PM'}</strong>
          <span className="text-[13px] text-st-muted">{open.length ? `${open.length} order${open.length > 1 ? 's' : ''} placed for ${shortDate(d.cutoff.forDate)}.` : `No order placed yet for ${shortDate(d.cutoff.forDate)}.`}{d.cutoff.open ? ` ${leftText(d.cutoff.minutesLeft)} left.` : ''}</span>
        </div>
        <Btn kind="primary" className="ml-auto" onClick={() => nav('/store/order')}>Place order</Btn>
      </Panel>
      <Panel className="p-0 overflow-hidden">
        <div className="flex gap-2 px-5 py-4 border-b border-st-bar" role="group" aria-label="Filter">
          {([['all', 'All orders'], ['action', `Needs action · ${d.orders.filter(action).length}`], ['deferred', `Deferred · ${d.orders.filter((o) => o.stage === 'deferred').length}`]] as [F, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setF(id)} aria-pressed={f === id} className={cx('h-9 px-4 rounded-full text-[13px] font-semibold', f === id ? 'bg-primary-tint text-st-navy' : 'text-st-muted')}>{label}</button>
          ))}
        </div>
        <div className="hidden md:grid grid-cols-[1.1fr_1fr_0.9fr_0.8fr_1.6fr_0.8fr] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-st-muted border-b border-st-bar">
          <span>Order</span><span>Delivery day</span><span>Type</span><span>Size</span><span>Status</span><span>Arrival</span>
        </div>
        <ul>
          {list.map((o) => (
            <li key={o.id}>
              <button onClick={() => nav(o.needsReceipt ? `/store/orders/${o.id}/receipt` : `/store/orders/${o.id}`)}
                className="w-full text-left grid grid-cols-2 md:grid-cols-[1.1fr_1fr_0.9fr_0.8fr_1.6fr_0.8fr] gap-x-3 gap-y-1 items-center px-5 py-3.5 border-b border-line-soft hover:bg-sunk">
                <strong className="text-[14px] text-st-navy">{o.ref}</strong>
                <span className="text-[14px] text-st-ink justify-self-end md:justify-self-start">{shortDate(o.deliveryDate)}</span>
                <span className="text-[14px] text-st-muted">{o.typeLabel}</span>
                <span className="text-[14px] text-st-muted justify-self-end md:justify-self-start">{o.units} {o.unitLabel}</span>
                <span className="col-span-2 md:col-span-1"><Pill tone={STAGE_TONE[o.stage]}>{o.statusText}</Pill></span>
                <span className="hidden md:block text-[14px] font-medium text-st-ink">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) : o.arrival ? `${o.arrival.from}–${o.arrival.to}` : '—'}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-5 py-8 text-center text-[14px] text-st-muted">Nothing here.</li>}
        </ul>
      </Panel>
    </Page>
  );
}
