import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { EventView, PartyStateResponse, TeamScore } from '@shared/types';
import { LiveView } from './LiveView';
import { joinNames, ordinal, pickPlayBanner, resultToast } from './Moments';
import { liveFixture } from '../lib/fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const now = () => liveFixture.serverNow;
const game = { home: liveFixture.game.home as TeamScore, away: liveFixture.game.away as TeamScore };

function ev(partial: Partial<EventView> & Pick<EventView, 'id'>): EventView {
  return { t: 300, type: 'score', team: 'home', text: 'x', tags: [], fantasy: [], ...partial };
}

describe('pickPlayBanner', () => {
  it('announces a touchdown in the scoring team colour', () => {
    const td = ev({ id: 'td', type: 'score', team: 'away', points: 6, tags: ['touchdown', 'pass'], stat: 'rec_td' });
    expect(pickPlayBanner([td], game)).toEqual({ title: 'TOUCHDOWN', sub: game.away.name, tone: 'score', color: game.away.color });
  });

  it('announces a three with the shooter name and skips ordinary twos', () => {
    const three = ev({ id: 't', points: 3, tags: ['three'], stat: 'pts3', playerId: 'p1' });
    expect(pickPlayBanner([three], game, () => 'Splash')).toMatchObject({ title: 'THREE!', sub: 'Splash' });
    const two = ev({ id: 'l', points: 2, tags: ['layup'], stat: 'pts2' });
    expect(pickPlayBanner([two], game)).toBeUndefined();
  });

  it('picks the most important call from a batch', () => {
    const three = ev({ id: 't', points: 3, tags: ['three'], stat: 'pts3' });
    const int = ev({ id: 'i', type: 'play', tags: ['drive', 'end', 'turnover'], stat: 'int' });
    expect(pickPlayBanner([three, int], game)?.title).toBe('INTERCEPTED');
  });

  it('announces period ends and halftime', () => {
    expect(pickPlayBanner([ev({ id: 'p', type: 'period', text: 'End of Q2', tags: ['period'] })], game)?.title).toBe('END OF Q2');
    expect(pickPlayBanner([ev({ id: 'h', type: 'period', text: 'Halftime: end of Q2', tags: ['period'] })], game)?.title).toBe('HALFTIME');
  });
});

describe('resultToast', () => {
  it('names the people who called it right, with the best points', () => {
    expect(resultToast([
      { memberName: 'Maya', correct: true, score: { correct: true, points: 12 } },
      { memberName: 'Leo', correct: true, score: { correct: true, points: 8 } },
      { memberName: 'Sam', correct: false },
    ])).toEqual({ text: 'Maya and Leo called it · +12', tone: 'score' });
  });

  it('falls back to a neutral line when nobody got it', () => {
    expect(resultToast([{ memberName: 'Sam', correct: false }]).text).toBe('Nobody saw that coming');
  });
});

describe('helpers', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '111th']);
  });
  it('joins names', () => {
    expect(joinNames(['Maya', 'Leo', 'Sam'])).toBe('Maya, Leo and Sam');
  });
});

describe('LiveView moments', () => {
  it('does not banner events already present on first load, even under StrictMode', () => {
    const withThree: PartyStateResponse = {
      ...liveFixture,
      recentEvents: [ev({ id: 'old-3', points: 3, tags: ['three'], stat: 'pts3' }), ...liveFixture.recentEvents],
    };
    const { container } = render(<StrictMode><LiveView state={withThree} serverNow={now} /></StrictMode>);
    expect(container.querySelector('.fx-banner')).toBeNull();
  });

  it('banners a new three and not a new two', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<LiveView state={liveFixture} serverNow={now} />);
    const three = ev({ id: 'new-3', points: 3, tags: ['three', 'hot'], stat: 'pts3', playerId: 'har-sg-7', team: 'home' });
    rerender(<LiveView state={{ ...liveFixture, recentEvents: [three, ...liveFixture.recentEvents] }} serverNow={now} />);
    expect(container.querySelector('.fx-banner strong')?.textContent).toBe('THREE!');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(container.querySelector('.fx-banner')).toBeNull();

    const two = ev({ id: 'new-2', points: 2, tags: ['layup'], stat: 'pts2' });
    rerender(<LiveView state={{ ...liveFixture, recentEvents: [two, three, ...liveFixture.recentEvents] }} serverNow={now} />);
    expect(container.querySelector('.fx-banner')).toBeNull();
  });

  it('toasts a rank climb, with a bigger moment for first place', () => {
    const { container, rerender } = render(<LiveView state={liveFixture} serverNow={now} />);
    const sorted = [...liveFixture.standings].sort((a, b) => a.rank - b.rank);
    const last = sorted[sorted.length - 1]!;
    const climbed = liveFixture.standings.map((r) => (r.memberId === last.memberId ? { ...r, rank: 1 } : { ...r, rank: r.rank + (r.rank < last.rank ? 1 : 0) }));
    rerender(<LiveView state={{ ...liveFixture, standings: climbed }} serverNow={now} />);
    const toasts = [...container.querySelectorAll('.fx-toast')].map((t) => t.textContent);
    expect(toasts).toContain(`${last.name} moves up to 1st`);
    expect(container.querySelectorAll('.fx-toast.is-win').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.fx-burst')).toHaveLength(0);
  });

  it('toasts a newly resolved prop, but not on first load', () => {
    const resolved = { ...liveFixture.activeProp!, id: 'prop-r', status: 'resolved' as const, realSecondsToLock: undefined };
    const picks = [{ ...liveFixture.picks[0]!, propId: 'prop-r', memberName: 'Maya', correct: true, score: { propId: 'prop-r', memberId: 'maya', optionId: 'yes', correct: true, base: 10, streak: 1, odds: 1, speed: 1, contrarian: 1, factor: 1, points: 12, bonuses: [] as never[] } }];
    const before: PartyStateResponse = { ...liveFixture, props: [...liveFixture.props], picks };
    const { container, rerender } = render(<LiveView state={before} serverNow={now} />);
    expect(container.querySelectorAll('.fx-toast')).toHaveLength(0);
    rerender(<LiveView state={{ ...before, props: [...liveFixture.props, resolved] }} serverNow={now} />);
    expect([...container.querySelectorAll('.fx-toast')].map((t) => t.textContent)).toContain('Maya called it · +12');
  });
});
