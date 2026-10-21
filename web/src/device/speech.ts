// Feature-detected, injectable wrappers around the Web Speech API.
// jsdom has neither SpeechRecognition nor speechSynthesis, so every access is guarded.

export interface RecognizerLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((ev: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognizerFactory = () => RecognizerLike;

export interface SynthLike {
  speak(u: unknown): void;
  cancel(): void;
  speaking?: boolean;
}

export interface UtteranceLike {
  text: string;
  rate?: number;
  onend?: (() => void) | null;
  onerror?: ((ev?: unknown) => void) | null;
}

type Ctor<T> = new (...args: never[]) => T;

function prop(win: unknown, key: string): unknown {
  if (win === null || win === undefined) return undefined;
  return (win as Record<string, unknown>)[key];
}

export function getRecognizerFactory(win: unknown = globalThis): RecognizerFactory | null {
  const Ctor = prop(win, 'SpeechRecognition') ?? prop(win, 'webkitSpeechRecognition');
  if (typeof Ctor !== 'function') return null;
  const C = Ctor as Ctor<RecognizerLike>;
  return () => new (C as unknown as new () => RecognizerLike)();
}

export function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone blocked. Allow mic access, or type instead.';
    case 'no-speech':
      return "Didn't catch that. Try again or type.";
    case 'audio-capture':
      return 'No microphone found.';
    case 'network':
      return 'Speech service unreachable. Type instead.';
    default:
      return `Speech input failed (${code}). Type instead.`;
  }
}

export function getSynth(win: unknown = globalThis): SynthLike | null {
  const s = prop(win, 'speechSynthesis');
  if (!s || typeof (s as SynthLike).speak !== 'function') return null;
  return s as SynthLike;
}

export function makeUtterance(text: string, win: unknown = globalThis): UtteranceLike | null {
  const C = prop(win, 'SpeechSynthesisUtterance');
  if (typeof C !== 'function') return null;
  return new (C as unknown as new (t: string) => UtteranceLike)(text);
}
