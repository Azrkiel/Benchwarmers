import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { RoomView } from '@shared/room';
import { basketballFixture } from './fixtures/basketball';
import { clearLineupDrafts, Lineup, sortPlayers } from './Lineup';

afterEach(() => { cleanup(); clearLineupDrafts(); });

function lobby(): RoomView {
  const view = basketballFixture('lobby', 2);
  return { ...view, me: { participantId: 'fx-0', name: 'Maya' } };
}
const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

it('shows position, team, salary, captain cost and projections, sorted by projection', () => {
  render(<Lineup view={lobby()} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  expect(names()[0]).toBe('Moses Adeyemi');
  const card = screen.getByRole('heading', { name: 'Moses Adeyemi' }).closest('article')!;
  expect(card.textContent).toContain('C · HAR');
  expect(card.textContent).toContain('$8,500');
  expect(card.textContent).toContain('Proj 24.2 pts');
  expect(within(card).getByRole('button', { name: 'Captain Moses Adeyemi' }).textContent).toContain('$12,750');
});

it('filters by team and position and sorts by salary with a stable tie order', () => {
  render(<Lineup view={lobby()} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'SUM' } });
  expect(names().every((name) => !['Moses Adeyemi', 'Jalen Reyes'].includes(name!))).toBe(true);
  fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'C' } });
  expect(names()).toEqual(['Viktor Halvorsen']);
  const players = lobby().players;
  const once = sortPlayers(players, 'salary').map((p) => p.id);
  expect(sortPlayers([...players].reverse(), 'salary').map((p) => p.id)).toEqual(once);
});

it('recalculates the whole cost on a captain change and keeps the selection when a pick would go over the cap', () => {
  render(<Lineup view={lobby()} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Moses Adeyemi' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Kai Thompson' }));
  expect(screen.getByText('$15,500 / $50,000')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Captain Moses Adeyemi' }));
  expect(screen.getByText('$19,750 / $50,000')).toBeTruthy();
  for (const name of ['Tommy Okafor', 'Jalen Reyes', 'Viktor Halvorsen']) fireEvent.click(screen.getByRole('button', { name: `Add ${name}` }));
  // Captain 12,750 + 7,000 + 7,000 + 6,500 + 6,000 = 39,250 -> 10,750 left.
  expect(screen.getByText('$10,750 left', { selector: 'strong' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Captain Kai Thompson' }));
  // The old captain leaves the lineup: 10,500 + 7,000 + 6,500 + 6,000.
  expect(screen.getByText('$30,000 / $50,000')).toBeTruthy();
});

it('keeps unsaved lobby edits when the editor unmounts and remounts', () => {
  const view = lobby();
  const { unmount } = render(<Lineup view={view} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Captain Kai Thompson' }));
  unmount();
  render(<Lineup view={view} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Captain Kai Thompson' }).getAttribute('aria-pressed')).toBe('true');
});

it('keeps the rejected lineup on screen when the save fails', async () => {
  const onSave = vi.fn(async () => undefined);
  render(<Lineup view={lobby()} busy={false} onSave={onSave} onAuto={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Captain Moses Adeyemi' }));
  for (const name of ['Kai Thompson', 'Eli Brooks', 'Danny Cho', 'Caleb Frost']) fireEvent.click(screen.getByRole('button', { name: `Add ${name}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }));
  expect(await screen.findByText('Lineup not saved. Try again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Captain Moses Adeyemi' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Remove Caleb Frost' })).toBeTruthy();
});

it('shows the server point breakdown on a locked lineup', () => {
  const view = basketballFixture('open', 2);
  const me = view.standings[0]!;
  me.roster = [{ playerId: 'har-c-34', captain: true, points: 13.35, rawPoints: 8.9, positionMultiplier: 1, captainMultiplier: 1.5 }, ...me.roster.slice(1).map((slot) => ({ ...slot, captain: false }))];
  const live = { ...view, me: { participantId: me.participantId, name: me.name, lineup: { captainId: 'har-c-34', flexIds: me.roster.slice(1).map((slot) => slot.playerId), salaryUsed: 40000 } } };
  render(<Lineup view={live} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
  expect(screen.getByText('8.90 raw × 1 position × 1.5 captain = 13.35')).toBeTruthy();
});
