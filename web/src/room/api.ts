import type { RoomView } from '@shared/room';

export type RoomCredentials = { participantToken?: string; hostToken?: string };
const memory = new Map<string, string>();
let storageUnavailable = false;
function read(key: string): string | null {
  try { return localStorage.getItem(key) ?? (storageUnavailable ? memory.get(key) ?? null : null); }
  catch { storageUnavailable = true; return memory.get(key) ?? null; }
}
function write(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { storageUnavailable = true; }
}
export function storageWarning() { return storageUnavailable ? 'Browser storage is unavailable. Keep this tab open to retain your seat and host controls.' : ''; }
export function roomCredentials(code: string): RoomCredentials {
  try {
    const value = JSON.parse(read(`bw.room.${code}`) ?? '{}') as RoomCredentials;
    return { participantToken: typeof value.participantToken === 'string' ? value.participantToken : undefined, hostToken: typeof value.hostToken === 'string' ? value.hostToken : undefined };
  } catch { return {}; }
}
export function saveCredentials(code: string, credentials: RoomCredentials) { write(`bw.room.${code}`, JSON.stringify(credentials)); }
export function seasonToken(id: string) { return read(`bw.season.${id}`) ?? undefined; }
export function forgetSeasonToken(id: string) {
  const key = `bw.season.${id}`;
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { storageUnavailable = true; }
}
export function rememberPlayer(code: string, view: RoomView, participantToken: string) {
  const credentials = { ...roomCredentials(code), participantToken };
  saveCredentials(code, credentials);
  write(`bw.season.${view.season.id}`, participantToken);
  return credentials;
}
export class RoomRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function roomRequest<T>(path: string, options: { body?: unknown; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new RoomRequestError(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `The room request failed (${response.status}).`, response.status, typeof data.code === 'string' ? data.code : undefined);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new Error('The room took too long to respond. Try again.');
    throw error;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Unable to reach the room. Try again.'; }
/** Room codes this browser holds a seat or host credential for, newest storage order. */
export function savedRooms(): { code: string; seated: boolean; host: boolean }[] {
  const codes = new Set<string>();
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('bw.room.')) codes.add(key.slice(8)); } }
  catch { storageUnavailable = true; }
  for (const key of memory.keys()) if (key.startsWith('bw.room.')) codes.add(key.slice(8));
  return [...codes].map((code) => { const value = roomCredentials(code); return { code, seated: !!value.participantToken, host: !!value.hostToken }; }).filter((room) => room.seated || room.host);
}
