import type { TSessionUser } from '@waypoint/shared/contract';

const KEY = 'waypoint.session';
export type Session = { token: string; user: TSessionUser };

export const getSession = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
};
export const setSession = (s: Session | null) => (s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY));

/** Error with the API's plain-sentence message plus the status and body (e.g. code: 'SECOND_DEFERRAL'). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

/** Typed fetch for /api. Throws ApiError using the API's error text. A 401 signs the user out. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = getSession();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && s) { setSession(null); window.location.assign('/login'); }
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  return body as T;
}
