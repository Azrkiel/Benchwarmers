// Main-thread facade over embed.worker.ts. Falls back to main-thread MFCC when Workers are unavailable.
import { mfccEmbedding } from './mfcc';
import type { FromWorker, ToWorker } from './protocol';
import { MFCC_MODEL_ID, WAVLM_MODEL_ID, type Backend } from './types';

export type LoadInfo = { backend: Backend; modelId: string; fallbackReason?: string };

export interface Embedder {
  load(onProgress?: (p: number) => void): Promise<LoadInfo>; // idempotent: repeat/concurrent calls share one promise
  embed(audio: Float32Array): Promise<Float32Array>; // loads first if needed
  readonly info: LoadInfo | null;
  dispose(): void;
}

export function createMfccEmbedder(): Embedder {
  let info: LoadInfo | null = null;
  let loadPromise: Promise<LoadInfo> | null = null;
  let disposed = false;
  const load = (onProgress?: (p: number) => void): Promise<LoadInfo> => {
    if (disposed) return Promise.reject(new Error('embedder disposed'));
    if (!loadPromise) {
      loadPromise = Promise.resolve().then(() => {
        onProgress?.(1);
        info = { backend: 'mfcc', modelId: MFCC_MODEL_ID, fallbackReason: undefined };
        return info;
      });
    }
    return loadPromise;
  };
  return {
    load,
    async embed(audio) {
      await load();
      return mfccEmbedding(audio);
    },
    get info() {
      return info;
    },
    dispose() {
      disposed = true;
    },
  };
}

type Pending = { resolve: (e: Float32Array) => void; reject: (err: Error) => void };

export function createWorkerEmbedder(opts: { forceFallback?: boolean } = {}): Embedder {
  if (typeof Worker === 'undefined') return createMfccEmbedder();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return createMfccEmbedder();
  }

  let info: LoadInfo | null = null;
  let loadPromise: Promise<LoadInfo> | null = null;
  let resolveLoad: ((i: LoadInfo) => void) | null = null;
  let rejectLoad: ((err: Error) => void) | null = null;
  const progressListeners = new Set<(p: number) => void>();
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let disposed = false;
  // Set when the worker is unusable: embeds run on the main thread from then on.
  let mainThread: Embedder | null = null;

  const settleLoad = (i: LoadInfo) => {
    info = i;
    resolveLoad?.(i);
    resolveLoad = rejectLoad = null;
  };

  const switchToMainThread = (reason: string) => {
    if (!mainThread) mainThread = createMfccEmbedder();
    const i: LoadInfo = { backend: 'mfcc', modelId: MFCC_MODEL_ID, fallbackReason: reason };
    if (!info) settleLoad(i);
    else info = i;
    worker.terminate();
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        for (const fn of progressListeners) fn(msg.progress);
        break;
      case 'ready':
        settleLoad({ backend: msg.backend, modelId: msg.modelId, fallbackReason: msg.fallbackReason });
        break;
      case 'embedding': {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p.resolve(msg.embedding);
        }
        break;
      }
      case 'error': {
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            p.reject(new Error(msg.message));
          }
        } else if (!info) {
          // Load-level failure reported by the worker: use main-thread MFCC.
          switchToMainThread(msg.message);
        }
        break;
      }
    }
  };

  worker.onerror = (ev: ErrorEvent) => {
    const reason = ev.message || 'worker error';
    for (const p of pending.values()) p.reject(new Error(reason));
    pending.clear();
    switchToMainThread(reason);
  };

  const load = (onProgress?: (p: number) => void): Promise<LoadInfo> => {
    if (disposed) return Promise.reject(new Error('embedder disposed'));
    if (onProgress) progressListeners.add(onProgress);
    if (!loadPromise) {
      loadPromise = new Promise<LoadInfo>((resolve, reject) => {
        resolveLoad = resolve;
        rejectLoad = reject;
      });
      if (info) {
        // Worker failed before the first load() (its error event fired early): resolve with that fallback.
        settleLoad(info);
      } else {
        const msg: ToWorker = { type: 'load', modelId: WAVLM_MODEL_ID, forceFallback: opts.forceFallback };
        worker.postMessage(msg);
      }
    }
    return loadPromise;
  };

  return {
    load,
    async embed(audio) {
      await load();
      if (mainThread) return mainThread.embed(audio);
      const id = nextId++;
      // Copy so the caller's array stays usable after the transfer.
      const copy = new Float32Array(audio);
      return new Promise<Float32Array>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const msg: ToWorker = { type: 'embed', id, audio: copy };
        worker.postMessage(msg, [copy.buffer]);
      });
    },
    get info() {
      return info;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('embedder disposed'));
      pending.clear();
      rejectLoad?.(new Error('embedder disposed'));
      resolveLoad = rejectLoad = null;
      progressListeners.clear();
      mainThread?.dispose();
    },
  };
}

const shared: Record<'true' | 'false', Embedder | undefined> = { true: undefined, false: undefined };

export function getSharedEmbedder(opts: { forceFallback?: boolean } = {}): Embedder {
  const key = opts.forceFallback ? 'true' : 'false';
  shared[key] ??= createWorkerEmbedder({ forceFallback: !!opts.forceFallback });
  return shared[key]!;
}
