// Module worker: speaker embeddings. WavLM x-vector via transformers.js, MFCC fallback.
// Typed via a local ctx cast so the DOM lib (web/tsconfig.json) stays the only global lib.
import { prepareForEmbedding } from './audio';
import { l2normalize } from './match';
import { mfccEmbedding } from './mfcc';
import { MFCC_MODEL_ID, WAVLM_MODEL_ID, type Backend } from './types';
import type { FromWorker, ToWorker } from './protocol';

const ctx = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

type Extractor = (audio: Float32Array) => Promise<Float32Array>;

let loading: Promise<void> | null = null;
let loadedModelId: string | null = null;
let extractor: Extractor | null = null;
let backend: Backend = 'mfcc';
let fallbackReason: string | undefined;

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function loadWavlm(modelId: string): Promise<Extractor> {
  // Dynamic import: the fallback path and tests never pull transformers.js in.
  const tf = await import('@huggingface/transformers');
  tf.env.allowLocalModels = false;
  const hc = (self as unknown as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 1;
  const onnxWasm = tf.env.backends.onnx.wasm;
  if (onnxWasm) onnxWasm.numThreads = Math.max(1, Math.min(4, hc));
  const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
    if (info.status === 'progress' && info.file?.endsWith('.onnx') && typeof info.progress === 'number') {
      ctx.postMessage({ type: 'progress', file: info.file, progress: info.progress / 100 });
    }
  };
  const processor = await tf.AutoProcessor.from_pretrained(modelId, { progress_callback });
  const model = await tf.AutoModelForXVector.from_pretrained(modelId, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback,
  });
  return async (audio) => {
    const { embeddings } = (await model(await processor(audio))) as { embeddings: { data: ArrayLike<number> } };
    return l2normalize(embeddings.data);
  };
}

function doLoad(modelId: string, forceFallback: boolean): Promise<void> {
  if (loadedModelId === modelId && (extractor || backend === 'mfcc')) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    backend = 'mfcc';
    fallbackReason = undefined;
    extractor = null;
    if (!forceFallback) {
      try {
        extractor = await loadWavlm(modelId);
        backend = 'wavlm';
      } catch (e) {
        fallbackReason = errMessage(e);
      }
    } else {
      fallbackReason = 'forced fallback';
    }
    loadedModelId = modelId;
    ctx.postMessage({
      type: 'ready',
      backend,
      modelId: backend === 'wavlm' ? modelId : MFCC_MODEL_ID,
      fallbackReason,
    });
  })().finally(() => {
    loading = null;
  });
  return loading;
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    doLoad(msg.modelId || WAVLM_MODEL_ID, !!msg.forceFallback).catch((err) =>
      ctx.postMessage({ type: 'error', message: errMessage(err) }),
    );
    return;
  }
  // embed
  (async () => {
    // Wait for an in-flight load so an embed sent right after load is not run on the wrong backend.
    if (loading) await loading;
    const embedding =
      backend === 'wavlm' && extractor ? await extractor(prepareForEmbedding(msg.audio)) : mfccEmbedding(msg.audio);
    const out = new Float32Array(embedding);
    ctx.postMessage({ type: 'embedding', id: msg.id, embedding: out }, [out.buffer]);
  })().catch((err) => ctx.postMessage({ type: 'error', id: msg.id, message: errMessage(err) }));
};
