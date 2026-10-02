import type { ReactNode } from 'react';

/** Page header used by every dispatcher screen: title on the left, actions or status pills on the right. */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
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
