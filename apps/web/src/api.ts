import type { TSessionUser } from '@waypoint/shared/contract';

const KEY = 'waypoint.session';
export type Session = { token: string; user: TSessionUser };

export const getSession = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
};
export const setSession = (s: Session | null) => (s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY));

/** Typed fetch for /api. Throws Error(message) using the API's error text. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = getSession();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}
