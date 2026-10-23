import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ReplaysPage, SeasonPage, ToolsPage } from './SecondaryPages';

afterEach(() => { cleanup(); localStorage.clear(); });

function Where() { const location = useLocation(); return <p>At {location.pathname}{location.search} as {(location.state as { joinName?: string } | null)?.joinName}</p>; }
function home(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<HomePage />} /><Route path="/room/:code" element={<Where />} /></Routes></MemoryRouter>);
}

it('shows one hero with host and join actions and no developer tools', () => {
  home();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Host a party' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Join a party' })).toBeTruthy();
  expect(screen.queryByText('Demo tools', { selector: 'summary' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Demo tools' }).getAttribute('href')).toBe('/tools');
  expect(screen.getByRole('link', { name: 'Replay a real game' }).getAttribute('href')).toBe('/replays');
});

it('opens the host panel with basketball selected and restores focus on Escape', async () => {
  home();
  const host = screen.getByRole('button', { name: 'Host a party' });
  fireEvent.click(host);
  expect(host.getAttribute('aria-expanded')).toBe('true');
  expect((screen.getByRole('radio', { name: /Basketball/ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('Fictional basketball replay')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('group', { name: 'Host a party' }), { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Host a party' })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(host));
});

it('joins with a code and name by keyboard submission', async () => {
  home();
  fireEvent.click(screen.getByRole('button', { name: 'Join a party' }));
  fireEvent.change(screen.getByLabelText('Party code'), { target: { value: 'ab-c1' } });
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Maya' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Join a party' }));
  expect(await screen.findByText('At /ROOM/ABC1 as Maya'.replace('/ROOM', '/room'))).toBeTruthy();
});

it('reopens join with the typed code after an invalid room', () => {
  home('/?join=NOPE1');
  expect((screen.getByLabelText('Party code') as HTMLInputElement).value).toBe('NOPE1');
});

it('keeps secondary destinations reachable', () => {
  render(<MemoryRouter><ToolsPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /TV layout preview/ }).getAttribute('href')).toContain('/tv2/');
  cleanup();
  render(<MemoryRouter><ReplaysPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Replay a game', level: 2 })).toBeTruthy();
});

it('season asks for a room without a saved identity and lists saved rooms otherwise', () => {
  render(<MemoryRouter><SeasonPage /></MemoryRouter>);
  expect(screen.queryByRole('list', { name: 'Your rooms' })).toBeNull();
  expect(screen.getByLabelText('Party code')).toBeTruthy();
  cleanup();
  localStorage.setItem('bw.room.XYZ9', JSON.stringify({ participantToken: 'private' }));
  render(<MemoryRouter><SeasonPage /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /XYZ9/ });
  expect(link.getAttribute('href')).toBe('/room/XYZ9?view=season');
  expect(document.body.textContent).not.toContain('private');
});
