import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { basketballFixture } from './fixtures/basketball';
import { layoutFor, RoomDisplay, toDisplayModel } from './RoomDisplay';
import { BasketballCourt } from './BasketballCourt';
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

describe('room display', () => {
  it('picks compact for 960x480, medium for 1280x800 and tv for 1920x1080', () => {
    expect(layoutFor(960, 480)).toBe('compact');
    expect(layoutFor(1280, 800)).toBe('medium');
    expect(layoutFor(1280, 720)).toBe('medium');
    expect(layoutFor(1920, 1080)).toBe('tv');
  });

  it('shows score, one featured call, its status and top three leaders', () => {
    display(basketballFixture('open', 6));
    expect(screen.getByRole('region', { name: 'Score' }).textContent).toContain('42');
    const call = screen.getByRole('region', { name: 'Featured call' });
    expect(within(call).getByRole('heading').textContent).toBe('Next basket: two or three?');
    expect(within(call).getByRole('status').textContent).toMatch(/Closes in 0:0\d.*3 of 6 answered/);
    expect(within(screen.getByRole('complementary', { name: 'Room leaders' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('region', { name: 'Featured call' })).toHaveLength(1);
  });

  it('keeps tied ranks from the server', () => {
    display(basketballFixture('open', 6));
    const ranks = within(screen.getByRole('complementary', { name: 'Room leaders' })).getAllByRole('listitem').map((row) => row.querySelector('.rd-row-rank')?.textContent);
    expect(ranks).toEqual(['1', '2', '2']);
  });

  it('labels locked, resolved and stale states', () => {
    display(basketballFixture('locked'));
    expect(screen.getByText('Locked · Waiting for the play')).toBeTruthy();
    cleanup();
    display(basketballFixture('resolved'));
    expect(screen.getByLabelText('Correct')).toBeTruthy();
    cleanup();
    display(basketballFixture('stale'));
    expect(screen.getByText('Showing last update · Reconnecting')).toBeTruthy();
  });

  it('never renders private fields even when handed a private view', () => {
    const view = { ...basketballFixture('open'), me: { participantId: 'fx-0', name: 'Maya', currentPick: { questionId: 'bball-q-004', optionId: 'three' } } } as RoomViewNext;
    (view.game as unknown as Record<string, unknown>).hostToken = 'host-secret';
    const model = toDisplayModel(view) as RoomViewNext & { me?: unknown };
    expect(model.me).toBeUndefined();
    expect(JSON.stringify(model)).not.toContain('host-secret');
    display(view);
    expect(document.body.textContent).not.toContain('host-secret');
    expect(document.body.textContent).not.toContain('Your pick');
  });

  it('shows the join code in the lobby and the winner at final', () => {
    display(basketballFixture('lobby'));
    expect(screen.getByRole('heading', { name: 'Join on your phone' })).toBeTruthy();
    cleanup();
    display(basketballFixture('final'));
    expect(screen.getByRole('heading', { name: 'Winner' })).toBeTruthy();
  });

  it('marks fixture data on screen', () => {
    display(basketballFixture('open'), { fixture: true });
    expect(screen.getByText('Fixture')).toBeTruthy();
  });

  it('opens all standings from the leaders card', () => {
    const onView = display(basketballFixture('open', 6));
    fireEvent.click(screen.getByRole('button', { name: 'All standings (6)' }));
    expect(onView).toHaveBeenCalledWith('standings');
  });
});

describe('room nav', () => {
  it('disables Results before final and moves between tabs with arrows', () => {
    const onChange = vi.fn();
    render(<RoomNav current="game" onChange={onChange} final={false} controls="x" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Game', 'Standings', 'Lineups', 'Results']);
    expect((screen.getByRole('tab', { name: 'Results' }) as HTMLButtonElement).disabled).toBe(true);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toBe('Lineups');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Game');
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(onChange).toHaveBeenCalledWith('standings');
  });
});

describe('standings', () => {
  it('paginates 32 participants at a fixed row count and reaches everyone', () => {
    const rows = basketballFixture('open', 32).standings;
    expect(paginate(rows, 6).map((page) => page.length)).toEqual([6, 6, 6, 6, 6, 2]);
    render(<RoomStandings rows={rows} perPage={6} />);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      for (const item of screen.getAllByRole('listitem')) seen.add(item.querySelector('.rd-row-name')!.textContent!);
      const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
      if (!next.disabled) fireEvent.click(next);
    }
    expect(seen.size).toBe(32);
    expect(screen.getByText('Page 6 of 6')).toBeTruthy();
  });

  it('adds the highlighted participant when outside the top rows', () => {
    const rows = basketballFixture('open', 10).standings;
    expect(leaders(rows, 3, rows[8]!.participantId).map((row) => row.participantId)).toEqual([...rows.slice(0, 3), rows[8]].map((row) => row!.participantId));
  });
});

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

describe('results', () => {
  it('shows the winner first and unlocks Season after the pause', () => {
    vi.useFakeTimers();
    render(<RoomResults view={basketballFixture('final')} revealMs={6000} />);
    expect(screen.getByRole('heading', { name: 'Winner' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Season standings' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(6000); });
    fireEvent.click(screen.getByRole('button', { name: 'Season standings' }));
    expect(screen.getByRole('heading', { name: 'Friday season' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Friday season' }));
  });

  it('lets a host advance early and shows tied winners together', () => {
    const tied = basketballFixture('final');
    tied.standings = tied.standings.map((row, i) => i < 2 ? { ...row, rank: 1, total: 90 } : row);
    render(<RoomResults view={tied} host revealMs={6000} />);
    expect(screen.getByRole('heading', { name: 'Tied winners' })).toBeTruthy();
    expect(screen.getAllByText('90.0')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Show season now' }));
    expect(screen.getByRole('heading', { name: 'Friday season' })).toBeTruthy();
  });
});
