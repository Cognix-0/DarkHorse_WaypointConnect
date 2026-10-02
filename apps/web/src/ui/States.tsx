import type { ReactNode } from 'react';

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="card p-10 text-center text-[13px] text-ink-3" role="status">{label}</div>
);
export const ErrorBox = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div className="card p-6 border-bad/40 bg-bad-tint text-[13px]" role="alert">
    <strong className="text-bad">Couldn't load this screen.</strong> <span className="text-ink-2">{(error as Error)?.message}</span>
    {onRetry && <button className="btn-secondary btn-sm ml-3" onClick={onRetry}>Try again</button>}
  </div>
);
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="card p-10 text-center grid gap-2 justify-items-center">
    <strong className="text-[15px]">{title}</strong>
    <div className="text-[13px] text-ink-3 max-w-md">{children}</div>
  </div>
);
