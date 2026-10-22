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
  it('leaves standings and the detailed pick card closed by default', () => {
    const { container } = render(<LiveView state={liveFixture} serverNow={now} />);
    expect(container.querySelector('.tv-live')).toBeTruthy();
    expect(container.querySelector('.tv-court')).toBeNull();
    expect(container.querySelector('.tv-standings')).toBeNull();
    expect(container.querySelector('.tv-pickbar')).toBeNull();
  });
  it('renders scoreboard, clock and team names', () => {
    render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
    expect(screen.getAllByText('Harbor Hawks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Summit Foxes').length).toBeGreaterThan(0);
    expect(screen.getByText('48')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText(liveFixture.game.clock)).toBeTruthy();
  });

  it('shows the leader spotlight and standings arrows', () => {
    render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
    expect(screen.getByText(/top of the bench/i)).toBeTruthy();
    const leaderName = liveFixture.standings.find((r) => r.rank === 1)!.name;
    expect(leaderName).toBe('Maya');
    expect(screen.getByTestId('leader').textContent).toContain('Maya');
    expect(screen.getAllByText('▲').length).toBeGreaterThan(0);
    expect(screen.getAllByText('▼').length).toBeGreaterThan(0);
    expect(screen.getAllByText('142.5').length).toBeGreaterThan(0);
    expect(screen.getByText('3 streak')).toBeTruthy();
  });

  it('shows the leader margin without repeating the full roster in the spotlight', () => {
    const { container } = render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
    const sorted = [...liveFixture.standings].sort((a, b) => a.rank - b.rank);
    const margin = (sorted[0]!.total - sorted[1]!.total).toFixed(1);
    expect(screen.getByText(`${margin} points clear`)).toBeTruthy();
    expect(container.querySelector('.tv-leader-roster')).toBeNull();
  });

  it('shows the active prop with countdown and percentages', () => {
    render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
    expect(screen.getByText('Will the next score be a 3-pointer?')).toBeTruthy();
    expect(screen.getByText('0:12')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('59%')).toBeTruthy();
  });

  it('counts down with the server offset', () => {
    render(<LiveView showStandings showPick state={liveFixture} serverNow={() => liveFixture.serverNow + 5000} />);
    expect(screen.getByText('0:07')).toBeTruthy();
  });

  it('shows crew activity when standings are open', () => {
    render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
    expect(screen.getAllByText('Sam picked No').length).toBeGreaterThan(0);
  });

  it('floats pop-ups only for events new since the last render, then removes them', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<LiveView showStandings showPick state={liveFixture} serverNow={now} />);
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
    rerender(<LiveView showStandings showPick state={next} serverNow={now} />);

    const pops = container.querySelectorAll('.tv-pop-float');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.textContent).toBe('+2 Maya');

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
    render(<LiveView showStandings showPick state={state} serverNow={now} />);
    expect(screen.getByText('LOCKED — waiting for the result')).toBeTruthy();
    expect(screen.getByText('Will the next score be a 3-pointer?')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('59%')).toBeTruthy();
    expect(screen.getAllByText('2 picks').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Answer:/)).toBeNull();
    expect(screen.queryByText('Who scores first after halftime?')).toBeNull();
  });

  it('prefers the open prop over a locked one', () => {
    const locked: PropView = { ...liveFixture.activeProp!, id: 'prop-9', status: 'locked', realSecondsToLock: undefined };
    render(<LiveView showStandings showPick state={{ ...liveFixture, props: [locked, liveFixture.activeProp!] }} serverNow={now} />);
    expect(screen.getByText('0:12')).toBeTruthy();
    expect(screen.queryByText('LOCKED — waiting for the result')).toBeNull();
  });

  it('does not pop fantasy for events already present on the first load, even under StrictMode', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <StrictMode>
        <LiveView showStandings showPick state={liveFixture} serverNow={now} />
      </StrictMode>,
    );
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
    rerender(
      <StrictMode>
        <LiveView showStandings showPick state={{ ...liveFixture, serverNow: liveFixture.serverNow + 1000 }} serverNow={now} />
      </StrictMode>,
    );
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
  });
});
