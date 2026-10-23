import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeSpeechError,
  getRecognizerFactory,
  type RecognizerFactory,
  type RecognizerLike,
} from './speech';

export interface UseSpeechInputOpts {
  factory?: RecognizerFactory | null;
  lang?: string;
  onFinal: (text: string) => void;
  onEnd?: (finalText: string) => void;
}

export interface UseSpeechInput {
  supported: boolean;
  listening: boolean;
  interim: string;
  error?: string;
  start(options?: { continuous?: boolean }): void;
  stop(): void;
}

const UNSUPPORTED = "Voice input isn't supported in this browser. Type instead.";

export function useSpeechInput(opts: UseSpeechInputOpts): UseSpeechInput {
  const factory = opts.factory === undefined ? getRecognizerFactory() : opts.factory;
  const supported = !!factory;

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const activeRef = useRef<RecognizerLike | null>(null);

  const start = useCallback((options?: { continuous?: boolean }) => {
    const make = factoryRef.current;
    if (!make) {
      setError(UNSUPPORTED);
      return;
    }
    if (activeRef.current) return; // already listening

    const rec = make();
    rec.lang = optsRef.current.lang ?? 'en-US';
    rec.interimResults = true;
    rec.continuous = options?.continuous ?? false;

    let finalText = '';
    let finished = false;

    rec.onresult = (ev) => {
      if (activeRef.current !== rec) return;
      const fin: string[] = [];
      const part: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) fin.push(t);
        else part.push(t);
      }
      finalText = fin.join(' ');
      setInterim([...fin, ...part].join(' '));
    };
    rec.onerror = (ev) => {
      if (activeRef.current !== rec) return;
      if (ev.error !== 'aborted') setError(describeSpeechError(ev.error));
    };
    rec.onend = () => {
      if (finished) return;
      finished = true;
      if (activeRef.current === rec) activeRef.current = null;
      setListening(false);
      setInterim('');
      const text = finalText.trim();
      if (text) optsRef.current.onFinal(text);
      optsRef.current.onEnd?.(text);
    };

    setInterim('');
    setError(undefined);
    activeRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch (err) {
      activeRef.current = null;
      finished = true;
      setListening(false);
      setError(typeof err === 'object' && err !== null && 'name' in err && err.name === 'NotAllowedError'
        ? describeSpeechError('not-allowed')
        : "Voice input couldn't start. Try again or type instead.");
      optsRef.current.onEnd?.('');
    }
  }, []);

  const stop = useCallback(() => {
    try {
      activeRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(
    () => () => {
      const rec = activeRef.current;
      activeRef.current = null;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  return { supported, listening, interim, error, start, stop };
}
