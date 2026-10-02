import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
      <form onSubmit={submit} className="w-full max-w-sm bg-surface border border-line rounded-lg p-6 grid gap-4">
        <h1 className="font-display text-2xl font-bold">Sign in to Waypoint Connect</h1>
        <label className="grid gap-1 text-sm font-semibold">Email
          <input className="h-12 px-3 border border-line-strong rounded-md font-normal text-base" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Password
          <input className="h-12 px-3 border border-line-strong rounded-md font-normal text-base" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="text-bad text-sm font-semibold">{error}</p>}
        <button disabled={busy} className="h-12 rounded-md bg-brand-navy text-white font-semibold hover:bg-brand-navy-hover disabled:bg-sunk disabled:text-ink-3">{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-xs text-ink-3">Demo accounts: {DEMO.map((r) => `${r}@waypoint.demo`).join(', ')}</p>
      </form>
    </main>
  );
}
