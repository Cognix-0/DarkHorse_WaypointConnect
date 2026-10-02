// D1 Overview: today's numbers, demand by brand, depots, and what needs the dispatcher's attention.
import { Link } from 'react-router-dom';
import type { TAttentionItem } from '@waypoint/shared/contract';
import { Badge, brandTone } from '../../ui/Badge';
import { Meter } from '../../ui/Meter';
import { ErrorBox, Loading } from '../../ui/States';
import { cx, num, pct, shortDate, tonnes, unitLabel } from '../../ui/format';
import { useOverview } from './api';
import { PageHeader } from './PageHeader';

export function Overview() {
  const q = useOverview();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const k = d.kpis;
  const reeferShort = k.chilledDemandKg > k.reeferCapacityKg;
  const status = d.planStatus === 'published' ? <Badge tone="ok">Plan v{d.planVersion} published</Badge>
    : d.planStatus === 'draft' ? <Badge tone="warn">Draft plan · not published</Badge> : <Badge tone="neutral">No plan yet</Badge>;

  return (
    <>
      <PageHeader title={`Overview · ${shortDate(d.date)}`} sub={`${d.depot} DC · orders locked at 16:00 yesterday`}>
        {status}
        <Link to={d.planStatus === 'none' ? '/dispatcher/queue' : '/dispatcher/board'} className="btn-primary">
          {d.planStatus === 'none' ? 'Review order queue' : 'Open planning board'}
        </Link>
      </PageHeader>

      <section className="grid gap-4 grid-cols-2 xl:grid-cols-5 mb-5" aria-label="Today in numbers">
        <Kpi label="Orders locked" value={num(k.ordersLocked)} foot={`${k.chilled} chilled · ${k.afterCutoff} after cutoff`} />
        <Kpi label="Planned" value={num(k.planned)} foot={`on ${k.trips} trips · ${k.vehiclesUsed} vehicles`} tone={k.planned ? 'ok' : undefined} />
        <Kpi label="Deferred" value={num(k.deferred)} foot={`${k.skippedLastRun} shops skipped last run`} tone={k.deferred ? 'bad' : undefined} />
        <Kpi label="Vehicles available" value={`${k.vehiclesAvailable} / ${k.vehiclesTotal}`} foot={`${k.vehiclesTotal - k.vehiclesAvailable} in the workshop`} />
        <div className="card p-4 col-span-2 xl:col-span-1 grid gap-2">
          <span className="text-xs font-medium text-ink-3">Reefer space</span>
          <strong className={cx('text-[26px] leading-none font-bold tabular', reeferShort ? 'text-bad' : 'text-ink')}>{tonnes(k.chilledDemandKg)}</strong>
          <Meter used={k.chilledDemandKg} cap={k.reeferCapacityKg} text={`of ${tonnes(k.reeferCapacityKg)} · ${pct(k.chilledDemandKg, k.reeferCapacityKg)}%`} />
          <span className="text-xs text-ink-3">chilled demand vs one load per reefer</span>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-5" aria-labelledby="brand-h">
          <div className="flex items-center mb-4">
            <h2 id="brand-h" className="text-[15px] font-semibold">Demand by brand</h2>
            <span className="ml-auto flex gap-3 text-2xs text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ok-bright" /> planned</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-bad" /> deferred</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-line" /> not planned</span>
            </span>
          </div>
          <div className="grid gap-5">
            {d.brandDemand.map((b) => (
              <div key={b.brand} className="grid gap-2">
                <div className="flex items-baseline gap-3 text-[13px]">
                  <Badge tone={brandTone(b.brand)}>{b.brand}</Badge>
                  <span className="text-ink font-semibold tabular">{b.orders} orders</span>
                  <span className="text-ink-3 tabular">{num(b.units)} {unitLabel(b.brand)} · {tonnes(b.weightKg)}</span>
                  <span className="ml-auto text-ink-3 tabular">{b.planned} planned · {b.deferred} deferred</span>
                </div>
                <div className="flex h-2.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
                  <div className="bg-ok-bright" style={{ width: `${pct(b.planned, b.orders)}%` }} />
                  <div className="bg-bad" style={{ width: `${pct(b.deferred, b.orders)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5" aria-labelledby="att-h">
          <div className="flex items-center mb-3">
            <h2 id="att-h" className="text-[15px] font-semibold">Needs your attention</h2>
            {d.attention.length > 0 && <Badge tone="bad" className="ml-auto">{d.attention.filter((a) => a.severity === 'high').length} urgent</Badge>}
          </div>
          {d.attention.length === 0 ? <p className="text-[13px] text-ink-3">All clear. Nothing is waiting on you.</p> : (
            <ul className="grid gap-2">
              {d.attention.map((a, i) => <Attention key={i} a={a} />)}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Depots">
        {d.depots.map((dp) => (
          <div key={dp.depot} className="card p-5 grid gap-3">
            <div className="flex items-center">
              <h2 className="text-[15px] font-semibold">{dp.depot} DC</h2>
              <span className="ml-auto">{dp.planStatus === 'published' ? <Badge tone="ok">Published</Badge> : dp.planStatus === 'draft' ? <Badge tone="warn">Draft</Badge> : <Badge>No plan</Badge>}</span>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div><dt className="text-ink-3 text-xs">Orders</dt><dd className="text-lg font-bold tabular">{dp.orders}</dd></div>
              <div><dt className="text-ink-3 text-xs">Vehicles</dt><dd className="text-lg font-bold tabular">{dp.vehiclesAvailable}<span className="text-ink-3 text-sm font-medium"> / {dp.vehiclesTotal}</span></dd></div>
              <div><dt className="text-ink-3 text-xs">Reefers ready</dt><dd className="text-lg font-bold tabular">{dp.reefersAvailable}</dd></div>
            </dl>
            <Meter label="Fleet available" used={dp.vehiclesAvailable} cap={dp.vehiclesTotal} text={`${pct(dp.vehiclesAvailable, dp.vehiclesTotal)}%`} higherIsBetter />
          </div>
        ))}
      </section>
    </>
  );
}

function Kpi({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="card p-4 grid gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <strong className={cx('text-[26px] leading-none font-bold tabular', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</strong>
      <span className="text-xs text-ink-3">{foot}</span>
    </div>
  );
}

function Attention({ a }: { a: TAttentionItem }) {
  const bar = a.severity === 'high' ? 'border-bad bg-bad-tint' : a.severity === 'medium' ? 'border-warn bg-warn-tint' : 'border-line-strong bg-sunk';
  return (
    <li>
      <Link to={a.link} className={cx('block rounded-lg border-l-4 px-3 py-2.5 hover:brightness-[0.98]', bar)}>
        <strong className="block text-[13px] text-ink">{a.title}</strong>
        <span className="block text-xs text-ink-2 mt-0.5">{a.detail}</span>
      </Link>
    </li>
  );
}
