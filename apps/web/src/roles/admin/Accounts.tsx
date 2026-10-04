// Accounts: who can sign in. Switch access on or off, reset a password (shown once), add staff accounts.
import { useMemo, useState, type FormEvent } from 'react';
import type { TAccountPasswordResponse, TAdminAccountDto, TCreateAccountRequest } from '@waypoint/shared/contract';
import { getSession } from '../../api';
import { Badge, type Tone } from '../../ui/Badge';
import { Modal } from '../../ui/Modal';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx } from '../../ui/format';
import { useAccounts, useCreateAccount, useResetPassword, useSetActive } from './api';
import { AdminHeader, PasswordReveal } from './parts';

type Role = TAdminAccountDto['role'];
const ROLE: Record<Role, { label: string; tone: Tone }> = {
  admin: { label: 'Admin', tone: 'style' },
  dispatcher: { label: 'Dispatcher', tone: 'info' },
  loader: { label: 'Loader', tone: 'warn' },
  driver: { label: 'Vehicle', tone: 'chill' },
  store: { label: 'Store', tone: 'fresh' },
};

const lastSeen = (iso: string | null) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' });
};

export function Accounts() {
  const q = useAccounts();
  const setActive = useSetActive();
  const toast = useToast();
  const me = getSession()?.user.id;
  const [role, setRole] = useState<Role | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all');
  const [search, setSearch] = useState('');
  const [reset, setReset] = useState<TAdminAccountDto | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.accounts ?? []).filter((a) =>
      (role === 'all' || a.role === role) && (status === 'all' || (status === 'on') === a.active)
      && (!s || [a.name, a.email, a.vehicleId, a.outletId, a.depot].some((x) => x?.toLowerCase().includes(s))));
  }, [q.data, role, status, search]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const total = q.data.accounts.length;
  const off = q.data.accounts.filter((a) => !a.active).length;

  async function toggle(a: TAdminAccountDto) {
    try {
      await setActive.mutateAsync({ id: a.id, active: !a.active });
      toast({ tone: a.active ? 'info' : 'ok', title: a.active ? `${a.email} switched off` : `${a.email} switched on`, body: a.active ? 'They are signed out at their next action and cannot sign in.' : 'They can sign in again.' });
    } catch (e) {
      toast({ tone: 'bad', title: (e as Error).message });
    }
  }

  return (
    <>
      <AdminHeader title="Accounts" sub={`${total} accounts · ${off} switched off`}>
        <button className="btn-primary" onClick={() => setCreating(true)}>New staff account</button>
      </AdminHeader>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className={cx('chip', role === 'all' && 'chip-on')} onClick={() => setRole('all')}>All</button>
        {q.data.counts.filter((c) => c.total > 0).map((c) => (
          <button key={c.role} className={cx('chip', role === c.role && 'chip-on')} onClick={() => setRole(c.role)}>{ROLE[c.role].label} · {c.total}</button>
        ))}
        <span className="w-px h-5 bg-line mx-1" aria-hidden="true" />
        {(['all', 'on', 'off'] as const).map((s) => (
          <button key={s} className={cx('chip', status === s && 'chip-on')} onClick={() => setStatus(s)}>{s === 'all' ? 'Any status' : s === 'on' ? 'On' : 'Switched off'}</button>
        ))}
        <input className="input ml-auto w-full sm:w-72" placeholder="Search name, email, VEH024, OUT026" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search accounts" />
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-sunk border-b border-line"><tr>
              <th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Linked to</th><th className="th">Last sign-in</th><th className="th">Access</th><th className="th" />
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={cx('border-b border-line last:border-0', !a.active && 'bg-sunk')}>
                  <td className="td font-semibold text-ink">{a.name}{a.id === me && <span className="text-ink-3 font-normal"> (you)</span>}</td>
                  <td className="td">{a.email}</td>
                  <td className="td"><Badge tone={ROLE[a.role].tone}>{ROLE[a.role].label}</Badge></td>
                  <td className="td">{a.vehicleId ?? a.outletId ?? a.depot ?? <span className="text-ink-3">{a.role === 'dispatcher' ? 'Both depots' : 'everything'}</span>}</td>
                  <td className="td tabular text-ink-3">{lastSeen(a.lastLoginAt)}</td>
                  <td className="td">
                    <button role="switch" aria-checked={a.active} aria-label={`Access for ${a.email}`} disabled={setActive.isPending || a.id === me}
                      onClick={() => toggle(a)}
                      className={cx('inline-flex items-center gap-2 h-7 pl-1 pr-2.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50',
                        a.active ? 'bg-ok-soft border-ok/30 text-ok' : 'bg-bad-soft border-bad/30 text-bad')}>
                      <span className={cx('h-5 w-5 rounded-full', a.active ? 'bg-ok' : 'bg-bad')} />
                      {a.active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="td text-right">
                    <button className="btn-secondary btn-sm" onClick={() => setReset(a)}>Reset password</button>
                    {a.customPassword && <span className="block text-2xs text-ink-3 mt-1">set by admin</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-ink-3" colSpan={7}>No accounts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {reset && <ResetPassword account={reset} onClose={() => setReset(null)} />}
      {creating && <CreateAccount onClose={() => setCreating(false)} />}
    </>
  );
}

function ResetPassword({ account, onClose }: { account: TAdminAccountDto; onClose: () => void }) {
  const reset = useResetPassword();
  const [result, setResult] = useState<TAccountPasswordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    try { setResult(await reset.mutateAsync(account.id)); } catch (e) { setError((e as Error).message); }
  }
  return (
    <Modal title={result ? 'New password' : 'Reset password?'} onClose={onClose}
      footer={result ? <button className="btn-primary" onClick={onClose}>Done</button> : <>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={reset.isPending} onClick={go}>{reset.isPending ? 'Resetting…' : 'Reset password'}</button>
      </>}>
      {result ? <PasswordReveal email={result.account.email} password={result.password} /> : (
        <p><strong className="text-ink">{account.name}</strong> ({account.email}) gets a new password. The old one stops working at once; a phone that is already signed in stays signed in until it signs out.</p>
      )}
      {error && <p className="text-bad" role="alert">{error}</p>}
    </Modal>
  );
}

function CreateAccount({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount();
  const [form, setForm] = useState<TCreateAccountRequest>({ name: '', email: '', role: 'loader', depot: 'Peliyagoda' });
  const [result, setResult] = useState<TAccountPasswordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<TCreateAccountRequest>) => setForm((f) => ({ ...f, ...p }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { setResult(await create.mutateAsync({ ...form, depot: form.role === 'admin' ? null : form.depot })); } catch (err) { setError((err as Error).message); }
  }
  if (result) {
    return (
      <Modal title="Account created" onClose={onClose} footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
        <p><strong className="text-ink">{result.account.name}</strong> can sign in now.</p>
        <PasswordReveal email={result.account.email} password={result.password} />
      </Modal>
    );
  }
  return (
    <Modal title="New staff account" onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <p className="text-ink-3">Vehicles and stores already have one account each. Add dispatchers, loaders or administrators here.</p>
        <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Full name</span>
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} required minLength={2} autoFocus /></label>
        <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Email (their sign-in)</span>
          <input className="input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="loader4.peliyagoda@waypoint.lk" required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Role</span>
            <select className="input" value={form.role} onChange={(e) => {
              const r = e.target.value as TCreateAccountRequest['role'];
              set({ role: r, depot: r === 'loader' && !form.depot ? 'Peliyagoda' : form.depot });
            }}>
              <option value="loader">Loader</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="admin">Administrator</option>
            </select></label>
          <label className="grid gap-1"><span className="text-xs font-semibold text-ink">Depot</span>
            <select className="input" value={form.role === 'admin' ? '' : form.depot ?? ''} disabled={form.role === 'admin'}
              onChange={(e) => set({ depot: (e.target.value || null) as 'Peliyagoda' | 'Kandy' | null })}>
              {form.role !== 'loader' && <option value="">{form.role === 'admin' ? 'All (admin)' : 'Both depots (can switch)'}</option>}
              <option value="Peliyagoda">Peliyagoda</option>
              <option value="Kandy">Kandy</option>
            </select></label>
        </div>
        {error && <p className="text-bad text-[13px]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}
