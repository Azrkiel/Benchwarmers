import { validateBasketballEvent, type BasketballCatalog, type BasketballEvent } from './events.js';

export type BasketballState = {
  gameId: string; appliedSequence: number; gameElapsedMs: number;
  appliedRevisions: Record<string, number>; score: Record<string, number>;
  stats: Record<string, Record<string, number>>;
  possessionTeamId: string | null; possessionPlayerId: string | null; final: boolean;
};
export type BasketballMoment = Pick<BasketballEvent, 'id' | 'sequence' | 'kind' | 'teamId' | 'playerId' | 'scoreValue' | 'shotType'>;

export function initialBasketballState(catalog: BasketballCatalog): BasketballState {
  return { gameId: catalog.gameId, appliedSequence: 0, gameElapsedMs: 0, appliedRevisions: {},
    score: Object.fromEntries(catalog.teamIds.map(id => [id, 0])), stats: {},
    possessionTeamId: null, possessionPlayerId: null, final: false };
}

/** Pure deterministic script reducer. Provider corrections require reconciliation, not addition. */
export function reduceBasketballEvent(previous: BasketballState, input: unknown, catalog: BasketballCatalog): { state: BasketballState; moments: BasketballMoment[] } {
  const event = validateBasketballEvent(input, catalog);
  if (previous.gameId !== event.gameId) throw new Error('Basketball state game mismatch');
  if (Object.hasOwn(previous.appliedRevisions, event.id)) {
    if (event.revision <= previous.appliedRevisions[event.id]) return { state: previous, moments: [] };
    throw new Error('Basketball revision requires correction reconciliation');
  }
  if (previous.final) throw new Error('Basketball event after final');
  if (event.sequence <= previous.appliedSequence || event.gameElapsedMs < previous.gameElapsedMs) throw new Error('Basketball event order violation');
  const state = structuredClone(previous);
  // defineProperty also treats arbitrary event IDs such as __proto__ as data.
  Object.defineProperty(state.appliedRevisions, event.id, { value: event.revision, enumerable: true, writable: true, configurable: true });
  state.appliedSequence = event.sequence;
  state.gameElapsedMs = event.gameElapsedMs;
  if (event.kind === 'score') state.score[event.teamId!] += event.scoreValue!;
  if (event.statDeltas) {
    const stats = Object.hasOwn(state.stats, event.playerId!) ? state.stats[event.playerId!] : {};
    for (const [key, value] of Object.entries(event.statDeltas)) stats[key] = (stats[key] ?? 0) + value!;
    Object.defineProperty(state.stats, event.playerId!, { value: stats, enumerable: true, writable: true, configurable: true });
  }
  if (event.kind === 'possession') {
    state.possessionTeamId = event.teamId!;
    state.possessionPlayerId = event.playerId ?? null;
  }
  if (event.kind === 'period' || event.kind === 'final') {
    state.possessionTeamId = null; state.possessionPlayerId = null;
  }
  if (event.kind === 'final') state.final = true;
  const { id, sequence, kind, teamId, playerId, scoreValue, shotType } = event;
  return { state, moments: [{ id, sequence, kind, teamId, playerId, scoreValue, shotType }] };
}
