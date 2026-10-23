import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { liveFixture } from '../lib/fixtures';
import { RostersView } from './RostersView';
import { worstPerformer } from './rosters';

afterEach(cleanup);

describe('RostersView', () => {
  it('renders 4 members, 12 players and one benchwarmer tag in the worst owner column', () => {
    const { container, getByRole, getByText, rerender } = render(<RostersView state={liveFixture} serverNow={() => 0} />);
    expect(getByRole('heading', { name: 'Rosters' })).toBeTruthy();
    for (const s of liveFixture.standings) expect(getByText(s.name)).toBeTruthy();
    expect(container.querySelectorAll('.tv-roster-player').length).toBe(12);
    expect(container.querySelectorAll('.tv-benchwarmer-tag')).toHaveLength(0);
    rerender(<RostersView state={{ ...liveFixture, party: { ...liveFixture.party, status: 'final' } }} serverNow={() => 0} />);
    const tags = container.querySelectorAll('.tv-benchwarmer-tag');
    expect(tags.length).toBe(1);
    expect(tags[0]!.textContent).toContain('Benchwarmer');
    expect(tags[0]!.textContent).toBe('Benchwarmer');
    const w = worstPerformer(liveFixture)!;
    expect(tags[0]!.closest('.tv-roster-col')!.getAttribute('data-member')).toBe(w.memberId);
    expect(tags[0]!.closest('.tv-roster-player')!.getAttribute('data-player')).toBe(w.playerId);
  });

  it('shows the jersey number in the meta line for Big Mo', () => {
    const { container } = render(<RostersView state={liveFixture} serverNow={() => 0} />);
    const card = container.querySelector('[data-player="har-c-34"]');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('Big Mo');
    expect(card!.textContent).toContain('#34');
  });

  const many = (n: number) => ({
    ...liveFixture,
    standings: Array.from({ length: n }, (_, i) => ({ ...liveFixture.standings[i % 4]!, memberId: `m${i}`, name: `Player ${i}`, rank: i + 1 })),
  });

  it('pages at most 4 members with wrap-around buttons and a status', () => {
    const { container, rerender } = render(<RostersView state={many(6)} serverNow={() => 0} />);
    expect(container.querySelectorAll('.tv-roster-col')).toHaveLength(4);
    expect(screen.getByRole('status').textContent).toBe('Players 1-4 of 6');
    const next = screen.getByRole('button', { name: 'Next' });
    const prev = screen.getByRole('button', { name: 'Previous' });
    expect(next.hasAttribute('data-tv-action')).toBe(true);
    expect(prev.hasAttribute('data-tv-action')).toBe(true);
    fireEvent.click(next);
    expect(container.querySelectorAll('.tv-roster-col')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('Players 5-6 of 6');
    // live update keeps the viewed page
    rerender(<RostersView state={many(7)} serverNow={() => 0} />);
    expect(screen.getByRole('status').textContent).toBe('Players 5-7 of 7');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status').textContent).toBe('Players 1-4 of 7');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('status').textContent).toBe('Players 5-7 of 7');
  });

  it('hides the pager with four or fewer members', () => {
    render(<RostersView state={liveFixture} serverNow={() => 0} />);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });
});
