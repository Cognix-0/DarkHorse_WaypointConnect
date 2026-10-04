// D3 Planning board: drag orders between vehicles. Every drop is checked by the planning engine on the server;
// a blocked drop shows the "Drop blocked" toast with the exact rule and vehicles that would take the order.
import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TBoardVehicleDto, TDeferralReason, TOrderDto, TPlanDto, TTripDto } from '@waypoint/shared/contract';
import { ApiError } from '../../api';
import { Badge, brandTone } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Meter } from '../../ui/Meter';
import { Modal } from '../../ui/Modal';
import { Empty, ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, generateAutomatedReason, kg, m3, num, REASON_LABEL, shortDate, unitLabel } from '../../ui/format';
import { checkPlacement, useBoard, useDefer, usePublish, useSaveTrips, useSuggest } from './api';
import { PageHeader } from './PageHeader';

type Target = { vehicleId: string; tripNo: 1 | 2 | 'new' } | 'unassigned';
type DropProps = { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void };
type Show = 'planned' | 'available' | 'reefer' | 'van' | 'workshop';
const FRESH_BUDGET = 270;
const DAY_BUDGET = 480;

export function PlanningBoard() {
  const q = useBoard();
  const save = useSaveTrips();
  const suggest = useSuggest();
  const publish = usePublish();
  const toast = useToast();
  const [show, setShow] = useState<Show>('planned');
  const [over, setOver] = useState<string | null>(null);
  const [deferring, setDeferring] = useState<TOrderDto | null>(null);

  const orders = useMemo(() => new Map((q.data?.orders ?? []).map((o) => [o.id, o])), [q.data]);
  const plan = q.data?.plan ?? null;
  const tripsByVehicle = useMemo(() => {
    const m = new Map<string, TTripDto[]>();
    for (const t of plan?.trips ?? []) m.set(t.vehicleId, [...(m.get(t.vehicleId) ?? []), t]);
    return m;
  }, [plan]);

  if (q.isLoading) return <Loading label="Loading the board…" />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  if (!plan) {
    return (
      <>
        <PageHeader title={`Planning board · ${shortDate(d.date)}`} />
        <Empty title="No plan for this day yet">
          <p className="mb-4">{d.orders.length} orders are locked. Let the engine build a first plan; then adjust it here by dragging.</p>
          <button className="btn-primary" disabled={suggest.isPending} onClick={() => suggest.mutate()}>{suggest.isPending ? 'Allocating…' : 'Auto-allocate'}</button>
        </Empty>
      </>
    );
  }

  const onTrip = new Set(plan.trips.flatMap((t) => t.orderIds));
  const deferredIds = new Set(plan.deferred.map((x) => x.orderId));
  const unassigned = d.orders.filter((o) => !onTrip.has(o.id) && ['locked', 'placed', 'planned', 'deferred'].includes(o.status))
    .sort((a, b) => Number(deferredIds.has(a.id)) - Number(deferredIds.has(b.id)) || a.priority - b.priority);
  const loose = unassigned.filter((o) => !deferredIds.has(o.id));
  const secondPending = d.orders.filter((o) => deferredIds.has(o.id) && o.deferredYesterday && !o.deferral?.confirmed).length;
  const vehicles = d.vehicles.filter((v) => {
    const used = tripsByVehicle.has(v.id);
    if (show === 'workshop') return !v.available;
    if (!v.available) return false;
    if (show === 'planned') return used;
    if (show === 'reefer') return v.temp === 'reefer';
    if (show === 'van') return v.type === 'van';
    return true;
  }).sort((a, b) => Number(tripsByVehicle.has(b.id)) - Number(tripsByVehicle.has(a.id)) || a.id.localeCompare(b.id));

  /** Builds the full trip list after moving one order, then saves it (the server re-validates everything). */
  async function move(orderId: string, target: Target) {
    const trips = plan!.trips.map((t) => ({ vehicleId: t.vehicleId, tripNo: t.tripNo, orderIds: t.orderIds.filter((id) => id !== orderId) }));
    if (target !== 'unassigned') {
      const check = await checkPlacement(orderId, target.vehicleId, target.tripNo === 'new' ? 'new' : target.tripNo).catch((e: Error) => ({ ok: false as const, reason: e.message, alternatives: [] as string[], code: 'ERROR' }));
      if (!check.ok) {
        const o = orders.get(orderId);
        toast({
          tone: 'bad', title: 'Drop blocked',
          body: (
            <div className="grid gap-2">
              <span><strong className="text-ink">{o?.outlet.id}</strong> can't go on {target.vehicleId}{target.tripNo !== 'new' ? ` trip ${target.tripNo}` : ''}: {check.reason}.</span>
              {check.alternatives.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5">Fits on:
                  {check.alternatives.map((v) => <button key={v} className="btn-secondary btn-sm" onClick={() => move(orderId, { vehicleId: v, tripNo: 'new' })}>{v}</button>)}
                </span>
              )}
            </div>
          ),
        });
        return;
      }
      const vt = trips.filter((t) => t.vehicleId === target.vehicleId && t.orderIds.length > 0);
      const into = target.tripNo === 'new' ? undefined : vt.find((t) => t.tripNo === target.tripNo);
      if (into) into.orderIds.push(orderId);
      else trips.push({ vehicleId: target.vehicleId, tripNo: vt.some((t) => t.tripNo === 1) ? 2 : 1, orderIds: [orderId] });
    }
    try {
      const res = await save.mutateAsync(trips.filter((t) => t.orderIds.length > 0));
      if (res.violations.length) toast({ tone: 'bad', title: 'Saved with a rule problem', body: res.violations[0]!.reason });
    } catch (e) { toast({ tone: 'bad', title: 'Could not save the board', body: (e as Error).message }); }
  }

  const dropProps = (key: string, target: Target): DropProps => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); },
    onDragLeave: () => setOver((k) => (k === key ? null : k)),
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, target); },
  });

  async function doPublish() {
    try {
      const r = await publish.mutateAsync();
      toast({ tone: 'ok', title: `Plan v${r.version} published`, body: 'Loaders, drivers and store managers now see it.' });
    } catch (e) {
      const err = e as ApiError;
      toast({ tone: 'bad', title: 'Not published yet', body: <span>{err.message} {err.body?.deferralIds ? <Link className="text-primary font-semibold underline" to="/dispatcher/deferrals">Review deferrals</Link> : null}</span> });
    }
  }

  const served = onTrip.size;
  return (
    <>
      <PageHeader title={`Planning board · ${shortDate(d.date)}`} sub={`${d.depot} DC · ${plan.status === 'published' ? `plan v${plan.version} published` : plan.version ? `editing v${plan.version} – publish again to send changes` : 'draft – not published'} · drag a stop onto another vehicle; the engine checks every drop`}>
        <button className="btn-secondary" disabled={suggest.isPending} onClick={() => suggest.mutate()}>Re-run auto-allocate</button>
        <button className="btn-primary" disabled={publish.isPending || plan.status === 'published'} onClick={doPublish}>
          {plan.status === 'published' ? 'Published' : publish.isPending ? 'Publishing…' : 'Publish plan'}
        </button>
      </PageHeader>

      <ValidationStrip plan={plan} served={served} total={d.orders.length} loose={loose.length} secondPending={secondPending} saving={save.isPending} />

      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Show vehicles">
        {([['planned', 'Vehicles in use', d.vehicles.filter((v) => tripsByVehicle.has(v.id)).length], ['available', 'All available', d.vehicles.filter((v) => v.available).length],
          ['reefer', 'Reefers', d.vehicles.filter((v) => v.available && v.temp === 'reefer').length], ['van', 'Vans', d.vehicles.filter((v) => v.available && v.type === 'van').length],
          ['workshop', 'In workshop', d.vehicles.filter((v) => !v.available).length]] as [Show, string, number][]).map(([id, label, n]) => (
          <button key={id} className={cx('chip', show === id && 'chip-on')} aria-pressed={show === id} onClick={() => setShow(id)}>{label} {n}</button>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start relative max-h-[calc(100vh-240px)] min-h-[500px]">
        <section {...dropProps('unassigned', 'unassigned')} aria-label="Unassigned and deferred orders"
          className={cx('sticky left-0 z-20 shrink-0 w-[288px] rounded-xl border border-dashed p-3 grid gap-2 content-start max-h-[calc(100vh-260px)] overflow-y-auto shadow-xl bg-surface border-line-strong', over === 'unassigned' && 'border-primary bg-primary-tint')}>
          <header className="sticky top-0 z-10 bg-surface pt-0.5 pb-2 flex items-center border-b border-line mb-1">
            <h2 className="text-[13px] font-semibold text-ink">Unassigned Queue</h2>
            <span className="ml-auto text-2xs text-ink-3">{loose.length} open · {unassigned.length - loose.length} deferred</span>
          </header>
          {unassigned.length === 0 && <p className="text-xs text-ink-3 py-6 text-center">Every order is on a trip.</p>}
          {unassigned.map((o) => (
            <OrderCard key={o.id} o={o} deferral={plan.deferred.find((x) => x.orderId === o.id)} onDefer={() => setDeferring(o)} />
          ))}
        </section>

        {vehicles.map((v) => (
          <VehicleColumn key={v.id} v={v} trips={tripsByVehicle.get(v.id) ?? []} orders={orders} plan={plan} over={over} dropProps={dropProps} onDefer={setDeferring} />
        ))}
        {vehicles.length === 0 && <p className="text-[13px] text-ink-3 p-6">No vehicles in this view.</p>}
      </div>

      {deferring && <DeferModal order={deferring} onClose={() => setDeferring(null)} />}
    </>
  );
}

function ValidationStrip({ plan, served, total, loose, secondPending, saving }: { plan: TPlanDto; served: number; total: number; loose: number; secondPending: number; saving: boolean }) {
  const ok = plan.violations.length === 0;
  return (
    <section aria-live="polite" className={cx('card mb-4 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] border-l-4', ok && !loose ? 'border-l-ok' : 'border-l-bad')}>
      <span className={cx('flex items-center gap-2 font-semibold', ok ? 'text-ok' : 'text-bad')}>
        <Icon name={ok ? 'check' : 'alert'} size={16} />
        {ok ? 'All booklet rules pass' : `${plan.violations.length} rule problem(s): ${plan.violations[0]!.vehicleId} – ${plan.violations[0]!.reason}`}
      </span>
      <span className="text-ink-2"><strong className="text-ink tabular">{served}</strong> of {total} orders on <strong className="text-ink tabular">{plan.trips.length}</strong> trips</span>
      <span className="text-ink-2"><strong className={cx('tabular', plan.deferred.length ? 'text-bad' : 'text-ink')}>{plan.deferred.length}</strong> deferred</span>
      {loose > 0 && <span className="text-bad font-medium">{loose} order(s) not on a trip and not deferred</span>}
      {secondPending > 0 && <Link to="/dispatcher/deferrals" className="text-bad font-medium underline">{secondPending} second deferral(s) to confirm</Link>}
      <span className="ml-auto text-xs text-ink-3">{saving ? 'Checking and saving…' : 'Weight, volume, reefer, van-only, depot, one brand and district per trip, 2 trips, 270/480 min, fuel'}</span>
    </section>
  );
}

function VehicleColumn({ v, trips, orders, plan, over, dropProps, onDefer }: {
  v: TBoardVehicleDto; trips: TTripDto[]; orders: Map<string, TOrderDto>; plan: TPlanDto; over: string | null;
  dropProps: (key: string, t: Target) => DropProps; onDefer: (o: TOrderDto) => void;
}) {
  const fuel = v.fuelUsedL + v.fuelPlannedL;
  const kind = `${v.temp === 'reefer' ? 'Reefer' : 'Dry'} ${v.type}`;
  const newKey = `${v.id}|new`;
  return (
    <section aria-label={`${v.id} ${kind}`} className={cx('shrink-0 w-[288px] card p-3 grid gap-3 content-start max-h-[calc(100vh-260px)] overflow-y-auto', !v.available && 'opacity-60')}>
      <header className="sticky top-0 z-10 bg-surface pt-0.5 pb-2 grid gap-2 border-b border-line mb-1">
        <div className="flex items-center gap-2">
          <Icon name="truck" size={16} className="text-ink-3" />
          <strong className="text-[14px]">{v.id}</strong>
          <Badge tone={v.temp === 'reefer' ? 'chill' : 'neutral'}>{kind}</Badge>
          {!v.available && <Badge tone="offline" className="ml-auto">Workshop</Badge>}
        </div>
        <div className="text-2xs text-ink-3">{v.driverName ?? 'No driver'} · {num(v.weightCapKg)} kg · {v.volumeCapM3} m³</div>
        <Meter label="Fuel this week" used={fuel} cap={v.weeklyFuelQuotaL} text={`${num(fuel)} of ${num(v.weeklyFuelQuotaL)} L`} />
      </header>

      {trips.map((t) => {
        const key = `${v.id}|${t.tripNo}`;
        const bad = plan.violations.filter((x) => x.vehicleId === v.id && (x.tripNo === undefined || x.tripNo === t.tripNo));
        const budget = t.brand === 'Fresh' ? FRESH_BUDGET : DAY_BUDGET;
        return (
          <div key={t.id} {...(locked(t) ? {} : dropProps(key, { vehicleId: v.id, tripNo: t.tripNo }))}
            className={cx('rounded-lg border p-2.5 grid gap-2', over === key ? 'border-primary bg-primary-tint' : bad.length ? 'border-bad bg-bad-tint' : 'border-line bg-sunk')}>
            <div className="flex items-center gap-1.5 text-xs whitespace-nowrap min-w-0">
              <strong className="text-ink">Trip {t.tripNo}</strong>
              <Badge tone={brandTone(t.brand)} className="h-5 text-2xs">{t.brand}</Badge>
              <span className="text-ink-2 truncate">{t.district}</span>
              <span className="ml-auto tabular text-2xs text-ink-3">{t.departAt}–{t.endAt}</span>
            </div>
            {t.state !== 'open' && (
              <Badge tone={t.state === 'loading' ? 'warn' : t.state === 'sealed' ? 'ok' : 'info'} className="h-5 text-2xs justify-self-start">
                {t.state === 'loading' ? 'Loading at the dock' : t.state === 'sealed' ? 'Sealed · locked' : 'On the road · locked'}
              </Badge>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Meter label="kg" used={t.weightKg} cap={v.weightCapKg} />
              <Meter label="m³" used={t.volumeM3} cap={v.volumeCapM3} />
              <Meter label="min" used={t.minutes} cap={budget} text={`${t.minutes}`} />
            </div>
            <ol className="grid gap-1.5">
              {t.stops.map((s) => {
                const o = orders.get(s.orderId);
                return o ? <StopCard key={s.orderId} seq={s.seq} eta={s.eta} late={s.late} o={o} onDefer={() => onDefer(o)} locked={locked(t)} /> : null;
              })}
            </ol>
            {bad.map((b, i) => <p key={i} className="text-2xs text-bad font-medium">{b.reason}</p>)}
          </div>
        );
      })}

      {trips.length < 2 && v.available && (
        <div {...dropProps(newKey, { vehicleId: v.id, tripNo: 'new' })}
          className={cx('rounded-lg border border-dashed grid place-items-center h-16 text-xs', over === newKey ? 'border-primary bg-primary-tint text-primary' : 'border-line-strong text-ink-3')}>
          Drop here for trip {trips.some((t) => t.tripNo === 1) ? 2 : 1}
        </div>
      )}
      {!v.available && <p className="text-xs text-ink-3">In the workshop on this day. It can't take trips.</p>}
    </section>
  );
}

const drag = (id: string) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; },
});

const locked = (t: TTripDto) => t.state === 'sealed' || t.state === 'departed';

function StopCard({ seq, eta, late, o, onDefer, locked: isLocked }: { seq: number; eta: string; late: boolean; o: TOrderDto; onDefer: () => void; locked?: boolean }) {
  return (
    <li {...(isLocked ? {} : drag(o.id))} className="group flex items-center gap-2 rounded-md bg-surface border border-line px-2 py-1.5 cursor-grab active:cursor-grabbing" title="Drag to move">
      <span className="grid place-items-center h-5 w-5 rounded-full bg-primary text-white text-2xs font-bold shrink-0">{seq}</span>
      <span className="grid leading-tight min-w-0">
        <span className="text-xs font-semibold text-ink truncate">{o.outlet.id} <span className="font-normal text-ink-3">· {o.units} {unitLabel(o.outlet.brand)}</span></span>
        <span className="text-2xs text-ink-3 truncate">{kg(o.weightKg)}{o.temp === 'chilled' ? ' · chilled' : ''}{o.outlet.parking === 'van_only' ? ' · van only' : ''}{o.deferredYesterday ? ' · skipped last run' : ''}</span>
      </span>
      <span className={cx('ml-auto text-2xs tabular font-semibold', late ? 'text-bad' : 'text-ok')} title={`Window ${o.outlet.windowOpen}–${o.outlet.windowClose}`}>{eta}</span>
      {!isLocked && <button className="hidden group-hover:block text-2xs text-ink-3 hover:text-bad" onClick={onDefer} aria-label={`Defer ${o.outlet.id}`}>Defer</button>}
    </li>
  );
}

function OrderCard({ o, deferral, onDefer }: { o: TOrderDto; deferral?: TPlanDto['deferred'][number]; onDefer: () => void }) {
  return (
    <article {...drag(o.id)} className={cx('rounded-lg bg-surface border p-2.5 grid gap-1.5 cursor-grab active:cursor-grabbing', o.deferredYesterday ? 'border-bad' : 'border-line')}>
      <div className="flex items-center gap-1.5">
        <strong className="text-[13px]">{o.outlet.id}</strong>
        <span className="text-xs text-ink-3">{o.outlet.district}</span>
        <Badge tone={brandTone(o.outlet.brand)} className="ml-auto h-5 text-2xs">{o.outlet.brand}</Badge>
      </div>
      <div className="text-xs text-ink-2 tabular">{o.units} {unitLabel(o.outlet.brand)} · {kg(o.weightKg)} · {m3(o.volumeM3)}</div>
      <div className="flex flex-wrap gap-1">
        {o.temp === 'chilled' && <Badge tone="chill" className="h-5 text-2xs">Chilled</Badge>}
        {o.outlet.parking === 'van_only' && <Badge tone="warn" className="h-5 text-2xs">Van only</Badge>}
        <Badge className="h-5 text-2xs">{o.outlet.windowOpen}–{o.outlet.windowClose}</Badge>
        {o.deferredYesterday && <Badge tone="bad" solid>Skipped last run</Badge>}
      </div>
      {deferral ? (
        <p className="text-2xs text-bad"><strong>Deferred · {REASON_LABEL[deferral.reason]}</strong> ({deferral.type}). {deferral.detail}</p>
      ) : (
        <button className="justify-self-start text-2xs font-semibold text-ink-3 hover:text-bad" onClick={onDefer}>Defer to next run…</button>
      )}
    </article>
  );
}

function DeferModal({ order, onClose }: { order: TOrderDto; onClose: () => void }) {
  const defer = useDefer();
  const toast = useToast();
  const initialReason: TDeferralReason = order.temp === 'chilled' ? 'no_reefer_capacity' : 'vehicle_full';
  const [reason, setReason] = useState<TDeferralReason>(initialReason);
  const [note, setNote] = useState(() => generateAutomatedReason(initialReason, order.outlet.id));
  const [confirm, setConfirm] = useState(false);
  const second = order.deferredYesterday;

  function handleReasonChange(newReason: TDeferralReason) {
    setReason(newReason);
    setNote(generateAutomatedReason(newReason, order.outlet.id));
  }

  function autoFill() {
    setNote(generateAutomatedReason(reason, order.outlet.id));
  }

  async function submit() {
    try {
      await defer.mutateAsync({ orderId: order.id, reason, note: note || undefined, confirmSecondDeferral: second ? confirm : undefined });
      toast({ tone: 'ok', title: `${order.outlet.id} deferred`, body: 'The store manager is told when you publish.' });
      onClose();
    } catch (e) { toast({ tone: 'bad', title: 'Not deferred', body: (e as Error).message }); }
  }

  return (
    <Modal title={`Defer ${order.ref} · ${order.outlet.id}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={defer.isPending || (second && (!confirm || note.trim().length < 3))} onClick={submit}>Defer order</button></>}>
      <p>{order.units} {unitLabel(order.outlet.brand)} for {order.outlet.id} ({order.outlet.district}) move to the next run. This is recorded as your choice unless no vehicle could take it.</p>
      <label className="grid gap-1 font-medium text-ink">Reason
        <select className="input" value={reason} onChange={(e) => handleReasonChange(e.target.value as TDeferralReason)}>
          {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="grid gap-1">
        <div className="flex items-center justify-between">
          <label className="font-medium text-ink">Note for the store manager {second ? '(required)' : '(optional)'}</label>
          <button
            type="button"
            onClick={autoFill}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>Auto-generate reason ✨</span>
          </button>
        </div>
        <textarea className="input h-20 py-2 text-xs" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      {second && (
        <label className="flex items-start gap-2 rounded-lg bg-bad-tint p-3 text-bad">
          <input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span><strong>{order.outlet.id} was already skipped on the last run.</strong> I confirm a second deferral.</span>
        </label>
      )}
    </Modal>
  );
}
