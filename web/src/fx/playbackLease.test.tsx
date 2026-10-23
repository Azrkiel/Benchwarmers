import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { SharedAudio } from './audio';
import { usePlaybackLease } from './playbackLease';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function ctx() { const node = () => ({ connect: vi.fn(), gain: { value: 0 }, frequency: { value: 0 }, type: '' }); return { state: 'running', currentTime: 0, sampleRate: 8000, destination: {}, resume: vi.fn(async () => undefined), createGain: node, createBiquadFilter: node, createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }), createBufferSource: () => ({ ...node(), start: vi.fn(), stop: vi.fn() }) }; }
const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url, init]) => `${String(url).split('/').pop()}${JSON.parse(String((init as RequestInit).body)).force ? ':force' : ''}`);

describe('playback lease', () => {
  it('takes over with a forced claim and never releases its own new lease', async () => {
    let held = true;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (url.endsWith('/release')) return json(200, { released: true });
      if (held && !body.force) return json(409, { granted: false, lease: { label: 'Kitchen' } });
      held = false; return json(200, { granted: true, lease: { label: 'Shared screen' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const audio = new SharedAudio(() => ctx() as never);
    await audio.enable();
    const { result } = renderHook(() => usePlaybackLease('ROOM', audio, { hostToken: 'host' }));
    await waitFor(() => expect(result.current.lease.heldBy).toBe('Kitchen'));
    expect(audio.snapshot.leader).toBe(false);
    act(() => result.current.takeOver());
    await waitFor(() => expect(result.current.lease).toEqual({ mode: 'room' }));
    expect(calls(fetchMock)).toEqual(['claim', 'claim:force']);
    await waitFor(() => expect(audio.snapshot.leader).toBe(true));
    audio.dispose();
  });

  it('releases when sound is turned off or the screen unmounts', async () => {
    const fetchMock = vi.fn(async (url: string) => json(200, url.endsWith('/release') ? { released: true } : { granted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const audio = new SharedAudio(() => ctx() as never);
    await audio.enable();
    const { unmount } = renderHook(() => usePlaybackLease('ROOM', audio));
    await waitFor(() => expect(calls(fetchMock)).toEqual(['claim']));
    act(() => audio.disable());
    await waitFor(() => expect(calls(fetchMock)).toEqual(['claim', 'release']));
    await act(async () => { await audio.enable(); });
    await waitFor(() => expect(calls(fetchMock)).toEqual(['claim', 'release', 'claim']));
    unmount();
    expect(calls(fetchMock)).toEqual(['claim', 'release', 'claim', 'release']);
    audio.dispose();
  });

  it('falls back to this browser only when the route is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: 'Not found' })));
    const audio = new SharedAudio(() => ctx() as never);
    await audio.enable();
    const { result } = renderHook(() => usePlaybackLease('ROOM', audio));
    await waitFor(() => expect(result.current.lease).toEqual({ mode: 'local' }));
    audio.dispose();
  });
});
