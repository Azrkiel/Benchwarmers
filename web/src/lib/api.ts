import type { PartyStateResponse, SeasonResponse, AssistantRequest, AssistantResponse } from '@shared/types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  state: (code: string, householdId?: string) =>
    fetch(`/api/parties/${encodeURIComponent(code)}/state${householdId ? `?householdId=${encodeURIComponent(householdId)}` : ''}`).then((r) => json<PartyStateResponse>(r)),
  season: (crewId: string) => fetch(`/api/crews/${encodeURIComponent(crewId)}/season`).then((r) => json<SeasonResponse>(r)),
  assistant: (req: AssistantRequest) =>
    fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }).then((r) =>
      json<AssistantResponse>(r),
    ),
  post: <T>(path: string, body: unknown) =>
    fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r)),
};
