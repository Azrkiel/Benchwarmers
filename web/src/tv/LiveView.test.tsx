import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { EventView, PartyStateResponse, PropView } from '@shared/types';
import { LiveView } from './LiveView';
import { liveFixture } from '../lib/fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const now = () => liveFixture.serverNow;

describe('LiveView', () => {
  it('renders scoreboard, clock and team names', () => {
    render(<LiveView state={liveFixture} serverNow={now} />);
    expect(screen.getAllByText('Harbor Hawks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Summit Foxes').length).toBeGreaterThan(0);
    expect(screen.getByText('48')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText(liveFixture.game.clock)).toBeTruthy();
  });

  it('shows the leader spotlight and standings arrows', () => {
    render(<LiveView state={liveFixture} serverNow={now} />);
    expect(screen.getByRole('heading', { name: 'Standings' })).toBeTruthy();
    const leaderName = liveFixture.standings.find((r) => r.rank === 1)!.name;
    expect(leaderName).toBe('Maya');
    expect(screen.getByText('Maya', { selector: '.tv-stand-name' })).toBeTruthy();
    expect(screen.getAllByText('▲').length).toBeGreaterThan(0);
    expect(screen.getAllByText('▼').length).toBeGreaterThan(0);
    expect(screen.getAllByText('142.5').length).toBeGreaterThan(0);
    expect(screen.getByText('3 streak')).toBeTruthy();
  });

  it('shows the active prop with countdown and percentages', () => {
    render(<LiveView state={liveFixture} serverNow={now} />);
    expect(screen.getByText('Will the next score be a 3-pointer?')).toBeTruthy();
    expect(screen.getByText('0:12')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('59%')).toBeTruthy();
  });

  it('counts down with the server offset', () => {
    render(<LiveView state={liveFixture} serverNow={() => liveFixture.serverNow + 5000} />);
    expect(screen.getByText('0:07')).toBeTruthy();
  });

  it('shows fantasy chips and a ticker line', () => {
    render(<LiveView state={liveFixture} serverNow={now} />);
    expect(screen.getAllByText('+3 Maya').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sam picked No').length).toBeGreaterThan(0);
  });

  it('floats pop-ups only for events new since the last render, then removes them', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<LiveView state={liveFixture} serverNow={now} />);
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);

    const newEvent: EventView = {
      id: 'e0',
      t: 314,
      type: 'score',
      team: 'home',
      points: 2,
      text: 'Big Mo finishes inside.',
      tags: ['layup'],
      playerId: 'har-c-34',
      stat: 'pts2',
      fantasy: [{ memberId: 'maya', memberName: 'Maya', playerId: 'har-c-34', playerName: 'Big Mo', points: 2 }],
    };
    const next: PartyStateResponse = { ...liveFixture, recentEvents: [newEvent, ...liveFixture.recentEvents] };
    rerender(<LiveView state={next} serverNow={now} />);

    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
    expect(screen.getByText('Big Mo finishes inside.')).toBeTruthy();
    expect(screen.getByText('+2 Maya', { selector: '.tv-chip' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
  });

  it('shows the locked prop while picks are closed and the result is pending', () => {
    const { activeProp, ...rest } = liveFixture;
    const lockedProp: PropView = { ...activeProp!, status: 'locked', secondsToLock: 0, realSecondsToLock: undefined };
    const state: PartyStateResponse = {
      ...rest,
      props: [liveFixture.props[0]!, lockedProp, liveFixture.props[2]!],
    };
    render(<LiveView state={state} serverNow={now} />);
    expect(screen.getByText('Waiting for the result')).toBeTruthy();
    expect(screen.getByText('Will the next score be a 3-pointer?')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('59%')).toBeTruthy();
    expect(screen.getAllByText('2/4 picks').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Answer:/)).toBeNull();
    expect(screen.queryByText('Who scores first after halftime?')).toBeNull();
  });

  it('prefers the open prop over a locked one', () => {
    const locked: PropView = { ...liveFixture.activeProp!, id: 'prop-9', status: 'locked', realSecondsToLock: undefined };
    render(<LiveView state={{ ...liveFixture, props: [locked, liveFixture.activeProp!] }} serverNow={now} />);
    expect(screen.getByText('0:12')).toBeTruthy();
    expect(screen.queryByText('Waiting for the result')).toBeNull();
  });

  it('does not pop fantasy for events already present on the first load, even under StrictMode', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <StrictMode>
        <LiveView state={liveFixture} serverNow={now} />
      </StrictMode>,
    );
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
    rerender(
      <StrictMode>
        <LiveView state={{ ...liveFixture, serverNow: liveFixture.serverNow + 1000 }} serverNow={now} />
      </StrictMode>,
    );
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
  });
});
