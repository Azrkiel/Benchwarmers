import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HostRoomForm } from './RoomLanding';
import { RoomPage } from './RoomPage';
import { RoomTvPage } from './RoomTvPage';
import { FinalPodium, Leaderboard, Question, RoomScore } from './components';
import { Lineup } from './Lineup';
import { useRoom } from './useRoom';
import type { RoomView } from '@shared/room';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
import { fixture } from './roomFixture';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function showRoom(tv = false) {
  return render(<MemoryRouter initialEntries={[`/room/ABCD${tv ? '/tv' : ''}`]}><Routes><Route path="/room/:code" element={<RoomPage />} /><Route path="/room/:code/tv" element={<RoomTvPage />} /></Routes></MemoryRouter>);
}

describe('football rooms', () => {
  it('recovers from an unavailable room with Retry and offers code editing', async () => {
    let failed = true;
    vi.stubGlobal('fetch', vi.fn(async () => failed ? json({ error: 'Room temporarily unavailable' }, 503) : json(fixture)));
    showRoom(true);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('link', { name: 'Edit party code' }).getAttribute('href')).toBe('/?join=ABCD');
    failed = false;
    fireEvent.click(retry);
    await screen.findByRole('link', { name: /Join on your phone/ });
  });

  it('places the active pick before game details and final results before personal review', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...fixture, room: { ...fixture.room, phase: 'live' } })));
    showRoom();
    const pick = await screen.findByRole('heading', { name: fixture.question!.text });
    const game = screen.getByText('Game details', { selector: 'summary' });
    expect(pick.compareDocumentPosition(game) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Back on the shared screen until an explicit exit is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture)));
    showRoom(true);
    const join = await screen.findByRole('link', { name: /Join on your phone/ });
    fireEvent.keyDown(join, { key: 'Escape' });
    expect(screen.getByRole('link', { name: /Join on your phone/ })).toBeTruthy();
    expect(screen.getByText('Shared screen. Use Open phone view to leave.')).toBeTruthy();
  });

  it('moves TV focus toward the requested screen direction instead of DOM order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture)));
    showRoom(true);
    const join = await screen.findByRole('link', { name: /Join on your phone/ });
    const predictions = screen.getByRole('region', { name: 'Prediction details' });
    const standings = screen.getByRole('region', { name: 'Room leaderboard' });
    for (const [element, x, y] of [[join, 600, 0], [predictions, 0, 200], [standings, 600, 300]] as const) {
      const rect = { x, y, left: x, right: x + 120, top: y, bottom: y + 60, width: 120, height: 60, toJSON: () => ({}) };
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
      vi.spyOn(element, 'getClientRects').mockReturnValue([rect] as unknown as DOMRectList);
    }
    join.focus();
    fireEvent.keyDown(join, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(standings);
  });

  it('shows lineup slots and explains incomplete saves, with recovery from empty filters', () => {
    render(<Lineup view={fixture} busy={false} onSave={vi.fn()} onAuto={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Selected lineup' })).toBeTruthy();
    expect(screen.getByText('Choose a captain and 4 flex players')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no matching name' } });
    expect(screen.getByText('No players match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Captain Player 0' })).toBeTruthy();
  });

  it('does not label unrelated host activity as a lineup save', () => {
    render(<Lineup view={fixture} busy onSave={vi.fn()} onAuto={vi.fn()} />);
    expect(screen.getByText('Choose a captain and 4 flex players')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();
  });

  it('keeps save failure beside the lineup action for retry', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Lineup view={fixture} busy={false} onSave={onSave} onAuto={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Captain Player 0' }));
    for (let i = 1; i <= 4; i++) fireEvent.click(screen.getByRole('button', { name: `Add Player ${i}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }));
    expect(await screen.findByText('Lineup not saved. Try again.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save lineup' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks replay source and presents shared-screen picks as information', () => {
    render(<><RoomScore view={{ ...fixture, room: { ...fixture.room, phase: 'live' } }} /><Question view={fixture} tv /></>);
    expect(screen.getByText('Replay')).toBeTruthy();
    expect(screen.getByText('Playing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Touchdown/ })).toBeNull();
    expect(screen.getByText('Make picks on your phone')).toBeTruthy();
    expect(screen.getByText('Closes in 0:10')).toBeTruthy();
  });

  it('announces a closing threshold without announcing each timer tick', () => {
    const live: RoomView = { ...fixture, room: { ...fixture.room, phase: 'live' } };
    const { rerender } = render(<Question view={live} />);
    const announcement = screen.getByRole('status', { name: 'Pick window status' });
    expect(announcement.textContent).toBe('');
    rerender(<Question view={{ ...live, question: { ...live.question!, remainingMs: 4000 } }} />);
    expect(announcement.textContent).toBe('Picks close in under five seconds');
    rerender(<Question view={{ ...live, question: { ...live.question!, remainingMs: 3000 } }} />);
    expect(announcement.textContent).toBe('Picks close in under five seconds');
  });

  it('keeps an attempted pick visible and retries a failed submission', async () => {
    const onPick = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Question view={{ ...fixture, room: { ...fixture.room, phase: 'live' } }} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /Touchdown/ }));
    expect(await screen.findByText('Pick not saved. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Touchdown/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Retry pick' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2));
    expect(onPick).toHaveBeenLastCalledWith('q1', 'TD');
  });

  it('shows tied winners and uses equal season points as equal display ranks', () => {
    const tied = { ...fixture, standings: [fixture.standings[0], { ...fixture.standings[0], participantId: 'person-2', name: 'Alex' }], season: { ...fixture.season, standings: ['Taylor', 'Alex'].map((name, i) => ({ participantId: String(i), name, points: 10, fantasyPoints: 5, predictionPoints: 5, nightsPlayed: 1, nightsWon: 1 })) } };
    render(<><FinalPodium view={tied} /><Leaderboard view={tied} season /></>);
    expect(screen.getByText('Tied winners')).toBeTruthy();
    const rows = within(screen.getByRole('region', { name: 'Season leaderboard' })).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.rm-row-rank')?.textContent)).toEqual(['1', '1']);
  });

  it('creates a room, keeps the host secret out of the URL and stores it privately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ view: fixture, hostToken: 'host-private' })));
    render(<MemoryRouter><Routes><Route path="/" element={<HostRoomForm />} /><Route path="/room/:code" element={<p>Room opened</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('radio', { name: /Football/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));
    await screen.findByText('Room opened');
    expect(localStorage.getItem('bw.room.ABCD')).toContain('host-private');
    expect(fetch).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({ method: 'POST' }));
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).not.toContain('gameId');
  });

  it('sends the basketball game id and opens the basketball room', async () => {
    const basketball = { ...fixture, game: { ...fixture.game, sport: 'basketball' } };
    vi.stubGlobal('fetch', vi.fn(async () => json({ view: basketball, hostToken: 'host-private' })));
    render(<MemoryRouter><Routes><Route path="/" element={<HostRoomForm />} /><Route path="/room/:code" element={<p>Room opened</p>} /></Routes></MemoryRouter>);
    expect((screen.getByRole('radio', { name: /Basketball/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));
    await screen.findByText('Room opened');
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).toContain('"gameId":"harbor-vs-summit"');
  });

  it('explains GAME_NOT_SUPPORTED without creating anything', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Game is not supported', code: 'GAME_NOT_SUPPORTED' }, 400)));
    render(<MemoryRouter><Routes><Route path="/" element={<HostRoomForm />} /><Route path="/room/:code" element={<p>Room opened</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Basketball isn't available on this server yet. Choose another game.");
    expect(localStorage.getItem('bw.room.ABCD')).toBeNull();
  });

  it('says so when an older server ignores the basketball choice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ view: fixture, hostToken: 'host-private' })));
    render(<MemoryRouter><Routes><Route path="/" element={<HostRoomForm />} /><Route path="/room/:code" element={<p>Room opened</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Create party' }));
    expect((await screen.findByRole('alert')).textContent).toContain("can't host basketball yet");
    expect(screen.getByRole('link', { name: 'Open ABCD' })).toBeTruthy();
    expect(screen.queryByText('Room opened')).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Auto-pick lineup' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Try that again.');
    fireEvent.click(screen.getByRole('button', { name: 'Auto-pick lineup' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Captain Player 0' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true'));
  });

  it('shows a shared-screen join address and all 32 real participants in a scrollable leaderboard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...fixture, room: { ...fixture.room, participantCount: 32 }, standings: Array.from({ length: 32 }, (_, i) => ({ ...fixture.standings[0], participantId: `u${i}`, name: `Fan ${i + 1}`, rank: i + 1 })) })));
    showRoom(true);
    expect(await screen.findByText('32 players in the room')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Room leaderboard' })).getByText('Fan 32')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Room leaderboard' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('link', { name: /Join on your phone/ }).getAttribute('href')).toContain('/room/ABCD');
    expect(screen.getByRole('region', { name: 'Latest football play' }).getAttribute('tabindex')).toBe('0');
    fireEvent.click(screen.getByText('Game details', { selector: 'summary' }));
    const field = screen.getByRole('region', { name: 'Football field' });
    const endzones = field.querySelectorAll('.rm-endzone');
    // Away end zone on the left, matching the scorebug (away left, home right).
    expect([...endzones].map((zone) => zone.textContent)).toEqual(['AWY', 'HOM']);
    expect(screen.getByRole('region', { name: 'Prediction details' }).getAttribute('tabindex')).toBe('0');
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

    fireEvent.click(hostSummary);
    expect(details.open).toBe(true);
    fireEvent.keyDown(hostSummary, { key: 'Backspace' });
    expect(details.open).toBe(false);
  });

  it('leaves typed voice commands available when speech recognition is unsupported', async () => {
    localStorage.setItem('bw.room.ABCD', JSON.stringify({ participantToken: 'player-private' }));
    const request = vi.fn(async (url: string) => json(url.endsWith('/assistant') ? { reply: 'Your lineup is ready.', view: fixture } : fixture));
    vi.stubGlobal('fetch', request);
    showRoom();
    fireEvent.change(await screen.findByLabelText('Ask assistant'), { target: { value: 'auto lineup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
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

  it('keeps full 60-character names available on standings rows and option labels', () => {
    const long = 'Bartholomew-Wolfeschlegelsteinhausen-Extremelylongname-X1'.padEnd(60, 'z');
    expect(long).toHaveLength(60);
    const view = { ...fixture, standings: [{ ...fixture.standings[0], name: long }], question: { ...fixture.question!, options: [{ id: 'TD', label: long, basePoints: 10 }] } };
    render(<><Leaderboard view={view} /><Question view={view} /></>);
    const titled = document.querySelectorAll(`[title="${long}"]`);
    expect(titled).toHaveLength(2);
    titled.forEach((node) => { expect(node.textContent).toContain(long); expect(node.classList.contains('rm-clamp')).toBe(true); });
  });

  it('shows a join QR with the full URL only in the lobby, keeping code and short URL as text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture)));
    const { container, unmount } = showRoom(true);
    const link = await screen.findByRole('link', { name: /Join on your phone/ });
    expect(link.textContent).toContain('ABCD');
    const qr = container.querySelector('.rm-join-qr');
    expect(qr?.getAttribute('aria-hidden')).toBe('true');
    expect(qr?.querySelector('svg')).toBeTruthy();
    unmount();
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...fixture, room: { ...fixture.room, phase: 'final' } })));
    const final = showRoom(true);
    await screen.findByRole('link', { name: /Join on your phone/ });
    expect(final.container.querySelector('.rm-join-qr')).toBeNull();
  });
});
