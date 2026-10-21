import { useCallback, useEffect, useRef, useState } from 'react';
import { getSynth, makeUtterance as defaultMakeUtterance, type SynthLike } from './speech';

export interface UseSpeechOutputOpts {
  synth?: SynthLike | null;
  makeUtterance?: (text: string) => object | null;
  storageKey?: string;
}

export interface UseSpeechOutput {
  supported: boolean;
  muted: boolean;
  speaking: boolean;
  setMuted(m: boolean): void;
  toggleMute(): void;
  speak(text: string): void;
  cancel(): void;
}

const DEFAULT_KEY = 'bw.device.muted';

function readMuted(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeMuted(key: string, m: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Strip emoji and markdown-ish markers so they are not read aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechOutput(opts: UseSpeechOutputOpts = {}): UseSpeechOutput {
  const synth = opts.synth === undefined ? getSynth() : opts.synth;
  const key = opts.storageKey ?? DEFAULT_KEY;
  const supported = !!synth;

  const [muted, setMutedState] = useState(() => readMuted(key));
  const [speaking, setSpeaking] = useState(false);

  const synthRef = useRef(synth);
  synthRef.current = synth;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const makeRef = useRef(opts.makeUtterance);
  makeRef.current = opts.makeUtterance;
  const currentRef = useRef<object | null>(null);

  const cancel = useCallback(() => {
    currentRef.current = null;
    setSpeaking(false);
    try {
      synthRef.current?.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      const s = synthRef.current;
      if (!s || mutedRef.current) return;
      const clean = cleanForSpeech(text);
      if (!clean) return;
      const u = (makeRef.current ?? defaultMakeUtterance)(clean) as
        | (object & { onend?: (() => void) | null; onerror?: ((ev?: unknown) => void) | null })
        | null;
      if (!u) return;
      try {
        s.cancel();
      } catch {
        /* ignore */
      }
      const done = () => {
        if (currentRef.current === u) {
          currentRef.current = null;
          setSpeaking(false);
        }
      };
      u.onend = done;
      u.onerror = done;
      currentRef.current = u;
      setSpeaking(true);
      s.speak(u);
    },
    [],
  );

  const setMuted = useCallback(
    (m: boolean) => {
      mutedRef.current = m;
      setMutedState(m);
      writeMuted(key, m);
      if (m) cancel();
    },
    [key, cancel],
  );

  const toggleMute = useCallback(() => setMuted(!mutedRef.current), [setMuted]);

  useEffect(
    () => () => {
      currentRef.current = null;
      try {
        synthRef.current?.cancel();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported, muted, speaking, setMuted, toggleMute, speak, cancel };
}
