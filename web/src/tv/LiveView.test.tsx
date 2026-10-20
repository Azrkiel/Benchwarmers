import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { EventView, PartyStateResponse } from '@shared/types';
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
    expect(screen.getByText(/top of the bench/i)).toBeTruthy();
    const leaderName = liveFixture.standings.find((r) => r.rank === 1)!.name;
    expect(leaderName).toBe('Maya');
    expect(screen.getByTestId('leader').textContent).toContain('Maya');
    expect(screen.getAllByText('▲').length).toBeGreaterThan(0);
    expect(screen.getAllByText('▼').length).toBeGreaterThan(0);
    expect(screen.getAllByText('142.5').length).toBeGreaterThan(0);
    expect(screen.getByText('🔥3')).toBeTruthy();
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

    const pops = container.querySelectorAll('.tv-pop-float');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.textContent).toBe('+2 Maya');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelectorAll('.tv-pop-float')).toHaveLength(0);
  });
});
