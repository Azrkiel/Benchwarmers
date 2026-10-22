import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomLanding } from './RoomLanding';
import { RoomPage } from './RoomPage';
import { RoomTvPage } from './RoomTvPage';
import { useRoom } from './useRoom';
import type { RoomView } from '@shared/room';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, teamId: 'h', teamShort: 'HOM', position: ['QB', 'RB', 'WR', 'OL', 'LS', 'P'][i], role: 'Fictional player', salary: i === 5 ? 40000 : 8000, multiplier: 1, stats: {}, rawPoints: 0, points: 0, statLine: 'No stats yet' }));
export const fixture = {
  room: { code: 'ABCD', name: 'Sunday room', seasonId: 'season-1', phase: 'lobby', speed: 1, participantCount: 1, createdAt: 1 },
  game: { title: 'Hogs at Owls', home: { id: 'h', short: 'HOM', name: 'Hogs', color: '#a34', score: 0 }, away: { id: 'a', short: 'AWY', name: 'Owls', color: '#34a', score: 0 }, quarter: 1, clock: '15:00', situation: 'Kickoff', ballOn: 'HOM 25', fieldX: 25, possession: 'h', driveNumber: 1, driveCount: 10, recentPlays: [], isScripted: true },
  rules: { salaryCap: 50000, flexSlots: 4, captainMultiplier: 1.5, positionMultipliers: {}, pickFactorCap: 5 }, players,
  standings: [{ participantId: 'person-1', name: 'Taylor', rank: 1, total: 0, fantasyPoints: 0, predictionPoints: 0, streak: 0, roster: [] }],
  me: { participantId: 'person-1', name: 'Taylor' }, season: { id: 'season-1', name: 'Demo season', standings: [] },
  question: { id: 'q1', kind: 'drive', text: 'How does this drive end?', opensAt: 1, locksAt: 99999, remainingMs: 10000, options: [{ id: 'TD', label: 'Touchdown', basePoints: 10 }], pickCounts: {}, status: 'open' },
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function showRoom(tv = false) {
  return render(<MemoryRouter initialEntries={[`/room/ABCD${tv ? '/tv' : ''}`]}><Routes><Route path="/room/:code" element={<RoomPage />} /><Route path="/room/:code/tv" element={<RoomTvPage />} /></Routes></MemoryRouter>);
}

describe('football rooms', () => {
  it('creates a room, keeps the host secret out of the URL and stores it privately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ view: fixture, hostToken: 'host-private' })));
    render(<MemoryRouter><Routes><Route path="/" element={<RoomLanding />} /><Route path="/room/:code" element={<p>Room opened</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Create football room' }));
    await screen.findByText('Room opened');
    expect(localStorage.getItem('bw.room.ABCD')).toContain('host-private');
    expect(fetch).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({ method: 'POST' }));
  });

  it('joins with a season identity and remembers the returned player credential', async () => {
    localStorage.setItem('bw.season.season-1', 'returning-token');
    const request = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? json({ view: fixture, participantId: 'person-1', participantToken: 'player-private' }) : json(fixture));
    vi.stubGlobal('fetch', request);
    showRoom();
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Taylor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    await screen.findByRole('heading', { name: 'Your lineup' });
    expect(request.mock.calls.some(([, init]) => String(init?.body).includes('returning-token'))).toBe(true);
    expect(localStorage.getItem('bw.season.season-1')).toBe('player-private');
  });

  it('builds a five-player lineup, applies captain salary, saves and submits a pick', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    let started = false;
    const request = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/lineup')) started = true;
      return json(started ? { ...fixture, room: { ...fixture.room, phase: 'live' } } : fixture);
    });
    vi.stubGlobal('fetch', request);
    showRoom();
    await screen.findByRole('heading', { name: 'Your lineup' });
    fireEvent.click(screen.getByRole('button', { name: 'Captain Player 0' }));
    for (let i = 1; i <= 4; i++) fireEvent.click(screen.getByRole('button', { name: `Add Player ${i}` }));
    expect(screen.getByText('$44,000 / $50,000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }));
    await waitFor(() => expect(request.mock.calls.some(([url, init]) => url.endsWith('/lineup') && String(init?.body).includes('"captainId":"p0"'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Touchdown/ }));
    await waitFor(() => expect(request.mock.calls.some(([url, init]) => url.endsWith('/picks') && String(init?.body).includes('"optionId":"TD"'))).toBe(true));
  });

  it('blocks an over-cap choice and offers all specialist position filters', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture)));
    showRoom();
    await screen.findByRole('heading', { name: 'Your lineup' });
    fireEvent.click(screen.getByRole('button', { name: 'Captain Player 5' }));
    expect(screen.getByRole('alert').textContent).toContain('salary cap');
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'LS' } });
    expect(screen.getByText('Player 4')).toBeTruthy();
    expect(screen.queryByText('Player 0')).toBeNull();
  });

  it('recovers from mutation failure, then uses the authoritative automatic lineup', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && fail) { fail = false; return json({ error: 'Try that again.' }, 503); }
      return json({ ...fixture, me: { ...fixture.me, lineup: { captainId: 'p0', flexIds: ['p1', 'p2', 'p3', 'p4'], salaryUsed: 44000 } } });
    }));
    showRoom();
    fireEvent.click(await screen.findByRole('button', { name: 'Auto balanced' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Try that again.');
    fireEvent.click(screen.getByRole('button', { name: 'Auto balanced' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Captain Player 0' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true'));
  });

  it('shows a shared-screen join address and all 32 real participants in a scrollable leaderboard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...fixture, room: { ...fixture.room, participantCount: 32 }, standings: Array.from({ length: 32 }, (_, i) => ({ ...fixture.standings[0], participantId: `u${i}`, name: `Fan ${i + 1}`, rank: i + 1 })) })));
    showRoom(true);
    expect(await screen.findByText('32 players in the room')).toBeTruthy();
    expect(screen.getByText('Fan 32')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Room leaderboard' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('link', { name: /Join on your phone/ }).getAttribute('href')).toContain('/room/ABCD');
    const field = screen.getByRole('region', { name: 'Football field' });
    const endzones = field.querySelectorAll('.rm-endzone');
    expect([...endzones].map((zone) => zone.textContent)).toEqual(['HOM', 'AWY']);
    expect(screen.getByRole('region', { name: 'Prediction details' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('region', { name: 'Recent football plays' }).getAttribute('tabindex')).toBe('0');
  });

  it('opens TV host controls by remote and Back dismisses them before leaving the screen', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ hostToken: 'host-private' }));
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture)));
    showRoom(true);
    const hostSummary = await screen.findByText('Host controls', { selector: 'summary' });
    fireEvent.click(hostSummary);
    const details = hostSummary.closest('details')!;
    expect(details.open).toBe(true);
    expect(within(details).getByRole('button', { name: 'Start game' })).toBeTruthy();
    fireEvent.keyDown(hostSummary, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(hostSummary);
  });

  it('leaves typed voice commands available when speech recognition is unsupported', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    const request = vi.fn(async (url: string) => json(url.endsWith('/assistant') ? { reply: 'Your lineup is ready.', view: fixture } : fixture));
    vi.stubGlobal('fetch', request);
    showRoom();
    fireEvent.change(await screen.findByLabelText('Ask the room assistant'), { target: { value: 'auto lineup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    expect(await screen.findByText('Your lineup is ready.')).toBeTruthy();
    expect(request.mock.calls.some(([url]) => url.endsWith('/assistant'))).toBe(true);
  });

  it('explains an invalid stored season identity and lets the player explicitly create a fresh seat', async () => {
    localStorage.setItem('bw.season.season-1', 'invalid-old-token');
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return json(fixture);
      const body = JSON.parse(String(init.body));
      return body.participantToken ? json({ error: 'Invalid season identity' }, 401) : json({ view: fixture, participantToken: 'fresh-token' });
    });
    vi.stubGlobal('fetch', request);
    showRoom();
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Taylor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Your previous season history will not link');
    expect(localStorage.getItem('bw.season.season-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join as new player' }));
    await screen.findByRole('heading', { name: 'Your lineup' });
    expect(localStorage.getItem('bw.season.season-1')).toBe('fresh-token');
  });

  it('keeps unsaved personal choices when a host speed change returns a public view', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private', hostToken: 'host-private' }));
    const { me: _me, ...publicView } = fixture;
    const request = vi.fn(async (url: string) => json(url.endsWith('/host') ? publicView : fixture));
    vi.stubGlobal('fetch', request);
    showRoom();
    fireEvent.click(await screen.findByRole('button', { name: 'Captain Player 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay 2 times speed' }));
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByRole('button', { name: 'Join room' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Captain Player 0' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('disables prediction submission while the host has paused', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...fixture, room: { ...fixture.room, phase: 'paused' } })));
    showRoom();
    expect((await screen.findByRole('button', { name: /Touchdown/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('room polling', () => {
  it('serializes polls, cancels on unmount, and ignores a response older than a mutation', async () => {
    vi.useFakeTimers();
    let completePoll!: (response: Response) => void;
    let pollSignal: AbortSignal | undefined;
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ ...fixture, room: { ...fixture.room, name: 'Fresh state' } });
      pollSignal = init?.signal as AbortSignal;
      return await new Promise<Response>((resolve) => { completePoll = resolve; });
    });
    vi.stubGlobal('fetch', request);
    const hook = renderHook(() => useRoom('ABCD'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { await hook.result.current.mutate('host', { hostToken: 'secret', action: 'start' }); });
    await act(async () => { completePoll(json(fixture)); });
    expect(hook.result.current.view?.room.name).toBe('Fresh state');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(request).toHaveBeenCalledTimes(3);
    hook.unmount();
    expect(pollSignal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('clears the reconnecting banner and network error after a successful poll', async () => {
    vi.useFakeTimers();
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async () => { if (fail) throw new Error('Network offline'); return json(fixture); }));
    const hook = renderHook(() => useRoom('ABCD'));
    await act(async () => {});
    expect(hook.result.current.stale).toBe(true);
    expect(hook.result.current.error).toBe('Network offline');
    fail = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(hook.result.current.stale).toBe(false);
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.view?.room.code).toBe('ABCD');
  });

  it('uses the destination room credential when switching rooms', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'token-a' }));
    localStorage.setItem('bw.room.EFGH', JSON.stringify({ participantToken: 'token-b' }));
    const request = vi.fn(async () => json(fixture as unknown as RoomView));
    vi.stubGlobal('fetch', request);
    const hook = renderHook(({ code }) => useRoom(code), { initialProps: { code: 'ABCD' } });
    await act(async () => {});
    hook.rerender({ code: 'EFGH' });
    await act(async () => {});
    expect(request).toHaveBeenLastCalledWith('/api/rooms/EFGH', expect.objectContaining({ headers: { Authorization: 'Bearer token-b' } }));
  });
});
