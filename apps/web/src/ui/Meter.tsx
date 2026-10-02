import { cx, pct } from './format';

/** Capacity bar (weight, volume, fuel). Turns orange at 85 %, red over 100 %; `higherIsBetter` flips it (fleet availability). */
export function Meter({ label, used, cap, text, className, higherIsBetter }: { label?: string; used: number; cap: number; text?: string; className?: string; higherIsBetter?: boolean }) {
  const p = pct(used, cap);
  const tone = higherIsBetter ? (p >= 70 ? 'bg-ok-bright' : p >= 50 ? 'bg-warn-bright' : 'bg-bad') : p > 100 ? 'bg-bad' : p >= 85 ? 'bg-warn-bright' : 'bg-ok-bright';
  return (
    <div className={cx('grid gap-1', className)}>
      {(label || text) && (
        <div className="flex justify-between text-2xs text-ink-3">
          <span>{label}</span>
          <span className={cx('tabular font-medium', p > 100 ? 'text-bad' : 'text-ink-2')}>{text ?? `${p}%`}</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-line overflow-hidden" role="meter" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  );
}

/** Thin progress bar coloured by status (Live Tracking). */
export function Progress({ done, total, tone }: { done: number; total: number; tone: 'ok' | 'warn' | 'bad' | 'offline' | 'neutral' }) {
  const c = { ok: 'bg-ok-bright', warn: 'bg-warn-bright', bad: 'bg-bad', offline: 'bg-offline', neutral: 'bg-ink-4' }[tone];
  return (
    <div className="grid gap-1 w-[120px]">
      <span className="text-2xs text-ink-3">{done} of {total} stops</span>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={cx('h-full rounded-full', c)} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
