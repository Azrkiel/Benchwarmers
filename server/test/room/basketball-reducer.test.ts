import { describe, expect, it } from 'vitest';
import { initialBasketballState, reduceBasketballEvent } from '../../src/room/basketball/reducer.js';

const catalog = { gameId: 'harbor-vs-summit', teamIds: ['harbor', 'summit'], playerTeams: { 'har-sg-7': 'harbor', 'har-pg-1': 'harbor', 'sum-pg-2': 'summit' } };
const event = (patch: Record<string, unknown> = {}) => ({ id: 'e1', revision: 1, sequence: 1, gameId: catalog.gameId, gameElapsedMs: 1000, occurredAt: 1000, receivedAt: 1000, kind: 'score', teamId: 'harbor', playerId: 'har-sg-7', scoreValue: 3, shotType: 'three_pointer', statDeltas: { pts3: 1 }, ...patch });

describe('pure basketball reducer', () => {
  it('credits a made three once and a separate assist without another basket', () => {
    const initial = initialBasketballState(catalog);
    const scored = reduceBasketballEvent(initial, event(), catalog);
    const assisted = reduceBasketballEvent(scored.state, event({ id: 'e2', sequence: 2, kind: 'stat', playerId: 'har-pg-1', scoreValue: undefined, shotType: undefined, statDeltas: { ast: 1 } }), catalog);
    expect(assisted.state.score).toEqual({ harbor: 3, summit: 0 });
    expect(assisted.state.stats).toEqual({ 'har-sg-7': { pts3: 1 }, 'har-pg-1': { ast: 1 } });
    expect(initial.score.harbor).toBe(0);
    expect(scored.state.stats).not.toHaveProperty('har-pg-1');
    expect(scored.moments).toEqual([expect.objectContaining({ id: 'e1', sequence: 1, kind: 'score', playerId: 'har-sg-7' })]);
    const duplicate = reduceBasketballEvent(assisted.state, event(), catalog);
    expect(duplicate.state).toBe(assisted.state);
    expect(duplicate.moments).toEqual([]);
  });

  it('changes possession only from an explicit event; misses and rebounds do not score', () => {
    let state = initialBasketballState(catalog);
    for (const [i, patch] of [
      { kind: 'possession', teamId: 'summit' },
      { kind: 'shot_attempt', teamId: 'summit', playerId: 'sum-pg-2', shotType: 'three_pointer' },
      { kind: 'stat', teamId: 'harbor', playerId: 'har-pg-1', statDeltas: { reb: 1 } },
    ].entries()) state = reduceBasketballEvent(state, event({ scoreValue: undefined, playerId: undefined, shotType: undefined, statDeltas: undefined, ...patch, id: `e${i}`, sequence: i + 1 }), catalog).state;
    expect(state.score).toEqual({ harbor: 0, summit: 0 });
    expect(state.possessionTeamId).toBe('summit');
    expect(state.possessionPlayerId).toBeNull();
    expect(state.stats['har-pg-1']).toEqual({ reb: 1 });
  });

  it.each([
    { scoreValue: 4 }, { playerId: 'unknown' }, { teamId: 'summit' },
    { statDeltas: { pts3: 2 } }, { statDeltas: { reb: 1 } }, { statDeltas: { mystery: 1 } },
    { kind: 'stat' }, { revision: 0 }, { sequence: 0 }, { gameId: 'other' },
    { gameElapsedMs: -1 }, { occurredAt: NaN }, { statDeltas: { pts3: -1 } },
  ])('rejects invalid data without mutating state: %j', patch => {
    const state = initialBasketballState(catalog);
    expect(() => reduceBasketballEvent(state, event(patch), catalog)).toThrow();
    expect(state.appliedSequence).toBe(0);
    expect(state.score.harbor).toBe(0);
  });

  it('rejects out-of-order events and unsupported corrections explicitly', () => {
    const state = reduceBasketballEvent(initialBasketballState(catalog), event(), catalog).state;
    expect(() => reduceBasketballEvent(state, event({ id: 'other' }), catalog)).toThrow(/order/i);
    expect(() => reduceBasketballEvent(state, event({ revision: 2 }), catalog)).toThrow(/revision/i);
    expect(() => reduceBasketballEvent(state, event({ id: 'later', sequence: 2, gameElapsedMs: 999 }), catalog)).toThrow(/order/i);
  });

  it('clears possession at final and rejects new events after final', () => {
    const state = reduceBasketballEvent(initialBasketballState(catalog), event({ kind: 'final', teamId: undefined, playerId: undefined, scoreValue: undefined, shotType: undefined, statDeltas: undefined }), catalog).state;
    expect(state.final).toBe(true);
    expect(state.possessionTeamId).toBeNull();
    expect(() => reduceBasketballEvent(state, event({ id: 'late', sequence: 2 }), catalog)).toThrow(/final/i);
  });
});
