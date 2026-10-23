import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { BasketballCelebration } from './BasketballCelebration';
import { advance, CELEBRATION_MS, EMPTY_QUEUE, enqueue, useCelebrations, type CelebrationInput } from './celebrations';
import { SharedAudio } from './audio';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const team = (id: string, score: number) => ({ id, name: id === 'h' ? 'Harbor Hawks' : 'Summit Foxes', short: id.toUpperCase(), color: '#123456', score });
function input(home: number, away: number, plays: { id: string; kind: string }[]): CelebrationInput {
  return { sport: 'basketball', home: team('h', home), away: team('a', away), plays };
}
const base = [{ id: 'e1', kind: 'score' }, { id: 'e2', kind: 'stat' }];

describe('celebration triggers', () => {
  it('stays quiet on the first snapshot (no backlog replay on load)', () => {
    const { result } = renderHook(() => useCelebrations(input(42, 39, base)));
    expect(result.current.celebration).toBeNull();
  });

  it('fires once for one new basket and names the shot from the score change', () => {
    const { result, rerender } = renderHook(({ v }) => useCelebrations(v), { initialProps: { v: input(42, 39, base) } });
    rerender({ v: input(45, 39, [...base, { id: 'e3', kind: 'score' }]) });
    expect(result.current.celebration).toMatchObject({ id: 'e3', title: 'Three', sub: 'Harbor Hawks', points: 3 });
    rerender({ v: input(45, 39, [...base, { id: 'e3', kind: 'score' }]) });
    expect(result.current.celebration?.id).toBe('e3');
    expect(result.current.coalesced).toBe(0);
  });

  it('does not fire for a duplicate snapshot', () => {
    const { result, rerender } = renderHook(({ v }) => useCelebrations(v), { initialProps: { v: input(42, 39, base) } });
    rerender({ v: input(42, 39, [...base]) });
    expect(result.current.celebration).toBeNull();
  });

  it('reports a score correction without a fake basket', () => {
    const { result, rerender } = renderHook(({ v }) => useCelebrations(v), { initialProps: { v: input(42, 39, base) } });
    rerender({ v: input(40, 39, base) });
    expect(result.current.celebration).toBeNull();
    expect(result.current.corrected).toBe(1);
  });

  it('clears after the bounded duration', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useCelebrations(v), { initialProps: { v: input(42, 39, base) } });
    rerender({ v: input(44, 39, [...base, { id: 'e3', kind: 'score' }]) });
    expect(result.current.celebration?.title).toBe('Bucket');
    act(() => { vi.advanceTimersByTime(CELEBRATION_MS); });
    expect(result.current.celebration).toBeNull();
  });
});

describe('celebration queue', () => {
  const c = (id: string, kind: 'basket' | 'final' = 'basket') => ({ id, kind, title: id, color: '#000' });
  it('keeps one main effect, coalesces ordinary scores and lets the final wait', () => {
    let q = enqueue(EMPTY_QUEUE, c('a'));
    q = enqueue(q, c('b'));
    q = enqueue(q, c('c'));
    expect(q).toMatchObject({ current: { id: 'a' }, pending: null, coalesced: 2 });
    q = enqueue(q, c('final', 'final'));
    expect(q.pending?.id).toBe('final');
    q = advance(q);
    expect(q).toMatchObject({ current: { id: 'final' }, pending: null, coalesced: 0 });
    expect(advance(q).current).toBeNull();
  });
});

describe('celebration overlay', () => {
  const celebration = { id: 'e3', kind: 'basket' as const, title: 'Three', sub: 'Harbor Hawks', color: '#1F7AE0', points: 3 };
  it('is decorative: captions for screen readers, no focusable content', () => {
    const { container } = render(<BasketballCelebration celebration={celebration} />);
    expect(screen.getByRole('status').textContent).toBe('Three, Harbor Hawks');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('button,a,[tabindex]')).toHaveLength(0);
  });

  it('shows a static banner with the points in reduced motion', () => {
    const { container } = render(<BasketballCelebration celebration={celebration} reducedMotion />);
    expect(container.querySelector('.bc-static')?.textContent).toContain('+3');
    expect(container.querySelector('.bc-confetti, .bc-ball')).toBeNull();
  });

  it('plays the swish then the cheer only through an enabled audio leader', () => {
    vi.useFakeTimers();
    const audio = new SharedAudio(() => null);
    const play = vi.spyOn(audio, 'play');
    render(<BasketballCelebration celebration={celebration} audio={audio} />);
    act(() => { vi.advanceTimersByTime(1400); });
    expect(play.mock.calls.map((call) => call[0])).toEqual(['swish', 'cheer']);
    expect(play.mock.results.every((r) => r.value === false)).toBe(true);
  });
});
