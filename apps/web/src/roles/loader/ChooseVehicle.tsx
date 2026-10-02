// L1 · Choose vehicle
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TLoaderVehicleCard } from '@waypoint/shared/contract';
import { ApiError } from '../../api';
import { Badge, brandTone } from '../../ui/Badge';
import { Empty, ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, num, pct, shortDate } from '../../ui/format';
import { useClaim, useVehicles } from './api';
import { LAST_TRIP } from './LoaderApp';

type F = 'all' | 'ready' | 'loading' | 'waiting' | 'sealed';

export function ChooseVehicle() {
  const q = useVehicles();
  const claim = useClaim();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<F>('all');
  const [brand, setBrand] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => (q.data?.vehicles ?? []).filter((v) =>
    (f === 'all' || v.status === f || (f === 'sealed' && v.status === 'departed') || (f === 'waiting' && v.status === 'held'))
    && (!brand || v.brands.includes(brand as never))
    && (!search || v.vehicleId.toLowerCase().includes(search.trim().toLowerCase()))), [q.data, f, brand, search]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const mine = d.vehicles.find((v) => v.isMine && v.status === 'loading');
  const sel = d.vehicles.find((v) => v.tripId === (selected ?? mine?.tripId));
  const count = (s: F) => d.vehicles.filter((v) => v.status === s || (s === 'sealed' && v.status === 'departed') || (s === 'waiting' && v.status === 'held')).length;
  const brandCount = (b: string) => d.vehicles.filter((v) => v.brands.includes(b as never)).length;

  async function open(v: TLoaderVehicleCard, takeOver = false) {
    try {
      if (v.status === 'ready' || v.status === 'waiting' || (v.status === 'loading' && v.isMine) || takeOver) await claim.mutateAsync({ tripId: v.tripId, takeOver });
    } catch (e) {
      const err = e as ApiError;
      if (err.body?.code === 'TAKEN') {
        toast({ tone: 'bad', title: err.message, body: <button className="btn-secondary btn-sm" onClick={() => open(v, true)}>Take over</button> });
        return;
      }
      if (!(err.status === 409)) { toast({ tone: 'bad', title: 'Could not open the vehicle', body: err.message }); return; }
    }
    localStorage.setItem(LAST_TRIP, v.tripId);
    nav(`/loader/trip/${v.tripId}`);
  }

  if (!d.published) {
    return (
      <>
        <Head d={d} />
        <Empty title="No plan to load yet">The dispatcher has not published tonight&apos;s plan. This screen updates on its own.</Empty>
      </>
    );
  }

  const pendingChange = !d.changes.acknowledged && d.changes.toVersion > 1;
  return (
    <div className="pb-24">
      <Head d={d} />
      {pendingChange && (
        <section className="rounded-[10px] border border-warn-line bg-warn-tint px-6 py-3 mb-4 flex items-center gap-4" aria-live="polite">
          <span className="grid place-items-center h-6 w-6 rounded-full bg-warn text-white text-xs font-extrabold" aria-hidden="true">!</span>
          <div className="grid">
            <strong className="text-[13.5px] text-warn">Plan v{d.changes.toVersion} changed {d.changes.changed} order{d.changes.changed === 1 ? '' : 's'} after picking started</strong>
            <span className="text-[12.5px] text-ink-2">{d.changes.toMove ? `${d.changes.toMove} order${d.changes.toMove === 1 ? '' : 's'} still have to move before those trucks load.` : 'Nothing to move. Acknowledge so the dispatcher knows the dock has the new plan.'}</span>
          </div>
          <button className="ml-auto h-10 px-4 rounded-lg bg-warn text-white text-[13.5px] font-semibold" onClick={() => nav('/loader/changes')}>Review changes</button>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'ready', 'loading', 'waiting', 'sealed'] as F[]).map((s) => (
          <button key={s} onClick={() => setF(s)} aria-pressed={f === s}
            className={cx('h-[30px] px-3.5 rounded-full border text-[12.5px] font-semibold capitalize', f === s ? 'bg-nav border-nav text-white' : 'bg-surface border-line text-ink')}>
            {s} <span className="font-bold">{s === 'all' ? d.vehicles.length : count(s)}</span>
          </button>
        ))}
        <span className="text-[12.5px] text-ink-3 ml-2">Goods:</span>
        {['Fresh', 'Style', 'Tech'].map((b) => (
          <button key={b} onClick={() => setBrand(brand === b ? null : b)} aria-pressed={brand === b}
            className={cx('h-[30px] px-3.5 rounded-full border text-[12.5px] font-semibold flex items-center gap-1.5', brand === b ? 'bg-nav border-nav text-white' : 'bg-surface border-line text-ink')}>
            <i className={cx('h-2 w-2 rounded-full', b === 'Fresh' ? 'bg-fresh' : b === 'Style' ? 'bg-style' : 'bg-tech')} />{b} <span className="font-normal opacity-70">{brandCount(b)}</span>
          </button>
        ))}
        <input className="input ml-auto w-[200px] h-9" placeholder="Search vehicle number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vehicle number" />
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => <VehicleCard key={v.tripId} v={v} selected={sel?.tripId === v.tripId} onSelect={() => setSelected(v.tripId)} onOpen={() => open(v)} />)}
        {list.length === 0 && <p className="text-[13px] text-ink-3 p-6">No vehicles match.</p>}
      </div>

      {sel && (
        <div className="fixed bottom-4 right-4 left-4 lg:left-[264px] z-20 card px-4 py-3 flex items-center gap-4 shadow-toast">
          <div className="grid min-w-0">
            <strong className="text-[14px]">{sel.vehicleId} selected</strong>
            <span className="text-xs text-ink-3 truncate">{sel.brands.join(', ')} {sel.temps.join('/')} goods · {sel.kind.toLowerCase()} · Bay {sel.bay} · departs {sel.departAt} · {sel.itemsDone} of {sel.items} items loaded</span>
          </div>
          <button className="ml-auto h-[52px] px-6 rounded-[10px] bg-primary text-white text-[15px] font-semibold whitespace-nowrap disabled:opacity-50" disabled={claim.isPending} onClick={() => open(sel)}>
            {sel.status === 'loading' && sel.isMine ? `Continue loading ${sel.vehicleId}` : sel.status === 'sealed' || sel.status === 'departed' ? `View ${sel.vehicleId}` : `Start loading ${sel.vehicleId}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Head({ d }: { d: { date: string; now: string; depot: string; payday: boolean; planVersion: number } }) {
  return (
    <header className="flex flex-wrap items-start gap-3 mb-4">
      <div className="grid gap-1 mr-auto">
        <h1 className="text-[22px] font-bold text-nav">Choose a vehicle to load</h1>
        <p className="text-[12.5px] text-ink-3">{d.depot} DC · night shift 22:00–07:00 · {shortDate(d.date)} · {d.now}</p>
      </div>
      {d.payday && <span className="h-[22px] px-2 rounded-md bg-warn-soft text-warn text-[11.5px] font-semibold grid place-items-center">Payday</span>}
      {d.planVersion > 0 && <span className="h-[22px] px-2 rounded-md bg-primary-soft text-primary text-[11.5px] font-semibold grid place-items-center">Plan v{d.planVersion}</span>}
    </header>
  );
}

function VehicleCard({ v, selected, onSelect, onOpen }: { v: TLoaderVehicleCard; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const p = pct(v.itemsDone, v.items);
  const foot = v.status === 'loading' ? (v.isMine ? ['Loading · you', 'text-primary'] : [`${v.loaderName ?? 'Someone'} is loading`, 'text-ink-3'])
    : v.status === 'ready' ? ['Ready to load', 'text-ok'] : v.status === 'sealed' ? ['Sealed', 'text-ok'] : v.status === 'departed' ? ['Left the dock', 'text-ink-3']
      : v.status === 'held' ? ['Held for the dispatcher', 'text-warn'] : [v.note ?? 'Waiting', 'text-ink-3'];
  const action = v.status === 'ready' ? 'Start loading' : v.status === 'loading' && v.isMine ? 'Continue' : 'View';
  return (
    <article onClick={onSelect}
      className={cx('rounded-[10px] border bg-surface p-4 grid gap-1.5 cursor-pointer transition-colors', selected ? 'border-primary border-2 bg-primary-faint' : 'border-line hover:border-line-strong')}>
      <div className="flex items-center gap-2">
        <strong className="text-[17px] text-nav">{v.vehicleId}</strong>
        {v.brands.map((b) => <Badge key={b} tone={brandTone(b)} className="h-5 text-[11.5px]">{b}</Badge>)}
        {v.temps.map((t) => <Badge key={t} tone={t === 'chilled' ? 'chill' : 'neutral'} className="h-5 text-[11.5px] capitalize">{t}</Badge>)}
        <span className="ml-auto h-5 px-2 rounded-md bg-offline-tint text-ink-2 text-[11.5px] font-semibold grid place-items-center">Bay {v.bay}</span>
      </div>
      <strong className="text-[14px] text-nav">Departs {v.departAt}</strong>
      <span className="text-xs text-ink-3">{v.route}</span>
      <span className="text-[12.5px] font-medium text-ink-2">{v.stops} stops · {v.items} items · {num(v.weightKg)} kg</span>
      <div className="grid gap-1 mt-1">
        <div className="flex text-[11.5px]"><span className="font-semibold text-nav">{v.itemsDone} of {v.items} items loaded</span><span className="ml-auto text-ink-3">{p}%</span></div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className={cx('h-full rounded-full', p === 100 ? 'bg-ok-bright' : 'bg-primary')} style={{ width: `${p}%` }} /></div>
      </div>
      <div className="flex items-center mt-2 pt-2 border-t border-line">
        <span className={cx('text-[11.5px] font-semibold', foot[1])}>{foot[0]}</span>
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className={cx('ml-auto h-9 px-4 rounded-lg text-[12.5px] font-semibold', action === 'View' ? 'border border-line-strong text-nav bg-surface' : action === 'Continue' ? 'bg-primary text-white' : 'border border-line-strong text-nav bg-surface')}>
          {action}
        </button>
      </div>
    </article>
  );
}
