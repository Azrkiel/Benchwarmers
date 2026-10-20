import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceId, type VoiceId } from './useVoiceId';
import type { Embedder, LoadInfo } from './embedder';
import { DEFAULT_MATCH } from './match';
import { storageKey } from './profiles';
import { MFCC_MODEL_ID, MIN_SPEECH_SECONDS, WAVLM_MODEL_ID, type Backend, SAMPLE_RATE } from './types';

const HH = 'garcias';
const MAYA = { id: 'maya', name: 'Maya' };
const LEO = { id: 'leo', name: 'Leo' };

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(i: number) {
    return Array.from(this.data.keys())[i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

// A 2 s (or other length) sine: non-silent, so speechSeconds sees the full length.
function tone(seconds: number): Float32Array {
  const x = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
  return x;
}

// The mock embedder looks up each clip's "voice" vector by identity.
const VECTORS = new WeakMap<Float32Array, number[]>();

function clipFor(vec: number[], seconds = 2): Float32Array {
  const clip = tone(seconds);
  VECTORS.set(clip, vec);
  return clip;
}

// Per-speaker base vector plus small per-clip variation.
function voice(base: number[], i: number): number[] {
  return base.map((v, k) => v + 0.02 * (i + k));
}
const MAYA_BASE = [1, 0, 0, 0];
const LEO_BASE = [0, 1, 0, 0];

function mockEmbedder(o: { backend?: Backend; modelId?: string; hold?: boolean; failWith?: string } = {}) {
  const info: LoadInfo = { backend: o.backend ?? 'wavlm', modelId: o.modelId ?? WAVLM_MODEL_ID };
  let openGate!: () => void;
  const gate = o.hold ? new Promise<void>((r) => (openGate = r)) : Promise.resolve();
  const load = vi.fn(async (onProgress?: (p: number) => void): Promise<LoadInfo> => {
    onProgress?.(0.4);
    await gate;
    if (o.failWith) throw new Error(o.failWith);
    onProgress?.(0.9);
    return info;
  });
  const embed = vi.fn(async (clip: Float32Array): Promise<Float32Array> => {
    const v = VECTORS.get(clip);
    if (!v) throw new Error('unknown test clip');
    return Float32Array.from(v);
  });
  const embedder: Embedder = { load, embed, info: null, dispose: vi.fn() };
  return { embedder, embed, load, open: () => openGate?.() };
}

async function ready(result: { current: VoiceId }) {
  await waitFor(() => expect(result.current.status).toBe('ready'));
}

async function enrollMany(result: { current: VoiceId }, member: { id: string; name: string }, clips: Float32Array[]) {
  for (const clip of clips) {
    await act(async () => {
      await result.current.enroll(member, clip);
    });
  }
}

async function enrollBoth(result: { current: VoiceId }) {
  await enrollMany(
    result,
    MAYA,
    [0, 1, 2].map((i) => clipFor(voice(MAYA_BASE, i))),
  );
  await enrollMany(
    result,
    LEO,
    [0, 1, 2].map((i) => clipFor(voice(LEO_BASE, i))),
  );
}

describe('useVoiceId', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('goes loading -> ready, reports progress and the backend defaults', async () => {
    const m = mockEmbedder({ hold: true });
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));

    expect(result.current.status).toBe('loading');
    expect(result.current.progress).toBe(0.4);

    await act(async () => m.open());
    await ready(result);

    expect(result.current.progress).toBe(1);
    expect(result.current.backend).toBe('wavlm');
    expect(result.current.modelId).toBe(WAVLM_MODEL_ID);
    expect(result.current.error).toBeUndefined();
    expect(result.current.matchOptions).toEqual(DEFAULT_MATCH.wavlm);
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it('enrolls Maya and Leo, then identifies a new Maya clip', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);

    await enrollBoth(result);
    expect(result.current.profiles.map((p) => p.memberName)).toEqual(['Maya', 'Leo']);
    expect(result.current.profiles[0].samples).toHaveLength(3);

    const hint = await act(async () => result.current.identify(clipFor(voice(MAYA_BASE, 7))));
    expect(hint).toEqual({ memberName: 'Maya', confidence: expect.any(Number), source: 'voice-id' });
    expect(hint!.confidence).toBeGreaterThanOrEqual(0.85);

    const leo = await act(async () => result.current.identify(clipFor(voice(LEO_BASE, 7))));
    expect(leo?.memberName).toBe('Leo');
  });

  it('returns null for an ambiguous clip and reports the reason', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);
    await enrollBoth(result);

    const mixed = clipFor([1, 1, 0, 0]);
    const hint = await act(async () => result.current.identify(mixed));
    expect(hint).toBeNull();

    const detail = await act(async () => result.current.identifyDetailed(mixed));
    expect(detail.tooShort).toBe(false);
    expect(detail.result).not.toBeNull();
    expect(detail.result!.accepted).toBe(false);
    expect(detail.result!.reason).toBe('small-margin');
    expect(detail.hint).toBeNull();
  });

  it('rejects too-short clips on enroll and returns tooShort from identify', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);
    await enrollBoth(result);
    m.embed.mockClear();

    const short = clipFor(voice(MAYA_BASE, 0), 0.5);
    expect(short.length / SAMPLE_RATE).toBeLessThan(MIN_SPEECH_SECONDS);

    await expect(act(async () => result.current.enroll(MAYA, short))).rejects.toThrow('clip too short');

    const detail = await act(async () => result.current.identifyDetailed(short));
    expect(detail.tooShort).toBe(true);
    expect(detail.hint).toBeNull();
    expect(detail.result).toBeNull();
    expect(detail.speechSeconds).toBeLessThan(MIN_SPEECH_SECONDS);

    expect(await act(async () => result.current.identify(short))).toBeNull();
    expect(m.embed).not.toHaveBeenCalled();
    expect(result.current.profiles[0].samples).toHaveLength(3);
  });

  it('returns null from identify when nothing is enrolled', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);

    const detail = await act(async () => result.current.identifyDetailed(clipFor(voice(MAYA_BASE, 0))));
    expect(detail.result).toBeNull();
    expect(detail.tooShort).toBe(false);
    expect(detail.hint).toBeNull();
  });

  it('persists profiles and reloads them in a fresh hook instance', async () => {
    const m = mockEmbedder();
    const first = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(first.result);
    await enrollBoth(first.result);
    first.unmount();

    const stored = JSON.parse(storage.getItem(storageKey(HH))!);
    expect(stored.profiles.map((p: { memberId: string }) => p.memberId)).toEqual(['maya', 'leo']);

    const second = renderHook(() => useVoiceId(HH, { embedder: mockEmbedder().embedder, storage }));
    await ready(second.result);
    expect(second.result.current.profiles.map((p) => p.memberName)).toEqual(['Maya', 'Leo']);
    const hint = await act(async () => second.result.current.identify(clipFor(voice(MAYA_BASE, 9))));
    expect(hint?.memberName).toBe('Maya');
  });

  it('keeps every enroll when two are started together', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);

    await act(async () => {
      await Promise.all([
        result.current.enroll(MAYA, clipFor(voice(MAYA_BASE, 0))),
        result.current.enroll(LEO, clipFor(voice(LEO_BASE, 0))),
      ]);
    });

    expect(result.current.profiles.map((p) => p.memberId).sort()).toEqual(['leo', 'maya']);
    const saved = JSON.parse(storage.getItem(storageKey(HH))!);
    expect(saved.profiles).toHaveLength(2);
  });

  it('clear(memberId) removes only that member; clear() removes all', async () => {
    const m = mockEmbedder();
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await ready(result);
    await enrollBoth(result);

    act(() => result.current.clear('leo'));
    expect(result.current.profiles.map((p) => p.memberId)).toEqual(['maya']);
    expect(JSON.parse(storage.getItem(storageKey(HH))!).profiles.map((p: { memberId: string }) => p.memberId)).toEqual([
      'maya',
    ]);

    act(() => result.current.clear());
    expect(result.current.profiles).toEqual([]);
    expect(JSON.parse(storage.getItem(storageKey(HH))!).profiles).toEqual([]);
  });

  it('ignores profiles saved with a different backend', async () => {
    const wavlm = mockEmbedder({ backend: 'wavlm' });
    const a = renderHook(() => useVoiceId(HH, { embedder: wavlm.embedder, storage }));
    await ready(a.result);
    await enrollBoth(a.result);
    a.unmount();

    const mfcc = mockEmbedder({ backend: 'mfcc', modelId: MFCC_MODEL_ID });
    const b = renderHook(() => useVoiceId(HH, { embedder: mfcc.embedder, storage }));
    await ready(b.result);
    expect(b.result.current.backend).toBe('mfcc');
    expect(b.result.current.profiles).toEqual([]);
    expect(b.result.current.matchOptions).toEqual(DEFAULT_MATCH.mfcc);
  });

  it('keeps user match options after load and switches household profiles', async () => {
    const m = mockEmbedder();
    const { result, rerender } = renderHook(
      ({ hh }: { hh: string }) => useVoiceId(hh, { embedder: m.embedder, storage }),
      { initialProps: { hh: HH } },
    );
    await ready(result);
    await enrollBoth(result);

    act(() => result.current.setMatchOptions({ threshold: 0.5, margin: 0.01 }));
    expect(result.current.matchOptions).toEqual({ threshold: 0.5, margin: 0.01 });

    rerender({ hh: 'sams-place' });
    await waitFor(() => expect(result.current.profiles).toEqual([]));
    expect(result.current.matchOptions).toEqual({ threshold: 0.5, margin: 0.01 });

    rerender({ hh: HH });
    await waitFor(() => expect(result.current.profiles).toHaveLength(2));
  });

  it('reports a load failure as error state', async () => {
    const m = mockEmbedder({ failWith: 'model download failed' });
    const { result } = renderHook(() => useVoiceId(HH, { embedder: m.embedder, storage }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('model download failed');
  });
});
