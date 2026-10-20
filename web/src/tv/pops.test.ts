import { describe, expect, it } from 'vitest';
import type { EventView, FantasyPop } from '@shared/types';
import { formatPop, newEventIds } from './pops';

function ev(id: string): EventView {
  return { id, t: 100, type: 'score', team: 'home', text: id, tags: [], fantasy: [] };
}

describe('newEventIds', () => {
  it('returns nothing on first render so the initial load does not spam pops', () => {
    expect(newEventIds(undefined, [ev('a'), ev('b')])).toEqual([]);
  });

  it('returns only ids not seen before', () => {
    const prev = new Set(['a', 'b']);
    expect(newEventIds(prev, [ev('c'), ev('b'), ev('a')])).toEqual(['c']);
  });

  it('returns nothing when nothing changed', () => {
    expect(newEventIds(new Set(['a']), [ev('a')])).toEqual([]);
  });
});

describe('formatPop', () => {
  const pop = (points: number, memberName = 'Maya'): FantasyPop => ({
    memberId: 'maya',
    memberName,
    playerId: 'p',
    playerName: 'Big Mo',
    points,
  });

  it('whole points have no decimal', () => {
    expect(formatPop(pop(3))).toBe('+3 Maya');
  });

  it('keeps one decimal', () => {
    expect(formatPop(pop(1.5, 'Sam'))).toBe('+1.5 Sam');
  });

  it('negative uses a minus sign', () => {
    expect(formatPop(pop(-1, 'Leo'))).toBe('−1 Leo');
  });
});
