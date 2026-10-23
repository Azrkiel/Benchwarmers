import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { RoomView } from '@shared/room';
import { clearLineupDrafts } from './Lineup';
import { defaultPhoneView, RoomPage } from './RoomPage';
import { fixture } from './roomFixture';

afterEach(() => { cleanup(); clearLineupDrafts(); vi.unstubAllGlobals(); localStorage.clear(); });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
function show(view: RoomView, path = '/room/ABCD') {
  localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
  vi.stubGlobal('fetch', vi.fn(async () => json(view)));
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/room/:code" element={<RoomPage />} /></Routes></MemoryRouter>);
}

it('opens on the view that matches the phase or the requested view', () => {
  expect(defaultPhoneView('lobby', null)).toBe('lineups');
  expect(defaultPhoneView('live', null)).toBe('game');
  expect(defaultPhoneView('final', null)).toBe('results');
  expect(defaultPhoneView('live', 'season')).toBe('standings');
  expect(defaultPhoneView('live', 'results')).toBe('game');
});

it('switches between Game, My lineup and Standings, keeping unsaved lobby edits', async () => {
  show(fixture);
  expect((await screen.findByRole('tab', { name: 'My lineup' })).getAttribute('aria-selected')).toBe('true');
  expect((screen.getByRole('tab', { name: 'Results' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Captain Player 0' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
  expect(screen.getByRole('region', { name: 'Room leaderboard' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Your lineup' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'My lineup' }));
  expect(screen.getByRole('button', { name: 'Captain Player 0' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByLabelText('Ask assistant')).toBeTruthy();
});

it('puts the live call first on the Game view and opens season from ?view=season', async () => {
  show({ ...fixture, room: { ...fixture.room, phase: 'live' } });
  expect(await screen.findByRole('heading', { name: fixture.question!.text })).toBeTruthy();
  cleanup();
  show({ ...fixture, room: { ...fixture.room, phase: 'live' }, season: { ...fixture.season, standings: [{ participantId: 'person-1', name: 'Taylor', points: 12, fantasyPoints: 6, predictionPoints: 6, nightsPlayed: 1, nightsWon: 1 }] } }, '/room/ABCD?view=season');
  expect(await screen.findByRole('region', { name: 'Season leaderboard' })).toBeTruthy();
});
