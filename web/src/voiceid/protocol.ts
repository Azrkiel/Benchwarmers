import type { Backend } from './types';

export type ToWorker =
  | { type: 'load'; modelId: string; forceFallback?: boolean }
  | { type: 'embed'; id: number; audio: Float32Array };

export type FromWorker =
  | { type: 'progress'; file?: string; progress: number } // 0..1 for the main model file (.onnx)
  | { type: 'ready'; backend: Backend; modelId: string; fallbackReason?: string }
  | { type: 'embedding'; id: number; embedding: Float32Array }
  | { type: 'error'; id?: number; message: string };
