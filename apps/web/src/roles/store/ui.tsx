// Store manager building blocks: status pills, cards and buttons in the SM/D-SM style.
import type { ReactNode } from 'react';
import type { TStoreOrderCard } from '@waypoint/shared/contract';
import { cx } from '../../ui/format';

export const STAGE_TONE: Record<TStoreOrderCard['stage'], 'green' | 'orange' | 'navy' | 'teal' | 'red' | 'grey'> = {
  received: 'navy', scheduled: 'teal', loaded: 'teal', on_the_way: 'teal', delivered: 'green', confirmed: 'navy', deferred: 'orange', failed: 'red', cancelled: 'grey',
};

export function Pill({ tone, children, className }: { tone: 'green' | 'orange' | 'navy' | 'teal' | 'red' | 'grey'; children: ReactNode; className?: string }) {
  const t = {
    green: 'bg-st-greenTint text-st-green', orange: 'bg-st-orangeTint text-st-orange', navy: 'bg-primary-tint text-st-navy',
    teal: 'bg-st-tealTint text-teal', red: 'bg-bad-tint text-st-red', grey: 'bg-offline-tint text-st-muted',
  }[tone];
  return <span className={cx('inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap', t, className)}>{children}</span>;
}

export const Panel = ({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'orange' | 'teal' | 'green' }) => (
  <section className={cx('rounded-2xl border p-5', tone === 'orange' ? 'bg-st-orangeTint border-st-orangeLine' : tone === 'teal' ? 'bg-st-tealTint border-st-tealLine' : tone === 'green' ? 'bg-st-greenTint border-st-greenLine' : 'bg-surface border-st-bar', className)}>
    {children}
  </section>
);

export function Btn({ children, onClick, kind = 'primary', disabled, href, className }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'outline' | 'danger' | 'teal'; disabled?: boolean; href?: string; className?: string }) {
  const cls = cx('inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl text-[15px] font-semibold text-center disabled:opacity-50',
    kind === 'primary' && 'bg-st-navy text-white hover:brightness-110', kind === 'teal' && 'bg-teal text-white hover:brightness-110',
    kind === 'outline' && 'bg-surface text-st-navy border border-st-navy', kind === 'danger' && 'bg-surface text-st-red border border-bad-soft', className);
  return href ? <a className={cls} href={href}>{children}</a> : <button className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

export const Label = ({ children }: { children: ReactNode }) => <p className="text-[11px] font-bold tracking-wider uppercase text-st-muted">{children}</p>;

export const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) : '—');
export const dayName = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
export const leftText = (min: number) => (min <= 0 ? 'closed' : `${Math.floor(min / 60) ? `${Math.floor(min / 60)}h ` : ''}${min % 60}m`);
export const PAGE_GRID = 'grid gap-5 lg:grid-cols-[1fr_376px] items-start';
