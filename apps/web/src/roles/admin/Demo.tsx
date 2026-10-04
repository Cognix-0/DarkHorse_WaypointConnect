// Demo mode: put the whole system on the official peak day for a while, follow the demo story step by step,
// then go back to the real Sri Lanka date and time.
import { useState } from 'react';
import type { TDemoStatusResponse } from '@waypoint/shared/contract';
import { Badge } from '../../ui/Badge';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { colomboTime, cx, longDate, shortDate } from '../../ui/format';
import { useDemo, useDemoAction } from './api';
import { AdminHeader } from './parts';

type Story = TDemoStatusResponse['story'];

/** The steps of the demo story; each one ticks itself off from the live data. */
function steps(s: Story) {
  const live = s.storeOrders.find((o) => o.placedLive);
  const v = s.vehicle;
  const veh = v.id ?? 'the vehicle the plan chooses (VEH031 with the suggested packs)';
  const vehEmail = v.accountEmail ?? 'veh031@waypoint.lk';
  const trips = v.trips;
  const storeTrip = trips.find((t) => t.tripNo === live?.tripNo);
  const sealed = trips.length > 0 && trips.every((t) => t.status !== 'open' && t.status !== 'loading');
  const ds = s.deferredStore;
  return [
    {
      who: 'Store manager', email: 'out026@waypoint.lk', clock: 'Tue 24 Mar · 14:18',
      what: 'Place order → Dry groceries → keep the suggested packs → Place order. It is before the 16:00 cutoff, so the order goes on the 25 Mar run.',
      done: !!live, note: live ? `${live.ref} placed` : null,
    },
    {
      who: 'Dispatcher', email: 'dispatcher@waypoint.lk', clock: 'Wed 25 Mar · 06:42',
      what: `Order Queue: the new order appears by itself. Auto-allocate & open board. Find ${live?.ref ?? 'the store order'} on the board. To show the rule checks, drag it onto VEH024: "Drop blocked" explains why.`,
      done: !!live?.vehicleId, note: live?.vehicleId ? `${live.ref} is on ${live.vehicleId} trip ${live.tripNo}` : null,
    },
    {
      who: 'Dispatcher', email: 'dispatcher@waypoint.lk', clock: 'Wed 25 Mar · 06:42',
      what: 'Deferrals: payday chilled overload. Each deferral has its reason and is marked unavoidable or choice. Try recovery options A–C, then Confirm & publish: every affected store gets a message.',
      done: s.planStatus === 'published', note: s.planStatus === 'published' ? `Plan v${s.planVersion} published · ${s.deferred} deferred` : null,
    },
    {
      who: 'Deferred store', email: ds?.accountEmail ?? 'a deferred store (after publishing)', clock: 'Tue 24 Mar · 14:18',
      what: `Updates show the deferral message${ds ? ` for ${ds.ref}` : ''} → Order deferred → Accept the new date (or cancel). The dispatcher sees the answer on Live Tracking.`,
      done: !!ds && ds.answer !== 'waiting', note: ds ? (ds.answer === 'waiting' ? `${ds.outletId} has not answered yet` : `${ds.outletId} ${ds.answer}`) : null,
    },
    {
      who: 'Loader', email: 'loader1.peliyagoda@waypoint.lk', clock: 'Wed 25 Mar · 02:40',
      what: `Choose ${veh} → load each stop (last stop first), report one short pack → Seal & release trip 1, then trip 2.`,
      done: sealed, note: trips.length ? trips.map((t) => `trip ${t.tripNo}: ${t.status}`).join(' · ') : null,
    },
    {
      who: `Driver${v.driverName ? ` ${v.driverName}` : ''} (phone)`, email: vehEmail, clock: 'phone time',
      what: `Trip 1${trips[0] ? ` (${trips[0].district}, ${trips[0].stops} stops)` : ''}: load check → depart → arrive → proof of delivery (photo + signature) at each stop; try airplane mode once. Then the next trip${storeTrip ? ` (${storeTrip.district})` : ''} to store OUT026 and unload there.`,
      done: !!storeTrip && storeTrip.stops > 0 && storeTrip.delivered === storeTrip.stops,
      note: trips.length ? trips.map((t) => `trip ${t.tripNo}: ${t.delivered}/${t.stops} delivered`).join(' · ') : null,
    },
    {
      who: 'Store manager', email: 'out026@waypoint.lk', clock: 'Tue 24 Mar · 14:18',
      what: 'Orders → the delivered order (photo and signature from the driver) → Confirm receipt: mark one line Short. The dispatcher gets an alert on Live Tracking and answers it (Reply to store).',
      done: live?.status === 'received', note: null,
    },
  ];
}

export function Demo() {
  const q = useDemo();
  const act = useDemoAction();
  const toast = useToast();
  const [hours, setHours] = useState(2);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  /** reset: start from the beginning; extending a running demo keeps its progress. */
  async function run(action: 'start' | 'reset' | 'end', label: string, reset = true) {
    try {
      await act.mutateAsync({ action, hours, reset });
      toast({ tone: 'ok', title: label });
    } catch (e) {
      toast({ tone: 'bad', title: (e as Error).message });
    }
  }

  return (
    <>
      <AdminHeader title="Demo mode" sub={`Runs the whole system on ${longDate(d.date)}, the official peak day (payday, chilled overload), then goes back to real time.`}>
        {d.active ? <Badge tone="warn">Demo on · ends {d.endsAt ? colomboTime(d.endsAt) : ''}</Badge> : <Badge tone="ok">Real Sri Lanka time</Badge>}
      </AdminHeader>

      <section className={cx('card p-5 mb-5 grid gap-4', d.active && 'border-warn-line bg-warn-faint')} aria-label="Demo controls">
        {d.active ? (
          <>
            <p className="text-[13px] text-ink-2">
              Every screen is on the demo day: store managers at <strong>{shortDate(d.storeDate)} {d.clocks.store}</strong> (before the cutoff),
              loaders at <strong>{d.clocks.loader}</strong>, the dispatcher's live view at <strong>{d.clocks.dispatcher}</strong>; drivers use their phone.
              It goes back to the real date and time by itself at <strong>{d.endsAt ? colomboTime(d.endsAt) : ''}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={act.isPending} onClick={() => run('reset', 'Demo data reset: back to the starting point')}>Reset demo data</button>
              <button className="btn-secondary" disabled={act.isPending} onClick={() => run('start', `Demo now ends ${hours} h from now`, false)}>Extend to {hours} h from now</button>
              <HoursPicker hours={hours} setHours={setHours} />
              <button className="btn-primary ml-auto" disabled={act.isPending} onClick={() => run('end', 'Demo ended: real Sri Lanka date and time again')}>End demo now</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-2">
              Starting puts every screen on the demo day and resets its data to the starting point: 84 peak-day orders, 10 vehicles in the workshop,
              and store {d.story.storeId}'s dry order left out so it can be placed live. Open screens follow straight away; no one needs to refresh.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <HoursPicker hours={hours} setHours={setHours} />
              <button className="btn-primary" disabled={act.isPending} onClick={() => run('start', 'Demo mode on')}>{act.isPending ? 'Starting…' : 'Start demo'}</button>
            </div>
          </>
        )}
      </section>

      <section className="card overflow-hidden mb-5" aria-labelledby="story-h">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <h2 id="story-h" className="text-[15px] font-semibold mr-auto">Demo story</h2>
          <span className="text-[13px] text-ink-3">{d.story.ordersOnRun} orders on the run · plan {d.story.planStatus === 'none' ? 'not made yet' : `v${d.story.planVersion} ${d.story.planStatus}`}</span>
        </div>
        <ol className="border-t border-line">
          {steps(d.story).map((s, i) => (
            <li key={i} className="flex gap-4 px-5 py-3 border-b border-line last:border-0">
              <span className={cx('grid place-items-center h-7 w-7 shrink-0 rounded-full text-xs font-bold', s.done ? 'bg-ok text-white' : 'bg-sunk text-ink-3 border border-line')}>{s.done ? '✓' : i + 1}</span>
              <div className="grid gap-1 text-[13px] min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{s.who}</strong>
                  <code className="text-xs text-primary">{s.email}</code>
                  <span className="text-2xs text-ink-3">· {s.clock}</span>
                </div>
                <p className="text-ink-2">{s.what}</p>
                {s.note && <p className={cx('text-xs font-semibold', s.done ? 'text-ok' : 'text-warn')}>{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5 grid gap-2 text-[13px] text-ink-2" aria-labelledby="tips-h">
        <h2 id="tips-h" className="text-[15px] font-semibold text-ink">Tips</h2>
        <p>Use a separate browser window (or a private window) for each account, so all of them stay signed in side by side.</p>
        <p>Messages: stores are told about deferrals, deliveries and problems automatically; on Live Tracking the dispatcher answers alerts (Notify store, Reply to store, Move to next run).</p>
        <p>Passwords: each account's own password (Accounts, or the credentials list).</p>
      </section>
    </>
  );
}

function HoursPicker({ hours, setHours }: { hours: number; setHours: (h: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">for
      <select className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Demo length">
        {[0.5, 1, 2, 3, 4].map((h) => <option key={h} value={h}>{h < 1 ? '30 min' : `${h} h`}</option>)}
      </select>
    </label>
  );
}
