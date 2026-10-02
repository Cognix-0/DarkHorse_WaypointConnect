import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TLoginResponse } from '@waypoint/shared/contract';
import { api, setSession } from './api';

const DEMO = ['dispatcher', 'loader', 'driver', 'store'] as const;

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('dispatcher@waypoint.demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api<TLoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setSession(res);
      nav(`/${res.user.role}`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm card p-6 grid gap-4">
        <div className="flex items-center gap-3">
          <img src="/logo-mark.png" alt="" className="w-10" />
          <div className="grid leading-tight"><strong className="text-[15px]">Waypoint Connect</strong><span className="text-xs text-ink-3">Distribution planning</span></div>
        </div>
        <h1 className="text-xl font-bold">Sign in</h1>
        <label className="grid gap-1 text-sm font-semibold">Email
          <input className="h-12 px-3 border border-line-strong rounded-lg font-normal text-base" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Password
          <input className="h-12 px-3 border border-line-strong rounded-lg font-normal text-base" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="text-bad text-sm font-semibold">{error}</p>}
        <button disabled={busy} className="h-12 rounded-lg bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/get-app" className="text-sm font-semibold text-primary justify-self-center">Get the mobile app</Link>
        <p className="text-xs text-ink-3">Demo accounts: {DEMO.map((r) => `${r}@waypoint.demo`).join(', ')}</p>
      </form>
    </main>
  );
}
