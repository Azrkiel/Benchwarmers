import { useCallback, useEffect, useRef, useState } from 'react';
import { createCapture, speechSeconds, type Capture } from './audio';
import { MIN_SPEECH_SECONDS } from './types';

/**
 * Push-to-talk capture for one utterance. One Capture per hook instance, created lazily on start().
 *
 * Device-page use: mic pressed -> `start()` plus `recognition.start()`. On `recognition.onend`:
 *   const clip = await capture.stop();
 *   const hint = clip ? await voice.identify(clip) : null;
 * Send `speaker: hint ?? undefined` in AssistantRequest. If `hint` is null, fall back to the
 * name in the utterance or ask.
 *
 * `stop()` resolves null when nothing was recorded or speech is shorter than `minSpeechSeconds`.
 * `start()` errors (e.g. mic denied) land in `error` and are rethrown. Disposes on unmount.
 */
export function useUtteranceCapture(opts: { minSpeechSeconds?: number } = {}): {
  start(): Promise<void>;
  stop(): Promise<Float32Array | null>;
  recording: boolean;
  level: number;
  error?: string;
} {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  const captureRef = useRef<Capture | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(false);
  const minRef = useRef(opts.minSpeechSeconds ?? MIN_SPEECH_SECONDS);
  minRef.current = opts.minSpeechSeconds ?? MIN_SPEECH_SECONDS;

  const getCapture = (): Capture => {
    if (!captureRef.current) {
      const c = createCapture();
      captureRef.current = c;
      unsubRef.current = c.level$.subscribe((l) => {
        if (aliveRef.current) setLevel(l);
      });
    }
    return captureRef.current;
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      unsubRef.current?.();
      unsubRef.current = null;
      captureRef.current?.dispose();
      captureRef.current = null;
    };
  }, []);

  const start = useCallback(async (): Promise<void> => {
    const c = getCapture();
    setError(undefined);
    try {
      await c.start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (aliveRef.current) setError(msg);
      throw e;
    }
    if (aliveRef.current) setRecording(true);
  }, []);

  const stop = useCallback(async (): Promise<Float32Array | null> => {
    const c = captureRef.current;
    if (!c) return null;
    let clip: Float32Array;
    try {
      clip = await c.stop();
    } finally {
      if (aliveRef.current) setRecording(false);
    }
    if (clip.length === 0 || speechSeconds(clip) < minRef.current) return null;
    return clip;
  }, []);

  return { start, stop, recording, level, error };
}
