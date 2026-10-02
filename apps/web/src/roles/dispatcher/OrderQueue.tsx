// D2 Order queue: every locked order in priority order, filterable, with history so a shop is never skipped twice unnoticed.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TOrderDto } from '@waypoint/shared/contract';
import { Badge, brandTone } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, DOCK_LABEL, kg, m3, num, REASON_LABEL, shortDate, tonnes } from '../../ui/format';
import { useQueue, useSuggest } from './api';
import { PageHeader } from './PageHeader';

type Filter = 'all' | 'Fresh' | 'Style' | 'Tech' | 'chilled' | 'van_only' | 'mall' | 'deferred';
type Sort = 'priority' | 'window' | 'weight';

export function OrderQueue() {
  const q = useQueue();
  const suggest = useSuggest();
  const nav = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('priority');
  const [search, setSearch] = useState('');
  const [confirmRerun, setConfirmRerun] = useState(false);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const s = search.trim().toLowerCase();
    const r = q.data.orders.filter((o) => match(o, filter) && (!s || `${o.ref} ${o.outlet.id} ${o.outlet.district}`.toLowerCase().includes(s)));
    if (sort === 'window') r.sort((a, b) => a.outlet.windowClose.localeCompare(b.outlet.windowClose));
    if (sort === 'weight') r.sort((a, b) => b.weightKg - a.weightKg);
    return r;
  }, [q.data, filter, sort, search]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const s = d.summary;

  async function allocate() {
    setConfirmRerun(false);
    try {
      const r = await suggest.mutateAsync();
      toast({ tone: 'ok', title: `Plan drafted: ${r.served} orders on trips, ${r.deferred} deferred`, body: 'Every rule was checked by the planning engine. Review it on the board.' });
      nav('/dispatcher/board');
    } catch (e) { toast({ tone: 'bad', title: 'Auto-allocate failed', body: (e as Error).message }); }
  }

  const chips: [Filter, string, number][] = [
    ['all', 'All', s.total], ['Fresh', 'Fresh', s.byBrand.Fresh], ['Style', 'Style', s.byBrand.Style], ['Tech', 'Tech', s.byBrand.Tech],
    ['chilled', 'Chilled', s.chilled], ['van_only', 'Van only', s.vanOnly], ['mall', 'Mall window', s.mallWindow], ['deferred', 'Deferred before', s.skippedLastRun],
  ];

  return (
    <>
      <PageHeader title={`Order queue · ${shortDate(d.date)}`} sub={`${s.total} orders locked at 16:00 · sorted by the priority policy · ${s.vehiclesAvailable} of ${s.vehiclesTotal} vehicles available`}>
        <button className="btn-secondary" onClick={() => exportCsv(d.date, d.orders)}><Icon name="download" size={16} /> Export CSV</button>
        {d.planStatus === 'none' ? (
          <button className="btn-primary" disabled={suggest.isPending || s.total === 0} onClick={allocate}>{suggest.isPending ? 'Allocating…' : 'Auto-allocate & open board'}</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => setConfirmRerun(true)} disabled={suggest.isPending}>Re-run auto-allocate</button>
            <button className="btn-primary" onClick={() => nav('/dispatcher/board')}>Open planning board</button>
          </>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Filter orders">
        {chips.map(([id, label, n]) => (
          <button key={id} className={cx('chip', filter === id && 'chip-on')} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label} {n}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input className="input w-56" placeholder="Search order, outlet or district" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          <label className="text-xs text-ink-3 flex items-center gap-1.5">Sort
            <select className="input h-8" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="priority">Priority</option><option value="window">Window</option><option value="weight">Weight</option>
            </select>
          </label>
        </div>
      </div>

      <section className="card mb-4 grid grid-cols-2 md:grid-cols-5 divide-x divide-line" aria-label="Totals">
        <Total label="Weight" value={kg(s.weightKg)} foot={`${tonnes(s.weightKg)} to move`} />
        <Total label="Volume" value={m3(s.volumeM3)} foot="all orders" />
        <Total label="Chilled weight" value={kg(s.chilledKg)} foot={`${s.chilled} orders need a reefer`} tone="chill" />
        <Total label="Van-only orders" value={num(s.vanOnly)} foot="trucks can't reach" />
        <Total label="Mall-window orders" value={num(s.mallWindow)} foot="fixed delivery slot" />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[1040px]">
          <thead className="border-b border-line">
            <tr>
              {['Order', 'Outlet', 'Brand', 'Depot', 'Temp', 'Weight', 'Vol', 'Window', 'Access', 'History / notes', 'Status'].map((h) => (
                <th key={h} className={cx('th', (h === 'Weight' || h === 'Vol') && 'text-right')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => <Row key={o.id} o={o} />)}
            {rows.length === 0 && <tr><td colSpan={11} className="td text-center text-ink-3 py-8">No orders match this filter.</td></tr>}
          </tbody>
          {d.afterCutoffOrders.length > 0 && (
            <tbody>
              <tr className="bg-sunk border-y border-line">
                <td colSpan={11} className="td text-xs text-ink-3">
                  Received after cutoff ({d.afterCutoffOrders.length}) · moved to the {shortDate(d.nextRunDate)} run · store managers notified
                </td>
              </tr>
              {d.afterCutoffOrders.map((o) => <Row key={o.id} o={o} muted />)}
            </tbody>
          )}
        </table>
      </section>
      <p className="mt-3 text-xs text-ink-3">Priority: 1 skipped last run or unserved 2+ days · 2 Fresh chilled · 3 Fresh ambient · 4 Tech · 5 Style. Ties: van-only and mall slots first, then earliest window close, then heaviest.</p>

      {confirmRerun && (
        <Modal title="Re-run auto-allocate?" onClose={() => setConfirmRerun(false)}
          footer={<><button className="btn-secondary" onClick={() => setConfirmRerun(false)}>Cancel</button><button className="btn-primary" onClick={allocate}>Replace the plan</button></>}>
          <p>The engine will rebuild every trip from scratch. Changes you made on the planning board and deferrals you chose will be replaced.</p>
          {d.planStatus === 'published' && <p className="text-bad font-medium">The plan is already published. You will need to publish again so loaders and drivers get the new version.</p>}
        </Modal>
      )}
    </>
  );
}

function match(o: TOrderDto, f: Filter) {
  switch (f) {
    case 'all': return true;
    case 'chilled': return o.temp === 'chilled';
    case 'van_only': return o.outlet.parking === 'van_only';
    case 'mall': return o.outlet.parking === 'mall_dock' || !!o.outlet.mallWindow;
    case 'deferred': return o.deferredYesterday;
    default: return o.outlet.brand === f;
  }
}

function Total({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'chill' }) {
  return (
    <div className="px-4 py-3 grid gap-0.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      <strong className={cx('text-lg font-bold tabular', tone === 'chill' ? 'text-chill' : 'text-ink')}>{value}</strong>
      <span className="text-xs text-ink-3">{foot}</span>
    </div>
  );
}

function Row({ o, muted }: { o: TOrderDto; muted?: boolean }) {
  const mustServe = o.deferredYesterday && !muted;
  return (
    <tr className={cx('border-b border-line last:border-0', mustServe && 'bg-bad-tint', muted && 'opacity-55')}>
      <td className="td font-mono text-xs text-ink">{o.ref}</td>
      <td className="td"><strong className="block text-ink">{o.outlet.id}</strong><span className="text-xs text-ink-3">{o.outlet.district}</span></td>
      <td className="td"><Badge tone={brandTone(o.outlet.brand)}>{o.outlet.brand}</Badge></td>
      <td className="td">{o.outlet.depot}</td>
      <td className="td">{o.temp === 'chilled' ? <Badge tone="chill"><Icon name="snow" size={12} />Chilled</Badge> : <span className="text-ink-3">Ambient</span>}</td>
      <td className="td text-right tabular">{kg(o.weightKg)}</td>
      <td className="td text-right tabular">{m3(o.volumeM3)}</td>
      <td className="td tabular">{o.outlet.mallWindow ?? `${o.outlet.windowOpen}–${o.outlet.windowClose}`}</td>
      <td className="td">{o.outlet.parking === 'van_only' ? <Badge tone="warn">Van only</Badge> : o.outlet.parking === 'mall_dock' ? <Badge tone="style">Mall bay</Badge> : DOCK_LABEL[o.outlet.dockType]}</td>
      <td className="td whitespace-normal min-w-[150px] max-w-[190px] text-xs">{history(o, muted)}</td>
      <td className="td">{status(o, mustServe, muted)}</td>
    </tr>
  );
}

function history(o: TOrderDto, muted?: boolean) {
  if (muted) return <span className="text-ink-3">Placed {new Date(o.placedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })} · after cutoff</span>;
  if (o.deferredYesterday) return <span className="text-bad font-semibold">Deferred last run</span>;
  if (o.daysSinceLastServed >= 2) return <span className="text-warn font-medium">{o.daysSinceLastServed} days since last delivery</span>;
  if (o.deferral) return <span className="text-ink-2">{REASON_LABEL[o.deferral.reason]} · to {shortDate(o.deferral.newDate)}</span>;
  return <span className="text-ink-3">Served {o.daysSinceLastServed <= 1 ? 'yesterday' : `${o.daysSinceLastServed} days ago`}</span>;
}

function status(o: TOrderDto, mustServe: boolean, muted?: boolean) {
  if (muted) return <Badge>Next run</Badge>;
  if (o.status === 'deferred') return <Badge tone="bad">Deferred</Badge>;
  if (o.status === 'planned') return <Badge tone="info">Planned</Badge>;
  if (['loaded', 'out_for_delivery'].includes(o.status)) return <Badge tone="info">On the road</Badge>;
  if (['delivered', 'received'].includes(o.status)) return <Badge tone="ok">Delivered</Badge>;
  if (o.status === 'failed') return <Badge tone="bad">Failed</Badge>;
  if (mustServe) return <Badge tone="bad" solid>Must serve</Badge>;
  return <Badge tone="ok">Confirmed</Badge>;
}

function exportCsv(date: string, orders: TOrderDto[]) {
  const head = ['order', 'outlet', 'brand', 'district', 'depot', 'temp', 'units', 'weight_kg', 'volume_m3', 'window', 'access', 'priority', 'deferred_last_run', 'status'];
  const lines = orders.map((o) => [o.ref, o.outlet.id, o.outlet.brand, o.outlet.district, o.outlet.depot, o.temp, o.units, o.weightKg, o.volumeM3,
    `${o.outlet.windowOpen}-${o.outlet.windowClose}`, o.outlet.parking, o.priority, o.deferredYesterday ? 1 : 0, o.status].join(','));
  const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `order-queue-${date}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
