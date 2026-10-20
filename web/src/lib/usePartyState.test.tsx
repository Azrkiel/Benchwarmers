import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PartyStateResponse } from '@shared/types';
import { liveFixture, draftingFixture } from './fixtures';
import {
  computeServerOffset,
  formatCountdown,
  lockDeadline,
  parseFixtureMode,
  secondsLeft,
  usePartyState,
} from './usePartyState';

function json(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, statusText: 'err', json: async () => body } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pure helpers', () => {
  it('computeServerOffset', () => {
    expect(computeServerOffset(1_000_000, 995_000)).toBe(5_000);
  });

  it('lockDeadline', () => {
    const s: PartyStateResponse = { ...liveFixture, serverNow: 1_000_000 };
    expect(lockDeadline(s)).toBe(1_012_000);
    expect(lockDeadline({ ...s, activeProp: undefined })).toBeUndefined();
    expect(lockDeadline({ ...s, activeProp: { ...s.activeProp!, status: 'locked' } })).toBeUndefined();
    expect(lockDeadline({ ...s, activeProp: { ...s.activeProp!, realSecondsToLock: undefined } })).toBeUndefined();
  });

  it('secondsLeft', () => {
    expect(secondsLeft(undefined, 5)).toBe(0);
    expect(secondsLeft(10_000, 7_500)).toBe(3);
    expect(secondsLeft(10_000, 20_000)).toBe(0);
  });

  it('formatCountdown', () => {
    expect(formatCountdown(12)).toBe('0:12');
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('parseFixtureMode', () => {
    expect(parseFixtureMode('live')).toBe('live');
    expect(parseFixtureMode('cycle')).toBe('cycle');
    expect(parseFixtureMode('nope')).toBeUndefined();
    expect(parseFixtureMode(null)).toBeUndefined();
  });

  it('client clock behind server still gives correct countdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(995_000);
    const state: PartyStateResponse = { ...liveFixture, serverNow: 1_000_000 };
    vi.stubGlobal('fetch', vi.fn(async () => json(state)));
    const { result } = renderHook(() => usePartyState('DEMO'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.state).toBeDefined();
    const deadline = lockDeadline(result.current.state!);
    expect(secondsLeft(deadline, result.current.serverNow())).toBe(12);
    vi.setSystemTime(998_000);
    expect(result.current.serverNow()).toBe(1_003_000);
    expect(secondsLeft(deadline, result.current.serverNow())).toBe(9);
  });
});

describe('fixture mode', () => {
  it('live makes no fetch calls and has state synchronously', async () => {
    vi.useFakeTimers();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => usePartyState('DEMO', { fixture: 'live' }));
    expect(result.current.state?.party.status).toBe(liveFixture.party.status);
    expect(result.current.serverNow()).toBe(liveFixture.serverNow);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(f).not.toHaveBeenCalled();
    expect(result.current.serverNow()).toBe(liveFixture.serverNow + 5000);
  });

  it('cycle advances drafting -> live after cycleMs with no fetch', async () => {
    vi.useFakeTimers();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => usePartyState('DEMO', { fixture: 'cycle', cycleMs: 10_000 }));
    expect(result.current.state?.party.status).toBe(draftingFixture.party.status);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.state?.party.status).toBe(liveFixture.party.status);
    expect(result.current.serverNow()).toBe(liveFixture.serverNow);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('network mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
  });

  it('fetches, repeats, and keeps state on error', async () => {
    const f = vi.fn(async (_url: string) => json({ ...liveFixture, serverNow: 2_000_000 }));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => usePartyState('DEMO', { intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('/api/parties/DEMO/state');
    expect(result.current.state?.party.code).toBe(liveFixture.party.code);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(f).toHaveBeenCalledTimes(2);

    f.mockImplementation(async () => {
      throw new Error('boom');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.state).toBeDefined();
  });

  it('does not overlap requests', async () => {
    let release!: () => void;
    const f = vi.fn(
      () =>
        new Promise<Response>((res) => {
          release = () => res(json(liveFixture));
        }),
    );
    vi.stubGlobal('fetch', f);
    renderHook(() => usePartyState('DEMO', { intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(f).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('resolves latest via crew', async () => {
    const f = vi.fn(async (url: string) => {
      if (url === '/api/crews/sunday-crew/current') return json({ code: 'ABC' });
      if (url === '/api/parties/ABC/state') return json({ ...liveFixture, serverNow: 2_000_000 });
      return json({}, false);
    });
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => usePartyState('latest'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.code).toBe('ABC');
    expect(result.current.state).toBeDefined();
    expect(result.current.error).toBeUndefined();
  });

  it('latest follows a new party on re-resolve', async () => {
    let cur = 'ABC';
    const f = vi.fn(async (url: string) => {
      if (url === '/api/crews/my%20crew/current') return json({ code: cur });
      return json({ ...liveFixture, serverNow: 2_000_000 });
    });
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => usePartyState('Latest', { crew: 'my crew' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.code).toBe('ABC');
    cur = 'XYZ';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.code).toBe('XYZ');
  });
});
