import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMfccEmbedder, createWorkerEmbedder, getSharedEmbedder } from './embedder';
import type { FromWorker, ToWorker } from './protocol';
import { MFCC_MODEL_ID, WAVLM_MODEL_ID } from './types';

const RATE = 16000;

function tone(seconds: number): Float32Array {
  const x = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 180 * i) / RATE) + 0.1 * Math.sin((2 * Math.PI * 900 * i) / RATE);
  return x;
}

function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createMfccEmbedder', () => {
  it('loads as mfcc and embeds to 24 unit-norm dims', async () => {
    const e = createMfccEmbedder();
    const onProgress = vi.fn();
    const info = await e.load(onProgress);
    expect(info).toEqual({ backend: 'mfcc', modelId: MFCC_MODEL_ID, fallbackReason: undefined });
    expect(e.info).toEqual(info);
    const v = await e.embed(tone(2));
    expect(v.length).toBe(24);
    expect(norm(v)).toBeCloseTo(1, 5);
    e.dispose();
  });

  it('repeat load returns the same promise', () => {
    const e = createMfccEmbedder();
    expect(e.load()).toBe(e.load());
    e.dispose();
  });
});

describe('createWorkerEmbedder without Worker', () => {
  it('falls back to mfcc when Worker is undefined in jsdom', async () => {
    vi.stubGlobal('Worker', undefined);
    const e = createWorkerEmbedder();
    const info = await e.load();
    expect(info.backend).toBe('mfcc');
    expect(info.modelId).toBe(MFCC_MODEL_ID);
    expect((await e.embed(tone(2))).length).toBe(24);
    e.dispose();
  });

  it('falls back to mfcc when Worker construction throws', async () => {
    class Throwing {
      constructor() {
        throw new Error('no workers');
      }
    }
    vi.stubGlobal('Worker', Throwing);
    const e = createWorkerEmbedder();
    expect((await e.load()).backend).toBe('mfcc');
    e.dispose();
  });
});

// Fake worker: answers load with progress + ready(wavlm), embed with a fixed vector routed by id.
type Listener = (e: { data: FromWorker }) => void;
class FakeWorker {
  static instances: FakeWorker[] = [];
  static behaviour: 'ok' | 'error' = 'ok';
  sent: ToWorker[] = [];
  onmessage: Listener | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminated = false;
  constructor(public url: unknown, public opts?: unknown) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: ToWorker) {
    this.sent.push(msg);
    queueMicrotask(() => {
      if (FakeWorker.behaviour === 'error') {
        this.onerror?.({ message: 'boom in worker' });
        return;
      }
      if (msg.type === 'load') {
        this.reply({ type: 'progress', file: 'onnx/model_q8.onnx', progress: 0.25 });
        this.reply({ type: 'progress', file: 'onnx/model_q8.onnx', progress: 1 });
        this.reply({ type: 'ready', backend: 'wavlm', modelId: WAVLM_MODEL_ID });
      } else {
        const v = new Float32Array(512).fill(0.5);
        v[0] = msg.id; // lets the test check routing by id
        this.reply({ type: 'embedding', id: msg.id, embedding: v });
      }
    });
  }
  reply(data: FromWorker) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
}

describe('createWorkerEmbedder with fake Worker', () => {
  it('handles progress, ready, routed embeddings and idempotent load', async () => {
    FakeWorker.instances = [];
    FakeWorker.behaviour = 'ok';
    vi.stubGlobal('Worker', FakeWorker);
    const e = createWorkerEmbedder();
    const progress: number[] = [];
    const [a, b] = await Promise.all([e.load((p) => progress.push(p)), e.load()]);
    expect(a).toBe(b);
    expect(a).toEqual({ backend: 'wavlm', modelId: WAVLM_MODEL_ID, fallbackReason: undefined });
    expect(e.info?.backend).toBe('wavlm');
    expect(progress).toEqual([0.25, 1]);

    const loads = FakeWorker.instances[0].sent.filter((m) => m.type === 'load');
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ type: 'load', modelId: WAVLM_MODEL_ID });

    const audio = tone(1);
    const [v1, v2] = await Promise.all([e.embed(audio), e.embed(audio)]);
    expect(v1.length).toBe(512);
    expect(v1[0]).not.toBe(v2[0]); // distinct ids -> distinct replies
    expect(audio[0]).toBe(tone(1)[0]); // caller array not detached by transfer
    expect(audio.length).toBe(RATE);
    e.dispose();
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it('falls back to mfcc when the worker errors before ready', async () => {
    FakeWorker.instances = [];
    FakeWorker.behaviour = 'error';
    vi.stubGlobal('Worker', FakeWorker);
    const e = createWorkerEmbedder();
    const info = await e.load();
    expect(info.backend).toBe('mfcc');
    expect(info.modelId).toBe(MFCC_MODEL_ID);
    expect(info.fallbackReason).toBe('boom in worker');
    const v = await e.embed(tone(2));
    expect(v.length).toBe(24);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    e.dispose();
  });
});

describe('getSharedEmbedder', () => {
  it('returns one instance per forceFallback value', () => {
    vi.stubGlobal('Worker', undefined);
    expect(getSharedEmbedder()).toBe(getSharedEmbedder());
    expect(getSharedEmbedder({ forceFallback: true })).toBe(getSharedEmbedder({ forceFallback: true }));
    expect(getSharedEmbedder()).not.toBe(getSharedEmbedder({ forceFallback: true }));
  });
});
