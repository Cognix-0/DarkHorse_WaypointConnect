// SM9 / D-SM9 · Help
import { useState } from 'react';
import { cx } from '../../ui/format';
import { DISPATCH_PHONE, useToday } from './api';
import { Page } from './StoreApp';
import { Btn, PAGE_GRID, Panel } from './ui';

const FAQ: [string, string][] = [
  ['What time do orders close?', 'Orders for the next day close at 4:00 PM. An order placed after that waits for the following run. You can change an order as often as you like until 4:00 PM.'],
  ['Why was my order deferred?', 'When there is not enough space on the right kind of vehicle (for example refrigerated trucks on payday), the dispatcher moves some orders to the next run. You always see the reason and the new day, and a store that was skipped goes first in the queue next time.'],
  ['How do I report a short or damaged item?', 'Open Receipts, choose Confirm receipt, and mark the line Short or Damaged with the number you received. The dispatcher and the depot see it at once.'],
  ['What if my signal drops?', 'The driver’s phone keeps working without signal and sends the delivery record when it reconnects, so your confirmation may arrive a few minutes late. Nothing is lost.'],
  ['Why can’t I edit my order?', 'After 4:00 PM the order is part of the plan and the depot starts picking it. Call the dispatcher if something must change.'],
];

export function Help() {
  const t = useToday();
  const o = t.data?.outlet;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(0);
  const s = search.trim().toLowerCase();
  const list = FAQ.map((f, i) => [...f, i] as const).filter(([q, a]) => !s || q.toLowerCase().includes(s) || a.toLowerCase().includes(s));
  const tel = `tel:${DISPATCH_PHONE.replace(/\s/g, '')}`;
  return (
    <Page title="Help" sub="Answers and contacts for the store manager">
      <div className={PAGE_GRID}>
        <div className="grid gap-4">
          <input className="h-12 rounded-xl border border-st-bar bg-surface px-4 text-[14px]" placeholder="Search: cutoff, deferred order, report a shortage…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search help" />
          <Panel className="grid gap-1">
            <h2 className="text-[17px] font-semibold text-st-ink mb-2">Common questions</h2>
            {list.map(([q, a, i]) => (
              <div key={q} className="border-b border-line-soft last:border-0">
                <button className="w-full flex items-center gap-3 py-3.5 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  <span className={cx('text-[15px] font-semibold', open === i ? 'text-st-navy' : 'text-st-ink')}>{q}</span>
                  <span className="ml-auto text-[18px] text-st-muted" aria-hidden="true">{open === i ? '−' : '+'}</span>
                </button>
                {open === i && <p className="pb-4 text-[14px] text-st-muted">{a}</p>}
              </div>
            ))}
            {list.length === 0 && <p className="text-[14px] text-st-muted py-3">No answer matches. Call the dispatcher.</p>}
          </Panel>
        </div>
        <div className="grid gap-4">
          <Panel className="grid gap-3">
            <h2 className="text-[16px] font-semibold text-st-ink">Need a person?</h2>
            <div className="grid"><strong className="text-[15px] text-st-navy">Dispatcher · {o?.depot ?? 'Peliyagoda'}</strong><span className="text-[13px] text-st-muted">{DISPATCH_PHONE} · Mon–Sat, 03:00–17:00</span></div>
            <Btn href={tel}>Call dispatcher</Btn>
            <Btn kind="outline" href={tel}>Report a problem</Btn>
          </Panel>
          {o && (
            <Panel className="grid gap-2">
              <h2 className="text-[16px] font-semibold text-st-ink">Your outlet</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-st-muted">Outlet</dt><dd className="text-right font-semibold text-st-ink">{o.district} · {o.id}</dd>
                <dt className="text-st-muted">Delivery window</dt><dd className="text-right font-semibold text-st-ink">{o.windowOpen}–{o.windowClose}</dd>
                <dt className="text-st-muted">Unloading</dt><dd className="text-right font-semibold text-st-ink">{o.dockType === 'street' ? 'Curb (street access)' : o.dockType === 'mall_bay' ? 'Mall bay' : 'Rear dock'}{o.parking === 'van_only' ? ' · vans only' : ''}</dd>
                <dt className="text-st-muted">Depot</dt><dd className="text-right font-semibold text-st-ink">{o.depot}</dd>
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </Page>
  );
}
