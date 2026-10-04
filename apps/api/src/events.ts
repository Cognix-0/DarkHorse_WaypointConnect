// In-process event bus for Server-Sent Events (GET /api/events). One API instance is enough for the demo;
// with several instances this would move to Postgres LISTEN/NOTIFY.
import { EventEmitter } from 'node:events';
import type { TChangeSignal, TLiveEvent } from '@waypoint/shared/contract';
import { prisma } from './db.ts';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emit(kind: TLiveEvent['kind'], message: string, refs: Record<string, string> = {}) {
  const ev: TLiveEvent = { kind, at: new Date().toISOString(), message, refs };
  bus.emit('event', ev);
  return ev;
}

/**
 * Tells every open screen (all roles) that data changed, so it refetches without a browser refresh.
 * Bursts (a loader ticking ten lines) are merged into one signal.
 */
let pending: ReturnType<typeof setTimeout> | null = null;
let pendingBy: TChangeSignal['by'] = null;
export function signalChange(by: TChangeSignal['by'] = null) {
  pendingBy = by;
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const sig: TChangeSignal = { at: new Date().toISOString(), by: pendingBy };
    bus.emit('changed', sig);
  }, 250);
}

/** Dispatcher alert (D5 "Alerts & exceptions"), stored so it survives a refresh. */
export async function alertDispatcher(kind: string, title: string, message: string, refs: Record<string, string>) {
  return prisma.notification.create({ data: { role: 'dispatcher', kind, title, message, refs } });
}

/** Message for one store's manager (read on the store screens in Part 4). */
export async function notifyStore(outletId: string, kind: string, title: string, message: string, refs: Record<string, string>) {
  return prisma.notification.create({ data: { role: 'store', outletId, kind, title, message, refs } });
}
