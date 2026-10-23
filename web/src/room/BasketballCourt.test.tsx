import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { basketballFixture } from './fixtures/basketball';
import { layoutFor, RoomDisplay, toDisplayModel } from './RoomDisplay';
import { BasketballCourt, trackStyle } from './BasketballCourt';
import { leaders, paginate, RoomStandings } from './RoomStandings';
import { RoomNav } from './RoomNav';
import { RoomResults } from './RoomResults';
import type { RoomViewNext } from './sport';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function display(view: RoomViewNext, props: Partial<Parameters<typeof RoomDisplay>[0]> = {}) {
  const onView = vi.fn();
  render(<RoomDisplay view={view} layout="compact" current="game" onView={onView} joinUrl="http://x/room/HOOP42" {...props} />);
  return onView;
}

describe('basketball court', () => {
  it('shows known possession and says unknown when it is null', () => {
    render(<BasketballCourt view={basketballFixture('open')} />);
    expect(screen.getByText('Harbor Hawks ball')).toBeTruthy();
    expect(screen.getByText('Scripted possession')).toBeTruthy();
    cleanup();
    const unknown = basketballFixture('open');
    unknown.game.context = { sport: 'basketball', possessionTeamId: null, possessionPlayerId: null, ball: null, tracking: 'score_only' };
    render(<BasketballCourt view={unknown} />);
    expect(screen.getByText('Possession unknown')).toBeTruthy();
  });

  it('labels an event marker as an event location and draws no ball without tracking', () => {
    const { container } = render(<BasketballCourt view={basketballFixture('open')} eventPoint={{ x: 0.8, y: 0.4 }} />);
    expect(screen.getByText('Event location')).toBeTruthy();
    expect(container.querySelector('.rd-court-ball')).toBeNull();
  });
});

describe('tracking prototype', () => {
  it('glides only between close genuine observations and fades or hides stale ones', () => {
    expect(trackStyle(null, { observedAt: 1000 }, 1000)).toEqual({ glideMs: 0, freshness: 'fresh' });
    expect(trackStyle({ observedAt: 1000 }, { observedAt: 1400 }, 1400).glideMs).toBe(400);
    expect(trackStyle({ observedAt: 1000 }, { observedAt: 4000 }, 4000).glideMs).toBe(0);
    expect(trackStyle(null, { observedAt: 1000 }, 5000).freshness).toBe('stale');
    expect(trackStyle(null, { observedAt: 1000 }, 20000).freshness).toBe('hidden');
  });

  it('draws a tracked ball only when the snapshot says tracking is ball-level', () => {
    const view = basketballFixture('open');
    view.serverNow = 5000;
    view.game.context = { sport: 'basketball', possessionTeamId: 'harbor', possessionPlayerId: null, ball: { point: { x: 0.5, y: 0.5 }, observedAt: 4800 }, tracking: 'ball' };
    const { container } = render(<BasketballCourt view={view} />);
    expect(container.querySelector('.rd-court-ball.is-fresh')).toBeTruthy();
    expect(screen.getByText('Scripted ball position')).toBeTruthy();
  });
});

