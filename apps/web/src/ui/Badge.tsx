import type { ReactNode } from 'react';
import { cx } from './format';

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad' | 'offline' | 'chill' | 'fresh' | 'style' | 'tech';

const SOFT: Record<Tone, string> = {
  neutral: 'bg-offline-tint text-ink-2',
  info: 'bg-primary-tint text-primary',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  offline: 'bg-offline text-white',
  chill: 'bg-chill-soft text-chill',
  fresh: 'bg-fresh-soft text-fresh',
  style: 'bg-style-soft text-style',
  tech: 'bg-tech-soft text-tech',
};
const SOLID: Partial<Record<Tone, string>> = {
  bad: 'bg-bad text-white', warn: 'bg-warn-bright text-white', ok: 'bg-ok text-white', offline: 'bg-offline text-white', info: 'bg-primary text-white',
};

/** Status pill. `solid` is used for alert labels (LATE, LOADER FLAG, OFFLINE, POD). */
export function Badge({ tone = 'neutral', solid, children, className }: { tone?: Tone; solid?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-semibold whitespace-nowrap', solid ? SOLID[tone] ?? SOFT[tone] : SOFT[tone], solid && 'h-5 text-2xs uppercase tracking-wide px-2', className)}>
      {children}
    </span>
  );
}

export const brandTone = (b: string): Tone => (b === 'Fresh' ? 'fresh' : b === 'Style' ? 'style' : 'tech');
