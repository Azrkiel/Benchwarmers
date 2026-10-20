import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCapture, type Capture } from './audio';
import { useUtteranceCapture } from './useUtteranceCapture';
import { MIN_SPEECH_SECONDS, SAMPLE_RATE } from './types';

vi.mock('./audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audio')>();
  return { ...actual, createCapture: vi.fn() };
});

function tone(seconds: number): Float32Array {
  const x = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
  return x;
}

type FakeCapture = Capture & { drive(level: number): void };

function fakeCapture(clip: Float32Array): FakeCapture {
  let level = 0;
  const subs = new Set<(l: number) => void>();
  let recording = false;
  const level$ = {
    get: () => level,
    subscribe(fn: (l: number) => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
  return {
    start: vi.fn(async () => {
      recording = true;
    }),
    stop: vi.fn(async () => {
      recording = false;
      return clip;
    }),
    get recording() {
      return recording;
    },
    level$,
    dispose: vi.fn(),
    drive(l: number) {
      level = l;
      subs.forEach((fn) => fn(l));
    },
  };
}

describe('useUtteranceCapture', () => {
  let cap: FakeCapture;

  beforeEach(() => {
    vi.mocked(createCapture).mockReset();
    cap = fakeCapture(tone(2));
    vi.mocked(createCapture).mockReturnValue(cap);
  });

  it('runs start/stop, toggles recording and returns the clip', async () => {
    const clip = tone(2);
    cap = fakeCapture(clip);
    vi.mocked(createCapture).mockReturnValue(cap);
    const { result } = renderHook(() => useUtteranceCapture());

    expect(result.current.recording).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(true);
    expect(cap.start).toHaveBeenCalledTimes(1);

    let out: Float32Array | null = null;
    await act(async () => {
      out = await result.current.stop();
    });
    expect(out).toBe(clip);
    expect(result.current.recording).toBe(false);
  });

  it('tracks level updates from level$', async () => {
    const { result } = renderHook(() => useUtteranceCapture());
    await act(async () => {
      await result.current.start();
    });

    act(() => cap.drive(0.6));
    expect(result.current.level).toBe(0.6);

    act(() => cap.drive(0.2));
    expect(result.current.level).toBe(0.2);
  });

  it('returns null from stop for a too-short clip', async () => {
    cap = fakeCapture(tone(MIN_SPEECH_SECONDS - 1));
    vi.mocked(createCapture).mockReturnValue(cap);
    const { result } = renderHook(() => useUtteranceCapture());
    await act(async () => {
      await result.current.start();
    });

    let out: Float32Array | null | undefined;
    await act(async () => {
      out = await result.current.stop();
    });
    expect(out).toBeNull();
    expect(result.current.recording).toBe(false);
  });

  it('returns null from stop when nothing was recorded', async () => {
    cap = fakeCapture(new Float32Array(0));
    vi.mocked(createCapture).mockReturnValue(cap);
    const { result } = renderHook(() => useUtteranceCapture());

    let out: Float32Array | null | undefined;
    await act(async () => {
      out = await result.current.stop();
    });
    expect(out).toBeNull();
  });

  it('captures a start error and rethrows it', async () => {
    cap.start = vi.fn(async () => {
      throw new Error('Permission denied');
    });
    const { result } = renderHook(() => useUtteranceCapture());

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.start();
      } catch (e) {
        thrown = e;
      }
    });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Permission denied');
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.recording).toBe(false);
  });

  it('creates one capture per hook instance', async () => {
    const { result } = renderHook(() => useUtteranceCapture());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(createCapture).toHaveBeenCalledTimes(1);
  });

  it('disposes the capture on unmount', async () => {
    const { result, unmount } = renderHook(() => useUtteranceCapture());
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(cap.dispose).toHaveBeenCalled();
  });
});
