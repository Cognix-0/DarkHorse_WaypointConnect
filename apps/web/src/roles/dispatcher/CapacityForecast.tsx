// D6 Capacity forecast: the next 14 days, demand vs fleet, planned by the same engine as the board.
import type { TForecastDayDto } from '@waypoint/shared/contract';
import { Badge, type Tone } from '../../ui/Badge';
import { Meter } from '../../ui/Meter';
import { ErrorBox, Loading } from '../../ui/States';
import { cx, num, shortDate, tonnes } from '../../ui/format';
import { useForecast } from './api';
import { PageHeader } from './PageHeader';

const RISK: Record<TForecastDayDto['risk'], { label: string; tone: Tone }> = {
  ok: { label: 'Fits', tone: 'ok' },
  tight: { label: 'Tight', tone: 'warn' },
  over: { label: 'Over capacity', tone: 'bad' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export function CapacityForecast() {
  const q = useForecast();
  if (q.isLoading) return <Loading label="Planning 21 days with the engine…" />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const open = d.days.filter((x) => x.operating);
  const atRisk = open.filter((x) => x.risk === 'over' || x.risk === 'tight');
  const peak = [...open].sort((a, b) => b.demandIndex - a.demandIndex)[0];
  const maxKg = Math.max(...open.map((x) => Math.max(x.chilledKg, x.reeferCapacityKg)), 1) * 1.1;

  return (
    <>
      <PageHeader title="Capacity forecast · next 3 weeks" sub={`${d.depot} DC · from ${shortDate(d.from)}`} />

      <section className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-5">
        <Stat label="Days over or near capacity" value={`${atRisk.length} of ${open.length}`} tone={atRisk.length ? 'bad' : 'ok'} foot={atRisk.slice(0, 4).map((x) => shortDate(x.date)).join(', ') || 'none'} />
        <Stat label="Busiest day" value={peak ? shortDate(peak.date) : '—'} foot={peak ? `demand ×${peak.demandIndex.toFixed(2)}${peak.payday ? ' · payday' : ''}${peak.festivalRamp > 0 ? ' · festival build-up' : ''}` : ''} />
        <Stat label="Most orders deferred" value={num(Math.max(0, ...open.map((x) => x.deferred)))} tone="bad" foot="on a single day if nothing changes" />
      </section>

      <section className="card p-5 mb-5" aria-labelledby="chart-h">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 id="chart-h" className="text-[15px] font-semibold">Chilled demand vs reefer space</h2>
          <span className="ml-auto flex gap-4 text-2xs text-ink-3">
            <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-chill" /> chilled demand</span>
            <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-ink" /> reefer space (one load each)</span>
          </span>
        </div>
        <div className="flex items-end gap-2 h-48 border-b border-line" role="img" aria-label="Bar chart of chilled demand by day against reefer capacity">
          {d.days.map((x) => (
            <div key={x.date} className="relative flex-1 h-full flex items-end justify-center" title={`${shortDate(x.date)}: ${tonnes(x.chilledKg)} chilled vs ${tonnes(x.reeferCapacityKg)} reefer`}>
              {x.operating ? (
                <>
                  <div className={cx('w-full max-w-[34px] rounded-t-md', x.chilledKg > x.reeferCapacityKg ? 'bg-bad' : 'bg-chill')} style={{ height: `${(x.chilledKg / maxKg) * 100}%` }} />
                  <div className="absolute left-0 right-0 border-t-2 border-ink" style={{ bottom: `${(x.reeferCapacityKg / maxKg) * 100}%` }} />
                </>
              ) : <div className="w-full max-w-[34px] h-1 bg-line rounded" />}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          {d.days.map((x) => (
            <div key={x.date} className="flex-1 text-center text-2xs text-ink-3 leading-tight">
              <div className={cx('font-semibold', x.payday ? 'text-primary' : 'text-ink-2')}>{x.dow}</div>
              <div>{x.date.slice(8)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto" aria-label="Day by day">
        <table className="w-full min-w-[960px]">
          <thead className="border-b border-line">
            <tr>{['Day', 'Calendar', 'Demand', 'Orders', 'Weight', 'Chilled vs reefer', 'Projected', 'Risk'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {d.days.map((x) => (
              <tr key={x.date} className={cx('border-b border-line last:border-0', !x.operating && 'bg-sunk text-ink-3', x.risk === 'over' && 'bg-bad-tint')}>
                <td className="td font-semibold text-ink">{shortDate(x.date)}</td>
                <td className="td">
                  <span className="flex flex-wrap gap-1">
                    {x.payday && <Badge tone="info" className="h-5 text-2xs">Payday</Badge>}
                    {x.festivalRamp > 0 && <Badge tone="style" className="h-5 text-2xs">{x.festival ?? 'Festival'} build-up {Math.round(x.festivalRamp * 100)}%</Badge>}
                    {x.holiday && <Badge className="h-5 text-2xs">Holiday</Badge>}
                    {!x.operating && <Badge className="h-5 text-2xs">Depots closed</Badge>}
                  </span>
                </td>
                <td className="td tabular">{x.operating ? `×${x.demandIndex.toFixed(2)}` : '—'}</td>
                <td className="td tabular">{x.operating ? x.orders : '—'}</td>
                <td className="td tabular">{x.operating ? tonnes(x.weightKg) : '—'}</td>
                <td className="td w-56">{x.operating ? <Meter used={x.chilledKg} cap={x.reeferCapacityKg} text={`${tonnes(x.chilledKg)} / ${tonnes(x.reeferCapacityKg)}`} /> : '—'}</td>
                <td className="td tabular">{x.operating ? <><strong className="text-ok">{x.served}</strong> served · <strong className={x.deferred ? 'text-bad' : 'text-ink-3'}>{x.deferred}</strong> deferred</> : '—'}</td>
                <td className="td"><Badge tone={RISK[x.risk].tone}>{RISK[x.risk].label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-xs text-ink-3 max-w-4xl">{d.method}</p>
    </>
  );
}

function Stat({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="card p-4 grid gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <strong className={cx('text-[24px] leading-none font-bold tabular', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</strong>
      <span className="text-xs text-ink-3">{foot}</span>
    </div>
  );
}
