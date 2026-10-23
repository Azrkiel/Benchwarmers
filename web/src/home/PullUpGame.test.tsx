import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReplaysPage } from './SecondaryPages';
import { PullUpGame } from './PullUpGame';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mockFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler();
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('Pull up a game', () => {
  it('imports the game, creates a party, joins both households and opens the TV', async () => {
    const calls = mockFetch({
      '/api/games/import': () => json({ game: { id: 'espn-1', title: 'Florida State Seminoles at Virginia Cavaliers' }, cached: false }, 201),
      '/api/parties': () => json({ party: { code: 'ABCD' }, code: 'ABCD' }, 201),
      '/api/parties/ABCD/join': () => json({ party: {} }),
    });
    const navigate = vi.fn();
    render(<PullUpGame navigate={navigate} />);
    const input = screen.getByLabelText('Which game?') as HTMLInputElement;
    expect(input.placeholder).toBe('UVA vs FSU 2025');
    expect((screen.getByRole('button', { name: 'Find game' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: ' UVA vs FSU 2025 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find game' }));
    expect(screen.getByRole('status').textContent).toBe('Finding game…');

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tv/ABCD'));
    expect(calls.map((c) => c.url)).toEqual(['/api/games/import', '/api/parties', '/api/parties/ABCD/join', '/api/parties/ABCD/join']);
    expect(calls[0].body).toEqual({ query: 'UVA vs FSU 2025' });
    expect(calls[1].body).toEqual({ crewId: 'sunday-crew', gameId: 'espn-1' });
    expect(calls.slice(2).map((c) => (c.body as { householdId: string }).householdId)).toEqual(['garcias', 'sams-place']);
    const link = screen.getByRole('link', { name: 'Open TV view for ABCD' });
    expect(link.getAttribute('href')).toBe('/tv/ABCD');
    expect(screen.getByRole('status').textContent).toContain('is ready');
  });

  it('shows the server message when the game cannot be found, and lets you try again', async () => {
    mockFetch({ '/api/games/import': () => json({ error: 'I found the teams but no game between them in 2023.', code: 'NOT_FOUND' }, 404) });
    const navigate = vi.fn();
    render(<PullUpGame navigate={navigate} />);
    fireEvent.change(screen.getByLabelText('Which game?'), { target: { value: 'UVA vs FSU 2023' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Find game' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no game between them in 2023'));
    expect((screen.getByLabelText('Which game?') as HTMLInputElement).value).toBe('UVA vs FSU 2023');
    expect(screen.getByLabelText('Which game?').getAttribute('aria-invalid')).toBe('true');
    expect(navigate).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Find game' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lives on its own replays page, off the homepage', () => {
    render(
      <MemoryRouter>
        <ReplaysPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Replay a game' })).toBeTruthy();
  });
});
