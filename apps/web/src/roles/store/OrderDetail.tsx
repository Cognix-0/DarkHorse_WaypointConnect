// SM3 Order status · SM4 Track delivery · SM6 Order deferred — one page that shows what matters for the order's stage.
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { TStoreOrderDetail } from '@waypoint/shared/contract';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, REASON_LABEL, shortDate } from '../../ui/format';
import { DISPATCH_PHONE, useDeferralResponse, useOrder } from './api';
import { Page } from './StoreApp';
import { Btn, hhmm, Label, PAGE_GRID, Panel, Pill, STAGE_TONE } from './ui';

export function OrderDetail() {
  const { id = '' } = useParams();
  const loc = useLocation();
  const q = useOrder(id);
  if (q.isLoading) return <Page title="Order"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Order"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const o = d.order;
  const placed = new URLSearchParams(loc.search).get('placed') === '1';
  // The deferred order, and the order carried to the new day (until it is on its way), open the SM6 view.
  if (d.deferral && (o.stage === 'deferred' || (o.deliveryDate === d.deferral.newDate && ['received', 'scheduled'].includes(o.stage)))) return <Deferred d={d} />;
  return (
    <Page title={`${o.typeLabel} · ${shortDate(o.deliveryDate)}`} sub={`${o.ref} · ${o.units} ${o.unitLabel} · ${Math.round(o.weightKg)} kg`}
      pill={<Pill tone={STAGE_TONE[o.stage]}>{o.statusText}</Pill>}>
      {placed && (
        <Panel tone="green" className="flex items-center gap-4">
          <span className="grid place-items-center h-10 w-10 rounded-full bg-st-green text-white text-[20px] font-bold shrink-0" aria-hidden="true">✓</span>
          <div className="grid gap-0.5">
            <strong className="text-[17px] text-st-greenDark">{o.typeLabel} order received</strong>
            <span className="text-[13px] text-st-greenText">Saved {hhmm(d.placedAt)} · Ref {o.ref} · You will be notified when it is scheduled</span>
          </div>
        </Panel>
      )}
      <div className={PAGE_GRID}>
        <div className="grid gap-4">
          {d.tracking ? <Track d={d} /> : <Timeline d={d} />}
          {d.pod && <Pod d={d} />}
          {d.receipt && (
            <Panel tone={d.receipt.issues.length ? 'orange' : 'green'} className="grid gap-1">
              <strong className="text-[15px] text-st-ink">Receipt confirmed {hhmm(d.receipt.at)} · {d.receipt.result}</strong>
              {d.receipt.issues.map((x, i) => <span key={i} className="text-[13px] text-st-ink">{x}</span>)}
            </Panel>
          )}
          <Lines d={d} />
        </div>
        <Side d={d} />
      </div>
    </Page>
  );
}

function Timeline({ d }: { d: TStoreOrderDetail }) {
  return (
    <Panel className="grid gap-4">
      <div className="flex items-center">
        <h2 className="text-[17px] font-semibold text-st-ink">{d.order.typeLabel} · {shortDate(d.order.deliveryDate)}</h2>
        <span className="ml-auto text-xs font-semibold text-st-navy">{d.order.units} {d.order.unitLabel} · {Math.round(d.order.weightKg)} kg</span>
      </div>
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {d.timeline.map((s) => (
          <li key={s.key} className={cx('rounded-xl border px-3 py-3 grid gap-1', s.done ? 'border-st-greenLine bg-st-greenTint' : s.current ? 'border-teal bg-st-tealTint' : 'border-st-bar')}>
            <span className="flex items-center gap-2">
              <span className={cx('h-5 w-5 rounded-full grid place-items-center text-[11px] font-bold', s.done ? 'bg-st-green text-white' : s.current ? 'bg-teal text-white' : 'bg-line text-st-muted')} aria-hidden="true">{s.done ? '✓' : ''}</span>
              <strong className={cx('text-[15px]', s.done || s.current ? 'text-st-ink' : 'text-st-muted')}>{s.label}</strong>
            </span>
            <span className={cx('text-xs', s.current ? 'text-teal font-medium' : 'text-st-muted')}>{s.sub}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** SM4 · Track delivery */
function Track({ d }: { d: TStoreOrderDetail }) {
  const t = d.tracking!;
  const steps = [
    ['Loaded', t.loadedAt ? hhmm(t.loadedAt) : '—', !!t.loadedAt],
    ['Left depot', t.departedAt ? hhmm(t.departedAt) : '—', !!t.departedAt],
    [t.stopsAway ? `${t.stopsAway} stop${t.stopsAway > 1 ? 's' : ''} away` : 'Next stop: you', 'now', !!t.departedAt],
    ['Arrive', `~${t.eta}`, false],
  ] as const;
  return (
    <>
      <Panel className="flex items-center gap-4">
        <div className="grid gap-1">
          <Label>{d.order.typeLabel} · {t.vehicleKind} {t.vehicleId}</Label>
          <strong className="text-[26px] font-bold text-st-ink">Arriving ~{t.eta}</strong>
        </div>
        <Pill tone={t.onTime ? 'green' : 'red'} className="ml-auto">{t.onTime ? 'On time' : `After ${d.outlet.windowClose}`}</Pill>
      </Panel>
      <Panel>
        <ol className="grid grid-cols-4 gap-2 text-center">
          {steps.map(([label, sub, done]) => (
            <li key={label} className="grid gap-1 justify-items-center">
              <span className={cx('h-3 w-3 rounded-full', done ? 'bg-st-green' : 'bg-line-strong')} aria-hidden="true" />
              <strong className={cx('text-[12px]', done ? 'text-st-ink' : 'text-st-muted')}>{label}</strong>
              <span className="text-[11px] text-st-muted">{sub}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel className="grid gap-2">
        <strong className="text-[13px] text-st-ink">Get ready to receive</strong>
        <p className="text-[13px] text-st-ink">Unloading is at the {d.outlet.dockType === 'street' ? 'curb. Keep the space in front of the shop clear.' : d.outlet.dockType === 'mall_bay' ? 'mall bay. Tell security a Waypoint truck is coming.' : 'rear dock. Keep the dock door free.'}</p>
        <p className="text-[13px] text-st-ink">Handling takes about {t.handlingMin} min, so goods should be inside by ~{t.readyBy}.</p>
        {t.lastUpdate && <p className="rounded-lg bg-drv-amberBg px-3 py-2 text-[11px] font-medium text-drv-amber">Last driver update {hhmm(t.lastUpdate)}. Where signal is weak, times may lag.</p>}
      </Panel>
    </>
  );
}

function Pod({ d }: { d: TStoreOrderDetail }) {
  const p = d.pod!;
  const nav = useNavigate();
  return (
    <Panel className="grid gap-3">
      <h2 className="text-[16px] font-semibold text-st-ink">Proof of delivery</h2>
      <div className="flex gap-4 items-start">
        {p.photo ? <img src={p.photo} alt="Goods at delivery" className="h-24 w-24 rounded-lg object-cover border border-st-bar" /> : <span className="h-24 w-24 rounded-lg bg-sunk grid place-items-center text-xs text-st-muted">No photo</span>}
        <div className="grid gap-1 text-[13px]">
          <strong className="text-[14px] text-st-ink">{p.driverName ?? 'Driver'} · {p.vehicleId}</strong>
          <span className="text-st-muted">Delivered {hhmm(p.at)} · received by {p.receiverName ?? '—'}</span>
          {p.signature && <img src={p.signature} alt="Signature" className="h-12 w-40 object-contain bg-white border border-st-bar rounded" />}
        </div>
      </div>
      {d.order.needsReceipt && <Btn onClick={() => nav(`/store/orders/${d.order.id}/receipt`)}>Confirm receipt</Btn>}
    </Panel>
  );
}

function Lines({ d }: { d: TStoreOrderDetail }) {
  return (
    <Panel className="grid gap-2">
      <h2 className="text-[15px] font-semibold text-st-ink">What you ordered</h2>
      <ul className="grid divide-y divide-line-soft">
        {d.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2.5 text-[14px]">
            <span className="text-st-ink font-medium">{l.product}</span>
            <span className="text-xs text-st-muted">{l.packSize}</span>
            {l.shortFromDock > 0 && <Pill tone="orange">{l.shortFromDock} short from the dock</Pill>}
            <span className="ml-auto tabular text-st-ink">{l.packs} {l.pack}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Side({ d }: { d: TStoreOrderDetail }) {
  const nav = useNavigate();
  const o = d.order;
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-2">
        <h2 className="text-[16px] font-bold text-st-navy">When will it arrive?</h2>
        <p className="text-[13px] text-st-ink">
          {o.arrival ? `Planned ${o.arrival.from}–${o.arrival.to}. Your window is ${d.outlet.windowOpen}–${d.outlet.windowClose}.`
            : o.deliveredAt ? `Delivered ${hhmm(o.deliveredAt)}.`
              : 'After 4 PM the dispatcher plans the run. Your expected arrival time will appear here, and you will get a notification.'}
        </p>
      </Panel>
      <Panel className="grid gap-3">
        <h2 className="text-[16px] font-semibold text-st-ink">Need to change something?</h2>
        <p className="text-[13px] text-st-muted">{o.editable ? 'You can edit quantities until 4:00 PM. After that the order is locked into the plan.' : 'This order is locked into the plan. Call the dispatcher for changes.'}</p>
        {o.editable ? <Btn kind="outline" onClick={() => nav(`/store/order?temp=${o.temp}`)}>Edit order until 4:00 PM</Btn> : <Btn kind="outline" href={`tel:${DISPATCH_PHONE.replace(/\s/g, '')}`}>Call dispatcher</Btn>}
      </Panel>
    </div>
  );
}

/** SM6 · Order deferred */
function Deferred({ d }: { d: TStoreOrderDetail }) {
  const f = d.deferral!;
  const respond = useDeferralResponse();
  const toast = useToast();
  async function act(action: 'accept' | 'cancel') {
    try {
      await respond.mutateAsync({ orderId: d.order.id, action });
      toast({ tone: 'ok', title: action === 'accept' ? `Thanks. Delivery expected ${shortDate(f.newDate)}` : 'Order cancelled', body: 'The dispatcher can see your answer.' });
    } catch (e) { toast({ tone: 'bad', title: 'Not saved', body: (e as Error).message }); }
  }
  return (
    <Page title={`Order deferred · ${d.order.typeLabel}`} sub={`${shortDate(f.fromDate)} · recorded ${hhmm(f.recordedAt)}`}
      pill={!f.response && <span className="h-7 px-3 rounded-full bg-st-orange text-white text-[13px] font-semibold grid place-items-center">Action needed</span>}>
      <div className={PAGE_GRID}>
        <div className="grid gap-4">
          <Panel tone="orange" className="flex gap-4 items-start">
            <span className="grid place-items-center h-11 w-11 rounded-full bg-st-orange text-white text-[24px] font-bold shrink-0" aria-hidden="true">!</span>
            <div className="grid gap-1">
              <strong className="text-[18px] lg:text-[22px] text-st-brown">Your {d.order.typeLabel.toLowerCase()} order for {shortDate(f.fromDate)} was deferred</strong>
              <span className="text-[14px] text-st-brown">{f.unitsLate} {d.order.unitLabel} will not be loaded on the planned run.</span>
            </div>
          </Panel>
          <Panel className="grid gap-5">
            <div className="grid gap-1.5">
              <Label>Why</Label>
              <p className="text-[15px] text-st-ink">{f.reasonText}</p>
              <p className="text-xs font-medium text-st-muted">{REASON_LABEL[f.reason]} · {f.type === 'unavoidable' ? 'no vehicle could take it' : "the dispatcher's choice"} · recorded {hhmm(f.recordedAt)}</p>
            </div>
            <div className="grid gap-2">
              <Label>What happens next</Label>
              <ol className="grid gap-3 border-l-2 border-st-bar pl-4">
                <li className="grid"><strong className="text-[15px] text-st-ink">{shortDate(f.fromDate)}</strong><span className="text-[13px] text-st-muted">Not delivered</span></li>
                <li className="grid"><strong className="text-[15px] text-st-ink">{shortDate(f.newDate)}{f.newArrival ? ` · ${f.newArrival.from}–${f.newArrival.to}` : ''}</strong><span className="text-[13px] text-st-muted">New delivery.{f.firstInQueue ? ' First in the queue because this outlet was skipped.' : ''}</span></li>
              </ol>
            </div>
          </Panel>
        </div>
        <div className="grid gap-4">
          <Panel className="grid gap-3">
            <h2 className="text-[17px] font-semibold text-st-ink">What would you like to do?</h2>
            {f.response ? (
              <p className={cx('text-[14px] font-semibold', f.response === 'accepted' ? 'text-st-green' : 'text-st-red')}>
                {f.response === 'accepted' ? `You accepted the ${shortDate(f.newDate)} delivery.` : 'You cancelled this order.'}
              </p>
            ) : (
              <>
                <Btn onClick={() => act('accept')} disabled={respond.isPending}>Accept {shortDate(f.newDate)} delivery</Btn>
                <Btn kind="outline" href={`tel:${DISPATCH_PHONE.replace(/\s/g, '')}`}>Call dispatcher · {d.outlet.depot}</Btn>
                <Btn kind="danger" onClick={() => act('cancel')} disabled={respond.isPending}>Cancel this order</Btn>
              </>
            )}
          </Panel>
          <Panel className="grid gap-3">
            <h2 className="text-[16px] font-semibold text-st-ink">What this costs you</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid"><strong className="text-[24px] font-bold text-st-orange">{f.unitsLate}</strong><span className="text-[11px] font-medium text-st-muted">{d.order.unitLabel} late</span></div>
              <div className="grid"><strong className="text-[24px] font-bold text-st-red">{f.runsSkipped}</strong><span className="text-[11px] font-medium text-st-muted">run{f.runsSkipped > 1 ? 's' : ''} skipped</span></div>
              <div className="grid"><strong className="text-[24px] font-bold text-st-navy">{f.daysSinceLast}</strong><span className="text-[11px] font-medium text-st-muted">days since last {d.order.temp === 'chilled' ? 'chilled' : 'delivery'}</span></div>
            </div>
            {f.lastServed && <p className="text-xs text-st-muted">Last {d.order.temp === 'chilled' ? 'chilled ' : ''}delivery: {shortDate(f.lastServed)}</p>}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
