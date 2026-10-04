import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TLoginResponse } from '@waypoint/shared/contract';
import { api, setSession } from './api';
import { Modal } from './ui/Modal';

const FLOW_STEPS = [
  { label: 'Order', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h.01M15 12h.01M9 16h.01M15 16h.01M4 4h16v16H4z" /></svg> },
  { label: 'Plan', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg> },
  { label: 'Load', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14M5 12h9M5 16h6M3 4h18v16H3z" /></svg> },
  { label: 'Deliver', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg> },
];

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keepSigned, setKeepSigned] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotModal, setForgotModal] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<TLoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(res);
      nav(`/${res.user.role}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex lg:w-[46%] xl:w-[42%] flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0F1A3E 0%, #1a2d6b 55%, #152258 100%)' }}
      >
        {/* Background decorative circles */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #4B6EF5, transparent)' }} />
        <div className="absolute bottom-20 -right-16 w-56 h-56 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #38BDF8, transparent)' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg ring-2 ring-white/20 bg-white flex items-center justify-center p-1">
            <img src="/logo-mark.png" alt="Waypoint logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-white font-extrabold text-xl tracking-tight leading-none">Waypoint</span>
            <span className="text-[#8FA0C8] text-xs leading-tight">Waypoint Group · Delivery Operations</span>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-6">
          <h2 className="text-white text-3xl xl:text-4xl font-bold leading-snug">
            One platform from{' '}
            <span style={{ color: '#60A5FA' }}>order</span>{' '}
            to{' '}
            <span style={{ color: '#60A5FA' }}>delivery</span>.
          </h2>
          <p className="text-[#94A3B8] text-sm xl:text-base leading-relaxed">
            Plan, load, deliver and confirm across all of Waypoint's outlets, with every decision checked, explained and shared with the right people.
          </p>

          {/* Flow steps */}
          <div className="flex items-center gap-3 pt-2">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[#94A3B8]" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    {step.icon}
                  </div>
                  <span className="text-[#94A3B8] text-[11px]">{step.label}</span>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(4)].map((_, d) => (
                      <div key={d} className="w-2 h-0.5 rounded-full" style={{ background: '#3A4E8A' }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-8 pt-2">
            {[
              { value: '120', label: 'outlets' },
              { value: '60', label: 'vehicles' },
              { value: '2', label: 'depots · Peliyagoda & Kandy' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-white text-2xl font-bold">{s.value}</div>
                <div className="text-[#8FA0C8] text-xs">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-[#64748B] text-[11px]">
          © 2026 Waypoint Group (Pvt) Ltd · Internal system
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Top bar */}
        <div className="flex justify-end px-8 pt-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ok-bright">
            <span className="w-2 h-2 rounded-full bg-ok-online inline-block" />
            All systems operational
          </span>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-md space-y-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl overflow-hidden shadow-sm border border-line bg-surface flex items-center justify-center p-1">
                <img src="/logo-mark.png" alt="Waypoint logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-ink font-extrabold text-lg tracking-tight leading-none">Waypoint</span>
                <span className="text-ink-3 text-xs leading-tight font-medium mt-0.5">Delivery Operations</span>
              </div>
            </div>

            {/* Heading */}
            <div>
              <h1 className="text-2xl font-bold text-ink">Sign in</h1>
              <p className="text-sm text-ink-3 mt-1">Welcome back. Enter your employee ID or email to sign in.</p>
            </div>

            <form onSubmit={submit} className="space-y-5">

              {/* Email */}
              <div className="space-y-1">
                <label className="text-sm font-semibold text-ink" htmlFor="login-email">
                  Employee ID or email
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                    </svg>
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 pl-9 pr-4 border border-line-strong rounded-xl text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition"
                    placeholder="name@waypoint.lk"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-sm font-semibold text-ink" htmlFor="login-password">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 pl-9 pr-10 border border-line-strong rounded-xl text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition"
                    placeholder="••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2 transition"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Keep signed in + forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepSigned}
                    onChange={(e) => setKeepSigned(e.target.checked)}
                    className="w-4 h-4 rounded border-line-strong accent-primary"
                  />
                  Keep me signed in on this device
                </label>
                <button
                  type="button"
                  onClick={() => setForgotModal(true)}
                  className="text-sm font-semibold text-primary hover:text-primary-hover transition"
                >
                  Forgot password?
                </button>
              </div>

              {/* Error */}
              {error && (
                <p role="alert" className="text-sm font-semibold text-bad bg-bad-tint border border-bad-soft rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>Sign in →</>
                )}
              </button>

            </form>

            {/* Footer */}
            <p className="text-center text-xs text-ink-4">
              Authorised Waypoint staff only · Need access?{' '}
              <Link to="/get-app" className="text-primary hover:underline">Get the mobile app</Link>
              {' '}or contact your depot supervisor.
            </p>
          </div>
        </div>
      </div>

      {forgotModal && (
        <ForgotPasswordModal initialEmail={email} onClose={() => setForgotModal(false)} />
      )}
    </div>
  );
}

const COMMON_PROBLEMS = [
  'Forgot my password - please reset access',
  'Locked out / account switched off - need access enabled',
  'Phone reset or new device - cannot sign in',
  'Credentials not recognized - need password reset',
  'Driver or vehicle account issue',
  'Other problem',
];

function ForgotPasswordModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [selectedProblem, setSelectedProblem] = useState(COMMON_PROBLEMS[0]);
  const [customNote, setCustomNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const finalIssue = selectedProblem === 'Other problem'
      ? (customNote.trim() || 'Other problem')
      : (customNote.trim() ? `${selectedProblem} (${customNote.trim()})` : selectedProblem);
    try {
      await api<{ ok: boolean; message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: emailInput, issue: finalIssue }),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Forgot Password / Support Request" onClose={onClose}>
      {done ? (
        <div className="space-y-4 py-2">
          <div className="p-3 bg-ok-soft text-ok border border-ok/30 rounded-xl text-sm font-medium">
            Your issue message has been sent to the Admin console dashboard! Your administrator will review it and assist you shortly.
          </div>
          <button onClick={onClose} className="btn-primary w-full h-10">Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-ink-3">
            Select the problem you are experiencing or enter your employee ID. A support message will be sent directly to the Admin console dashboard.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink">Employee ID or email</label>
            <input
              type="text"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="e.g. driver@waypoint.lk or veh024"
              className="input w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink">Select common problem</label>
            <select
              value={selectedProblem}
              onChange={(e) => setSelectedProblem(e.target.value)}
              className="input w-full font-medium"
            >
              {COMMON_PROBLEMS.map((prob) => (
                <option key={prob} value={prob}>{prob}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink">Additional note (optional)</label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Needs reset for Colombo depot shift"
              className="input w-full text-xs"
            />
          </div>

          {error && <p className="text-xs text-bad font-medium">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Sending…' : 'Send Message to Admin'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
