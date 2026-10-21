import type { PartyStateResponse, SeasonResponse } from '@shared/types';

export type FallbackView = 'draft' | 'tonight' | 'season';

export type FallbackModel = {
  view: FallbackView;
  code?: string;
  state?: PartyStateResponse;
  season?: SeasonResponse;
};

const VIEWS: readonly string[] = ['draft', 'tonight', 'season'];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Build a model from an MCP tool's structuredContent. Defensive: unknown shapes -> undefined. */
export function modelFromStructured(sc: Record<string, unknown> | undefined): FallbackModel | undefined {
  if (!isObj(sc) || 'error' in sc) return undefined;
  const view = sc.view;
  if (typeof view !== 'string' || !VIEWS.includes(view)) return undefined;
  const code = typeof sc.code === 'string' ? sc.code : undefined;
  if (view === 'season') {
    if (isObj(sc.season) && Array.isArray(sc.season.rows)) {
      return { view, season: sc.season as unknown as SeasonResponse };
    }
    return undefined;
  }
  if (isObj(sc.state) && Array.isArray(sc.state.draftBoard)) {
    return { view: view as FallbackView, code, state: sc.state as unknown as PartyStateResponse };
  }
  return undefined;
}

export function modelFromState(state: PartyStateResponse | undefined): FallbackModel | undefined {
  if (!state) return undefined;
  const status = state.party.status;
  return {
    view: status === 'scheduled' || status === 'drafting' ? 'draft' : 'tonight',
    code: state.party.code,
    state,
  };
}

/** Prefer a newer polled state for the same party (keeps draft/tonight live); season stays as structured. */
export function mergeModel(
  fromStructured: FallbackModel | undefined,
  fromState: FallbackModel | undefined,
): FallbackModel | undefined {
  if (!fromStructured) return fromState;
  if (!fromState || fromStructured.view === 'season') return fromStructured;
  const a = fromStructured.state;
  const b = fromState.state;
  if (!a || !b) return fromStructured;
  const sameParty = (fromStructured.code ?? a.party.code) === b.party.code;
  if (sameParty && b.version >= a.version) {
    return { view: fromStructured.view, code: b.party.code, state: b };
  }
  return fromStructured;
}
