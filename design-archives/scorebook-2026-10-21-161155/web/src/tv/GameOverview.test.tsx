import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { liveFixture, finalFixture } from '../lib/fixtures';
import { GameOverview } from './GameOverview';

afterEach(cleanup);

describe('GameOverview', () => {
  it('shows the latest room ranking and distinguishes the leader without color', () => {
    const { rerender } = render(<GameOverview state={liveFixture} />);
    const room = screen.getByRole('region', { name: 'Around the room' });
    expect(within(room).getAllByRole('article')[0]!.textContent).toContain('Maya');
    expect(within(room).getAllByText('Leading')).toHaveLength(1);
    const standings = liveFixture.standings.map((row) => ({ ...row, rank: row.name === 'Sam' ? 1 : row.name === 'Maya' ? 2 : row.rank }));
    rerender(<GameOverview state={{ ...liveFixture, standings }} />);
    expect(within(room).getAllByRole('article')[0]!.textContent).toContain('Sam');
  });

  it('shows the resolved answer instead of treating the last question as open', () => {
    render(<GameOverview state={{ ...finalFixture, activeProp: undefined, props: [], lastResolvedProp: liveFixture.lastResolvedProp }} />);
    expect(screen.getByText('Last call')).toBeTruthy();
    expect(screen.getByText('✓ Correct')).toBeTruthy();
    expect(screen.queryByText('The next call')).toBeNull();
  });

  it('explains an empty room and the wait for a new question', () => {
    render(<GameOverview state={{ ...liveFixture, standings: [], props: [], activeProp: undefined, lastResolvedProp: undefined }} />);
    expect(screen.getByText('Your crew will appear here when they join the party.')).toBeTruthy();
    expect(screen.getByText('The next question will appear here. Open Picks for updates.')).toBeTruthy();
  });
});
