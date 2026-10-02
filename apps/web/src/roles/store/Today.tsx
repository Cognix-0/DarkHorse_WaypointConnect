// SM1 / D-SM1 · Today
import { useNavigate } from 'react-router-dom';
import type { TStoreOrderCard } from '@waypoint/shared/contract';
import { ErrorBox, Loading } from '../../ui/States';
import { shortDate } from '../../ui/format';
import { useToday } from './api';
import { Page } from './StoreApp';
import { Btn, dayName, hhmm, Label, leftText, PAGE_GRID, Panel, Pill, STAGE_TONE } from './ui';

export function Today() {
  const q = useToday();
  const nav = useNavigate();
  if (q.isLoading) return <Page title="Today"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Today"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const c = d.cutoff;
  const hour = Number(d.now.slice(0, 2));
  const first = (d.outlet.managerName ?? '').split(' ')[0];
  const nextDay = c.open ? c.forDate : c.nextIfLate;
  const total = 16 * 60 - 6 * 60; // the order day runs 06:00–16:00

  return (
    <Page title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}${first ? `, ${first}` : ''}`} sub={`${dayName(d.date)} · ${d.outlet.name}`}>
      <Panel tone="teal" className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-8 lg:px-8 lg:py-6">
        <div className="grid gap-1">
          <p className="text-[11px] lg:text-xs font-bold tracking-wider text-teal">ORDERS FOR {shortDate(nextDay).toUpperCase()}</p>
          <p className="text-[22px] lg:text-[34px] font-bold text-st-navy leading-tight">{c.open ? 'Closes 4:00 PM' : `Today's cutoff has passed`}</p>
          <p className="text-[12px] lg:text-[13px] text-st-muted">{c.open ? (d.outlet.brand === 'Fresh' ? 'Dry and chilled are ordered separately. Nothing is planned until the cutoff.' : 'Nothing is planned until the cutoff.') : `Orders placed now go on the ${shortDate(c.nextIfLate)} run.`}</p>
        </div>
        {c.open && (
          <div className="grid gap-1.5 lg:w-[240px]">
            <div className="flex text-[13px]"><span className="text-st-muted font-medium">Time left</span><strong className="ml-auto text-teal text-[15px]">{leftText(c.minutesLeft)}</strong></div>
            <div className="h-2 rounded-full bg-st-tealLine overflow-hidden"><div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(4, Math.min(100, (c.minutesLeft / total) * 100))}%` }} /></div>
          </div>
        )}
        <Btn kind="teal" onClick={() => nav('/store/order')}>{c.open ? 'Place tomorrow’s order' : 'Place an order'}</Btn>
      </Panel>

      <div className={PAGE_GRID}>
        <div className="grid gap-4">
          <h2 className="text-[15px] lg:text-[18px] font-semibold text-st-ink">Today · {shortDate(d.date)}</h2>
          {d.today.length === 0 && <Panel><p className="text-[14px] text-st-muted">No delivery for today.</p></Panel>}
          {d.today.map((o) => <TodayCard key={o.id} o={o} />)}

          <Panel className="grid gap-3">
            <h2 className="text-[15px] font-semibold text-st-ink">Recent activity</h2>
            {d.activity.length === 0 && <p className="text-[13px] text-st-muted">Nothing yet today.</p>}
            <ul className="grid gap-3">
              {d.activity.map((a, i) => (
                <li key={i} className="grid grid-cols-[72px_1fr] gap-2 text-[14px]">
                  <span className="text-[13px] font-medium text-st-muted">{hhmm(a.at)}</span>
                  <span className="text-st-ink">{a.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel className="grid gap-3">
            <h2 className="text-[16px] font-semibold text-st-ink">Tomorrow · {shortDate(nextDay)}</h2>
            <ul className="grid gap-3">
              {d.tomorrow.map((t) => (
                <li key={t.temp} className="grid gap-3">
                  <button className="text-left grid gap-0.5 border-l-4 border-st-bar pl-3" onClick={() => (t.order ? nav(`/store/orders/${t.order.id}`) : nav(`/store/order?temp=${t.temp}`))}>
                    <strong className="text-[14px] text-st-ink">{t.typeLabel}</strong>
                    <span className="text-xs text-st-muted">{t.order ? `${t.order.units} ${t.order.unitLabel} · ${t.order.statusText}` : c.open ? 'Not ordered yet · tap to order' : 'Not ordered'}</span>
                  </button>
                  {t.carried && (
                    <button className="text-left grid gap-0.5 border-l-4 border-st-orange pl-3" onClick={() => nav(`/store/orders/${t.carried!.id}`)}>
                      <strong className="text-[14px] text-st-ink">Deferred {t.typeLabel.toLowerCase()} (from {shortDate(d.date).split(' ')[0]})</strong>
                      <span className="text-xs text-st-muted">{t.carried.units} {t.carried.unitLabel} · first in the queue</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="grid gap-3">
            <h2 className="text-[16px] font-semibold text-st-ink">This week</h2>
            <div className="grid grid-cols-3 gap-2">
              <Stat n={d.week.delivered} label="delivered" tone="text-st-green" />
              <Stat n={d.week.deferred} label="deferred" tone="text-st-orange" />
              <Stat n={d.week.toConfirm} label="to confirm" tone="text-st-navy" />
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

const Stat = ({ n, label, tone }: { n: number; label: string; tone: string }) => (
  <div className="grid"><strong className={`text-[26px] font-bold ${tone}`}>{n}</strong><span className="text-xs font-medium text-st-muted">{label}</span></div>
);

function TodayCard({ o }: { o: TStoreOrderCard }) {
  const nav = useNavigate();
  const go = () => nav(`/store/orders/${o.id}`);
  const deferred = o.stage === 'deferred';
  const text: Record<string, string> = {
    received: 'The dispatcher plans this run after the 4:00 PM cutoff.',
    scheduled: `Planned to arrive ${o.arrival ? `${o.arrival.from}–${o.arrival.to}` : 'today'}.`,
    loaded: `Loaded and sealed at the depot. Arrives ${o.arrival ? `${o.arrival.from}–${o.arrival.to}` : 'soon'}.`,
    on_the_way: `On the way. Arrives ${o.arrival ? `${o.arrival.from}–${o.arrival.to}` : 'soon'}.`,
    delivered: `The driver recorded delivery${o.deliveredAt ? ` at ${hhmm(o.deliveredAt)}` : ''} with a signature and a photo. Please confirm what arrived.`,
    confirmed: /issue/i.test(o.statusText) ? 'Confirmed with an issue. The dispatcher has it and will follow up.' : 'Delivered and confirmed. Thank you.',
    deferred: `Not loaded today. New delivery ${o.deferredTo ? shortDate(o.deferredTo) : 'soon'}, first in the queue.`,
    failed: 'The driver could not deliver. The dispatcher is arranging a new time.',
    cancelled: 'Cancelled.',
  };
  const action = o.needsReceipt ? ['Confirm receipt', () => nav(`/store/orders/${o.id}/receipt`)] as const
    : deferred ? ['See why and what to do', go] as const
      : ['on_the_way', 'loaded', 'scheduled'].includes(o.stage) ? ['Track delivery', go] as const : ['View order', go] as const;
  return (
    <Panel tone={deferred ? 'orange' : undefined} className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-x-8">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <strong className="text-[15px] lg:text-[17px] text-st-ink">{o.typeLabel}</strong>
          <Pill tone={STAGE_TONE[o.stage]}>{o.stage === 'delivered' && o.deliveredAt ? `Delivered ${hhmm(o.deliveredAt)}` : o.statusText}</Pill>
        </div>
        <p className={`text-[13px] lg:text-[14px] ${deferred ? 'text-st-ink' : 'text-st-muted'}`}>{text[o.stage]}</p>
        <Label>{o.ref} · {o.units} {o.unitLabel}</Label>
      </div>
      <Btn kind="outline" onClick={action[1]}>{action[0]}</Btn>
    </Panel>
  );
}
