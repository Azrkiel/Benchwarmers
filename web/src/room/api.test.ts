import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('room request resilience', () => {
  it('keeps room and season credentials in memory when browser storage is blocked', async () => {
    vi.resetModules();
    const api = await import('./api');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    api.saveCredentials('STORAGE-ROOM', { hostToken: 'host-token' });
    api.rememberPlayer('STORAGE-ROOM', { season: { id: 'STORAGE-SEASON' } } as Parameters<typeof api.rememberPlayer>[1], 'player-token');
    expect(api.roomCredentials('STORAGE-ROOM')).toEqual({ hostToken: 'host-token', participantToken: 'player-token' });
    expect(api.seasonToken('STORAGE-SEASON')).toBe('player-token');
    expect(api.storageWarning()).toContain('Keep this tab open');
    api.forgetSeasonToken('STORAGE-SEASON');
    expect(api.seasonToken('STORAGE-SEASON')).toBeUndefined();
  });

  it('aborts a stalled request after 10 seconds and explains how to retry', async () => {
    vi.useFakeTimers();
    const { roomRequest } = await import('./api');
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return await new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    }));
    const request = roomRequest('/api/rooms/SLOW');
    const assertion = expect(request).rejects.toThrow('took too long to respond. Try again.');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
});
