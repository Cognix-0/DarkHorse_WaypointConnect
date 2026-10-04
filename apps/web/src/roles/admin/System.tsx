// System: is everything running, which day and time every screen is on, and today's state per depot.
import { Link } from 'react-router-dom';
import { Badge } from '../../ui/Badge';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, num, shortDate } from '../../ui/format';
import { useRebuildToday, useSystem } from './api';
import { AdminHeader } from './parts';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrators', dispatcher: 'Dispatchers', loader: 'Loaders', driver: 'Vehicles (drivers)', store: 'Store managers' };

const uptime = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86_400 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.floor(s / 86_400)} days`);

export function System() {
  const q = useSystem();
  const rebuild = useRebuildToday();
  const toast = useToast();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  async function onRebuild() {
    try {
      const r = await rebuild.mutateAsync();
      toast({ tone: 'ok', title: r.created ? `Built ${shortDate(r.date)}: ${r.orders} orders` : `${shortDate(r.date)} already has its orders (${r.orders})` });
    } catch (e) {
      toast({ tone: 'bad', title: (e as Error).message });
    }
  }

  return (
    <>
      <AdminHeader title="System" sub={`Dispatcher, loaders and drivers are on the ${shortDate(d.date)} run · ${d.clock} ${d.timeZone}`}>
        {d.database.ok ? <Badge tone="ok">All systems running</Badge> : <Badge tone="bad">Database not reachable</Badge>}
      </AdminHeader>

      <section className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-5" aria-label="Health">
        <Tile label="Working run" value={shortDate(d.date)} foot={d.pinnedDate ? 'Pinned by DEMO_DATE (does not follow the calendar)' : "Today's run until the 16:00 cutoff, then the next run"} tone={d.pinnedDate ? 'warn' : undefined} />
        <Tile label="Clock (all roles)" value={d.clock} foot={d.timeZone} />
        <Tile label="Database" value={d.database.ok ? 'Connected' : 'Down'} foot={`answered in ${d.database.latencyMs} ms`} tone={d.database.ok ? 'ok' : 'bad'} />
        <Tile label="API server" value="Running" foot={`up ${uptime(d.uptimeSec)}`} tone="ok" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden" aria-labelledby="depots-h">
          <h2 id="depots-h" className="text-[15px] font-semibold px-5 pt-4 pb-3">Today per depot</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sunk border-y border-line"><tr>
                <th className="th">Depot</th><th className="th">Orders today</th><th className="th">Plan</th><th className="th">Vehicles</th><th className="th">Without a driver</th>
              </tr></thead>
              <tbody>
                {d.depots.map((x) => (
                  <tr key={x.depot} className="border-b border-line last:border-0">
                    <td className="td font-semibold text-ink">{x.depot}</td>
                    <td className="td tabular">{num(x.ordersToday)}</td>
                    <td className="td">
                      {x.planStatus === 'published' ? <Badge tone="ok">v{x.planVersion} published</Badge>
                        : x.planStatus === 'draft' ? <Badge tone="warn">Draft</Badge> : <Badge>Not planned yet</Badge>}
                    </td>
                    <td className="td tabular">{x.vehicles}</td>
                    <td className="td">{x.vehiclesWithoutDriver ? <Link to="/admin/fleet" className="text-bad font-semibold hover:underline">{x.vehiclesWithoutDriver} · assign</Link> : <span className="text-ok">All assigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-line flex flex-wrap items-center gap-3 text-[13px] text-ink-3">
            <span className="mr-auto">Today's orders are built automatically after midnight. If a day is empty (for example after the database was cleared), build it here. It never adds duplicates.</span>
            <button className="btn-secondary" disabled={rebuild.isPending} onClick={onRebuild}>{rebuild.isPending ? 'Building…' : "Build today's orders"}</button>
          </div>
        </section>

        <section className="card p-5 grid gap-4 content-start" aria-labelledby="acc-h">
          <div className="flex items-center">
            <h2 id="acc-h" className="text-[15px] font-semibold">Accounts</h2>
            <Link to="/admin/accounts" className="ml-auto text-[13px] font-semibold text-primary hover:underline">Manage</Link>
          </div>
          <ul className="grid gap-2 text-[13px]">
            {d.accounts.map((a) => (
              <li key={a.role} className="flex items-center gap-3">
                <span className="text-ink-2">{ROLE_LABEL[a.role] ?? a.role}</span>
                <span className="ml-auto tabular font-semibold text-ink">{a.active}</span>
                <span className="tabular text-ink-3 w-24 text-right">{a.total - a.active ? `${a.total - a.active} switched off` : 'all on'}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line pt-3 flex items-center gap-3 text-[13px]">
            <span className="text-ink-2">Drivers</span>
            <span className="ml-auto text-ink-3">{d.drivers.assigned} on vehicles · {d.drivers.spare} spare</span>
            <Link to="/admin/fleet" className="font-semibold text-primary hover:underline">Assign</Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="card p-4 grid gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <strong className={cx('text-[22px] leading-tight font-bold tabular', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</strong>
      <span className={cx('text-xs', tone === 'ok' ? 'text-ok' : 'text-ink-3')}>{foot}</span>
    </div>
  );
}
