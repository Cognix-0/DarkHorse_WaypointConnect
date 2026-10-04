// Vehicles & drivers: put one driver on each vehicle. A driver is never on two vehicles; moving one asks first.
import { useMemo, useState, type FormEvent } from 'react';
import type { TAdminVehicleDto, TDriverDto } from '@waypoint/shared/contract';
import { Badge } from '../../ui/Badge';
import { Modal } from '../../ui/Modal';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useAssignDriver, useCreateDriver, useFleet } from './api';
import { AdminHeader } from './parts';

type Depot = 'all' | 'Peliyagoda' | 'Kandy';
type Move = { vehicle: TAdminVehicleDto; driver: TDriverDto };

export function Fleet() {
  const q = useFleet();
  const assign = useAssignDriver();
  const toast = useToast();
  const [depot, setDepot] = useState<Depot>('all');
  const [search, setSearch] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [move, setMove] = useState<Move | null>(null);
  const [adding, setAdding] = useState(false);

  const vehicles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.vehicles ?? []).filter((v) =>
      (depot === 'all' || v.depot === depot) && (!onlyEmpty || !v.driver)
      && (!s || v.id.toLowerCase().includes(s) || v.driver?.name.toLowerCase().includes(s)));
  }, [q.data, depot, search, onlyEmpty]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { drivers } = q.data;
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const spare = drivers.filter((d) => !d.vehicleId);
  const empty = q.data.vehicles.filter((v) => !v.driver).length;

  async function put(vehicle: TAdminVehicleDto, driverId: string | null, moveIt = false) {
    try {
      await assign.mutateAsync({ vehicleId: vehicle.id, driverId, move: moveIt });
      const name = driverId ? byId.get(driverId)?.name : null;
      toast({ tone: 'ok', title: name ? `${name} now drives ${vehicle.id}` : `${vehicle.id} has no driver now`, body: name ? `They sign in on the phone as ${vehicle.accountEmail}.` : undefined });
    } catch (e) {
      toast({ tone: 'bad', title: (e as Error).message });
    }
  }

  function choose(vehicle: TAdminVehicleDto, driverId: string) {
    if (!driverId) return void put(vehicle, null);
    const driver = byId.get(driverId)!;
    if (driver.vehicleId && driver.vehicleId !== vehicle.id) setMove({ vehicle, driver });
    else void put(vehicle, driverId);
  }

  return (
    <>
      <AdminHeader title="Vehicles & drivers" sub={`${q.data.vehicles.length} vehicles · ${drivers.length} drivers · ${spare.length} spare`}>
        {empty > 0 && <Badge tone="bad">{empty} without a driver</Badge>}
        <button className="btn-primary" onClick={() => setAdding(true)}>Add driver</button>
      </AdminHeader>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'Peliyagoda', 'Kandy'] as const).map((d) => (
          <button key={d} className={cx('chip', depot === d && 'chip-on')} onClick={() => setDepot(d)}>{d === 'all' ? 'Both depots' : d}</button>
        ))}
        <button className={cx('chip', onlyEmpty && 'chip-on')} onClick={() => setOnlyEmpty((x) => !x)}>Without a driver</button>
        <input className="input ml-auto w-full sm:w-64" placeholder="Search vehicle or driver" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vehicle or driver" />
      </div>

      <section className="card overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-sunk border-b border-line"><tr>
              <th className="th">Vehicle</th><th className="th">Type</th><th className="th">Depot</th><th className="th">Driver</th><th className="th">Phone sign-in</th>
            </tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className="td font-semibold text-ink">{v.id}</td>
                  <td className="td">
                    <span className="capitalize">{v.type}</span>{' '}
                    {v.temp === 'reefer' ? <Badge tone="chill">Reefer</Badge> : <span className="text-ink-3">dry</span>}
                    <span className="text-ink-3"> · {(v.weightCapKg / 1000).toFixed(1)} t</span>
                  </td>
                  <td className="td">{v.depot}</td>
                  <td className="td">
                    <select className={cx('input w-60', !v.driver && 'border-bad text-bad')} value={v.driver?.id ?? ''} disabled={assign.isPending}
                      onChange={(e) => choose(v, e.target.value)} aria-label={`Driver for ${v.id}`}>
                      <option value="">No driver</option>
                      {spare.length > 0 && (
                        <optgroup label="Spare drivers">
                          {spare.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="On a vehicle (moves them)">
                        {drivers.filter((d) => d.vehicleId).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}{d.vehicleId === v.id ? '' : ` · ${d.vehicleId}`}</option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="td">
                    <span className="text-ink-2">{v.accountEmail}</span>{' '}
                    {!v.accountActive && <Badge tone="bad">switched off</Badge>}
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && <tr><td className="td text-ink-3" colSpan={5}>No vehicles match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="spare-h">
        <h2 id="spare-h" className="text-[15px] font-semibold mb-3">Spare drivers</h2>
        {spare.length === 0 ? <p className="text-[13px] text-ink-3">Every driver is on a vehicle. Add a driver to have someone to swap in.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-[13px]">
            {spare.map((d) => (
              <li key={d.id} className="rounded-lg border border-line px-3 py-2 grid">
                <strong className="text-ink">{d.name}</strong>
                <span className="text-ink-3">{d.id}{d.phone ? ` · ${d.phone}` : ''}{d.licenseNo ? ` · licence ${d.licenseNo}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {move && (
        <Modal title="Move this driver?" onClose={() => setMove(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setMove(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => { void put(move.vehicle, move.driver.id, true); setMove(null); }}>Move to {move.vehicle.id}</button>
          </>}>
          <p><strong className="text-ink">{move.driver.name}</strong> drives <strong className="text-ink">{move.driver.vehicleId}</strong> now. A driver can only be on one vehicle, so moving them leaves {move.driver.vehicleId} without a driver until you assign someone else.</p>
        </Modal>
      )}
      {adding && <AddDriver onClose={() => setAdding(false)} />}
    </>
  );
}

function AddDriver({ onClose }: { onClose: () => void }) {
  const create = useCreateDriver();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const d = await create.mutateAsync({ name, phone: phone || undefined, licenseNo: licenseNo || undefined });
      toast({ tone: 'ok', title: `${d.name} added as ${d.id}`, body: 'Pick them on a vehicle to assign them.' });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal title="Add driver" onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Full name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus /></label>
        <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Phone (optional)</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 123 4567" /></label>
        <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Driving licence number (optional)</span>
          <input className="input" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} /></label>
        {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add driver'}</button>
        </div>
      </form>
    </Modal>
  );
}
