import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { PlayBanner, ScoreTick, useBanners, useNewIds, useRankClimbs, type Climb } from './fx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useNewIds', () => {
  it('reports nothing on first render, then only ids added later', () => {
    const { result, rerender } = renderHook(({ ids }) => useNewIds(ids), { initialProps: { ids: ['a', 'b'] }, wrapper: StrictMode });
    expect(result.current).toEqual([]);
    rerender({ ids: ['a', 'b', 'c'] });
    expect(result.current).toEqual(['c']);
  });
});

describe('useRankClimbs', () => {
  it('fires for rows that moved up, never on first render', () => {
    const seen: Climb[][] = [];
    const { rerender } = renderHook(({ rows }) => useRankClimbs(rows, (c) => seen.push(c)), {
      initialProps: { rows: [{ id: 'maya', rank: 1 }, { id: 'sam', rank: 2 }] },
    });
    expect(seen).toEqual([]);
    rerender({ rows: [{ id: 'maya', rank: 2 }, { id: 'sam', rank: 1 }] });
    expect(seen).toEqual([[{ id: 'sam', from: 2, to: 1 }]]);
  });
});

describe('useBanners', () => {
  it('shows one banner at a time and drains the queue', () => {
    vi.useFakeTimers();
    function Host({ calls }: { calls: string[] }) {
      const { current, announce } = useBanners();
      return <><PlayBanner banner={current} /><button onClick={() => calls.forEach((title) => announce({ title, tone: 'score' }))}>go</button></>;
    }
    render(<Host calls={['Touchdown', 'Field goal']} />);
    act(() => { screen.getByText('go').click(); });
    expect(screen.getByText('Touchdown')).toBeTruthy();
    expect(screen.queryByText('Field goal')).toBeNull();
    act(() => { vi.advanceTimersByTime(2700); });
    expect(screen.getByText('Field goal')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2700); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('ScoreTick', () => {
  it('bumps only when the value changes', () => {
    const { container, rerender } = render(<ScoreTick value={7} />);
    expect(container.querySelector('.is-bumped')).toBeNull();
    rerender(<ScoreTick value={14} />);
    expect(container.querySelector('.is-bumped')?.textContent).toBe('14');
  });
});
