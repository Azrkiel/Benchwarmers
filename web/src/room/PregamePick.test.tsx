import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomRequestError } from './api';
import { PregamePick } from './PregamePick';
import type { PregamePickState } from './points/types';

afterEach(cleanup);
const home = { id: 'harbor', name: 'Harbor Hawks', short: 'HAR', color: '#1F7AE0' };
const away = { id: 'summit', name: 'Summit Foxes', short: 'SUM', color: '#E8642C' };
const state = (over: Partial<PregamePickState> = {}): PregamePickState => ({ questionId: 'pregame', closesAt: Date.now() + 60_000, status: 'open', resolutionRule: 'The final score of the game decides it, not a market settlement.', crowd: { home: 3, away: 1 }, ...over });

it('labels room picks and the market reference separately, with source and time', () => {
  render(<PregamePick state={state({ reference: { source: 'Example market', sourceUrl: 'https://example.test/m/1', observedAt: Date.UTC(2026, 9, 23, 17, 0), home: 0.58, away: 0.42, method: 'midpoint of bid and ask', stale: false } })} home={home} away={away} />);
  const harbor = screen.getByText('Harbor Hawks').closest('div')!;
  expect(harbor.textContent).toContain('Room picks3 (75%)');
  expect(harbor.textContent).toContain('Market reference58%');
  expect(screen.getByRole('link', { name: 'Example market' }).getAttribute('href')).toBe('https://example.test/m/1');
  expect(document.body.textContent).toContain('It is an outside price, not our prediction.');
  expect(document.body.textContent).toContain('How it\'s decided: The final score of the game decides it');
});

it('says when a fictional game has no market and still allows a free pick', async () => {
  const onPick = vi.fn(async () => undefined);
  render(<PregamePick state={state()} home={home} away={away} onPick={onPick} />);
  expect(document.body.textContent).toContain('No market reference for this game');
  expect(screen.getAllByText('None')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Pick HAR' }));
  expect(onPick).toHaveBeenCalledWith('home');
});

it('closes at the server cutoff and reports a late pick as not accepted', async () => {
  render(<PregamePick state={state({ closesAt: Date.now() - 1 })} home={home} away={away} onPick={vi.fn()} />);
  expect(screen.getByText('Closed at tip-off')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Pick HAR' }) as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  render(<PregamePick state={state()} home={home} away={away} onPick={async () => { throw new RoomRequestError('late', 409, 'PICKS_LOCKED'); }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pick SUM' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Picks closed before tip-off. Not accepted.');
});

it('shows void and the winner without inventing outcomes', () => {
  render(<PregamePick state={state({ status: 'void' })} home={home} away={away} />);
  expect(screen.getByText('Void · no points')).toBeTruthy();
  cleanup();
  render(<PregamePick state={state({ status: 'resolved', result: 'home', myPick: 'home' })} home={home} away={away} />);
  expect(screen.getByText('✓ Won')).toBeTruthy();
});
