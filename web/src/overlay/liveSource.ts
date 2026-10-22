import type { PartyStateResponse } from '@shared/types';

export type PartyReader = () => Promise<PartyStateResponse>;
export function validPartyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,16}$/.test(value);
}
export function isPartyState(value: unknown): value is PartyStateResponse {
  const s = value as PartyStateResponse | undefined;
  return !!s && Number.isFinite(s.serverNow) && Number.isFinite(s.version)
    && !!s.party && typeof s.party.code === 'string' && typeof s.party.crewName === 'string'
    && ['drafting','scheduled','live','final'].includes(s.party.status)
    && !!s.game && typeof s.game.id === 'string' && Array.isArray(s.standings)
    && s.standings.every(row => typeof row.name === 'string' && typeof row.memberId === 'string'
      && Number.isFinite(row.total) && Array.isArray(row.roster))
    && Array.isArray(s.households) && Array.isArray(s.draftBoard) && Array.isArray(s.picks) && Array.isArray(s.props);
}
export async function readParty(code: string, request: typeof fetch = fetch): Promise<PartyStateResponse> {
  if (!validPartyCode(code)) throw new Error('Invalid party code.');
  async function json(path: string): Promise<unknown> {
    const result = await request(path, { signal: AbortSignal.timeout(4500), credentials:'omit' });
    if (!result.ok) {
      const body = await result.json().catch(() => ({})) as {error?:unknown};
      throw new Error(typeof body.error === 'string' ? body.error : `Backend returned ${result.status}.`);
    }
    return result.json();
  }
  if (code.toLowerCase() === 'latest') {
    const current = await json('/api/crews/sunday-crew/current') as {code?:unknown};
    if (!validPartyCode(current.code)) throw new Error('No current party. Open the control page to create one.');
    code = current.code;
  }
  const state = await json(`/api/parties/${encodeURIComponent(code)}/state`);
  if (!isPartyState(state)) throw new Error('Invalid party data from backend.');
  return state;
}
