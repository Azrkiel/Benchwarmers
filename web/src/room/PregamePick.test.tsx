import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PregameView } from '@shared/room';
import { RoomRequestError } from './api';
import { PregamePick } from './PregamePick';

afterEach(cleanup);
const teams = [{ id: 'summit', name: 'Summit Foxes', short: 'SUM', color: '#E8642C' }, { id: 'harbor', name: 'Harbor Hawks', short: 'HAR', color: '#1F7AE0' }];
const pregame = (over: Partial<PregameView> = {}): PregameView => ({
  id: 'pregame-winner', status: 'open', acceptingPicks: true, text: 'Who wins tonight?',
  options: [{ id: 'summit', label: 'Summit Foxes' }, { id: 'harbor', label: 'Harbor Hawks' }], pickCounts: { harbor: 3, summit: 1 },
  cutoff: 'replay_start', correctPoints: 10, resolutionRule: 'The replay final score decides the winner; a tied final voids the pick.', ...over,
});
const fictional = { status: 'unavailable' as const, reason: 'fictional_game' as const, label: 'Fictional game', reference: null, commitmentQuotingEnabled: false as const };

it('labels room picks and the (absent) market reference separately for a fictional game', () => {
  render(<PregamePick pregame={pregame()} teams={teams} reference={fictional} />);
  const harbor = screen.getByText('Harbor Hawks').closest('div')!;
  expect(harbor.textContent).toContain('Room picks3 (75%)');
  expect(harbor.textContent).toContain('Market referenceNone');
  expect(document.body.textContent).toContain('No market reference: these are fictional teams.');
  expect(document.body.textContent).toContain('Correct pick: +10 points. How it’s decided'.replace('’', "'"));
  expect(screen.getByText('Open until the host starts the game')).toBeTruthy();
});

it('shows an outside market price with source and time when one is mapped', () => {
  render(<PregamePick pregame={pregame()} teams={teams} reference={{ status: 'available', reference: { source: 'Example market', sourceUrl: 'https://example.test/m/1', observedAt: Date.UTC(2026, 9, 23, 17, 0), method: 'midpoint of bid and ask', stale: false, prices: { harbor: 0.58, summit: 0.42 } } }} />);
  expect(screen.getByText('Harbor Hawks').closest('div')!.textContent).toContain('Market reference58%');
  expect(screen.getByRole('link', { name: 'Example market' }).getAttribute('href')).toBe('https://example.test/m/1');
  expect(document.body.textContent).toContain('It is an outside price, not our prediction.');
});

it('picks by team id and marks the reader\'s own pick', async () => {
  const onPick = vi.fn(async () => undefined);
  render(<PregamePick pregame={pregame()} teams={teams} myPick="summit" onPick={onPick} />);
  expect(screen.getByRole('button', { name: '✓ SUM picked' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Pick HAR' }));
  expect(onPick).toHaveBeenCalledWith('harbor');
});

it('closes when the game starts and reports a late pick as not accepted', async () => {
  render(<PregamePick pregame={pregame({ status: 'locked', acceptingPicks: false, lockedAt: 1 })} teams={teams} onPick={vi.fn()} />);
  expect(screen.getByText('Closed at tip-off')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Pick HAR' }) as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  render(<PregamePick pregame={pregame()} teams={teams} onPick={async () => { throw new RoomRequestError('late', 409, 'PICKS_LOCKED'); }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pick SUM' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Picks closed when the game started. Not accepted.');
});

it('shows void and the winner from the server result', () => {
  render(<PregamePick pregame={pregame({ status: 'void', acceptingPicks: false, voidReason: 'Tied final' })} teams={teams} />);
  expect(screen.getByText('Void · Tied final · no points')).toBeTruthy();
  cleanup();
  render(<PregamePick pregame={pregame({ status: 'resolved', acceptingPicks: false, result: { optionId: 'harbor', explanation: 'Harbor Hawks won 57-56.' } })} teams={teams} myPick="harbor" />);
  expect(screen.getByText('✓ Won')).toBeTruthy();
  expect(screen.getByText('Result: Harbor Hawks won 57-56.')).toBeTruthy();
});
