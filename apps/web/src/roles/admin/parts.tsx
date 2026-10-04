// Small pieces shared by the admin screens.
import type { ReactNode } from 'react';

/** Page header for admin screens: title on the left, actions on the right. */
export function AdminHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 mb-5">
      <div className="grid gap-0.5 mr-auto">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
        {sub && <p className="text-[13px] text-ink-3">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

/** Shows a new password once, with a copy button. */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  return (
    <div className="grid gap-2">
      <p>Give this to the person privately. It is shown <strong>only now</strong>; nobody can look it up later (you can reset it again).</p>
      <div className="rounded-lg border border-line bg-sunk px-3 py-2 grid gap-1">
        <span className="text-2xs text-ink-3">{email}</span>
        <code className="font-mono text-[17px] font-semibold text-ink tracking-wide select-all">{password}</code>
      </div>
      <button className="btn-secondary btn-sm justify-self-start" onClick={() => void navigator.clipboard?.writeText(`${email}\n${password}`)}>Copy email and password</button>
    </div>
  );
}
