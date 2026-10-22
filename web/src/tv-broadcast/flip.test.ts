import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { computeFlipDeltas, rankMovement } from './flip';
import { Standings } from './Standings';
import { liveFixture } from '../lib/fixtures';

afterEach(cleanup);

describe('rankMovement', () => {
  it('up when the rank improved', () => {
    expect(rankMovement({ rank: 1, prevRank: 2 })).toBe('up');
  });
  it('down when the rank dropped', () => {
    expect(rankMovement({ rank: 3, prevRank: 2 })).toBe('down');
  });
  it('same when unchanged', () => {
    expect(rankMovement({ rank: 4, prevRank: 4 })).toBe('same');
  });
});

describe('computeFlipDeltas', () => {
  it('returns before.top - after.top for moved keys', () => {
    const before = new Map([['a', 0], ['b', 100]]);
    const after = new Map([['a', 100], ['b', 0]]);
    const d = computeFlipDeltas(before, after);
    expect(d.get('a')).toBe(-100);
    expect(d.get('b')).toBe(100);
    expect(d.size).toBe(2);
  });

  it('skips zero deltas and keys missing from either side', () => {
    const before = new Map([['still', 50], ['gone', 10], ['moved', 0]]);
    const after = new Map([['still', 50], ['new', 99], ['moved', 30]]);
    const d = computeFlipDeltas(before, after);
    expect([...d.keys()]).toEqual(['moved']);
    expect(d.get('moved')).toBe(-30);
  });

  it('returns an empty map for identical layouts', () => {
    expect(computeFlipDeltas(new Map([['a', 1]]), new Map([['a', 1]])).size).toBe(0);
  });
});

describe('Standings order', () => {
  it('renders rows in rank order even when given shuffled standings', () => {
    const shuffled = [...liveFixture.standings].reverse();
    const { container } = render(
      createElement(Standings, { rows: shuffled, households: liveFixture.households }),
    );
    const keys = Array.from(container.querySelectorAll('[data-flip-key]')).map((el) =>
      el.getAttribute('data-flip-key'),
    );
    const expected = [...liveFixture.standings].sort((a, b) => a.rank - b.rank).map((r) => r.memberId);
    expect(keys).toEqual(expected);
    expect(keys[0]).toBe('maya');
  });
});
