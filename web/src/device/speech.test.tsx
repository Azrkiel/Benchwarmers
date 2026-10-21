import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeSpeechError,
  getRecognizerFactory,
  getSynth,
  makeUtterance,
  type RecognizerLike,
} from './speech';
import { useSpeechInput } from './useSpeechInput';
import { useSpeechOutput } from './useSpeechOutput';

class FakeRecognizer implements RecognizerLike {
  lang = '';
  interimResults = false;
  continuous = true;
  onresult: RecognizerLike['onresult'] = null;
  onerror: RecognizerLike['onerror'] = null;
  onend: RecognizerLike['onend'] = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
  emit(parts: Array<{ t: string; final: boolean }>) {
    const results = parts.map((p) => Object.assign([{ transcript: p.t }], { isFinal: p.final }));
    this.onresult?.({ resultIndex: 0, results });
  }
}

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function fakeSynth() {
  return { speak: vi.fn(), cancel: vi.fn(), speaking: false };
}

const mk = (t: string) => new FakeUtterance(t);

describe('speech.ts', () => {
  it('getRecognizerFactory prefers SpeechRecognition, then webkit, else null', () => {
    class A extends FakeRecognizer {}
    class B extends FakeRecognizer {}
    expect(getRecognizerFactory({})).toBeNull();
    expect(getRecognizerFactory({ webkitSpeechRecognition: B })!()).toBeInstanceOf(B);
    expect(
      getRecognizerFactory({ SpeechRecognition: A, webkitSpeechRecognition: B })!(),
    ).toBeInstanceOf(A);
  });

  it('getSynth and makeUtterance detect absence', () => {
    expect(getSynth({})).toBeNull();
    expect(makeUtterance('x', {})).toBeNull();
    const s = fakeSynth();
    expect(getSynth({ speechSynthesis: s })).toBe(s);
    expect(makeUtterance('hi', { SpeechSynthesisUtterance: FakeUtterance })?.text).toBe('hi');
  });

  it('describeSpeechError maps codes', () => {
    expect(describeSpeechError('not-allowed')).toBe('Microphone blocked. Allow mic access, or type instead.');
    expect(describeSpeechError('service-not-allowed')).toContain('Microphone blocked');
    expect(describeSpeechError('no-speech')).toBe("Didn't catch that. Try again or type.");
    expect(describeSpeechError('audio-capture')).toBe('No microphone found.');
    expect(describeSpeechError('network')).toBe('Speech service unreachable. Type instead.');
    expect(describeSpeechError('weird')).toBe('Speech input failed (weird). Type instead.');
  });
});

describe('useSpeechInput', () => {
  let rec: FakeRecognizer;
  beforeEach(() => {
    rec = new FakeRecognizer();
  });

  it('starts, shows interim, delivers trimmed final once, then ends', () => {
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ factory: () => rec, onFinal, onEnd }));
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(rec.started).toBe(1);
    expect(rec.lang).toBe('en-US');
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(false);
    expect(result.current.listening).toBe(true);

    act(() => rec.emit([{ t: 'hello wor', final: false }]));
    expect(result.current.interim).toBe('hello wor');
    act(() => rec.emit([{ t: ' hello world ', final: true }]));
    expect(result.current.interim).toBe(' hello world ');
    act(() => rec.onend?.());
    act(() => rec.onend?.());

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('hello world');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('hello world');
    expect(result.current.listening).toBe(false);
    expect(result.current.interim).toBe('');
  });

  it('maps not-allowed to a friendly error and ignores aborted', () => {
    const { result } = renderHook(() =>
      useSpeechInput({ factory: () => rec, onFinal: vi.fn() }),
    );
    act(() => result.current.start());
    act(() => rec.onerror?.({ error: 'aborted' }));
    expect(result.current.error).toBeUndefined();
    act(() => rec.onerror?.({ error: 'not-allowed' }));
    expect(result.current.error).toBe('Microphone blocked. Allow mic access, or type instead.');
    act(() => rec.onend?.());
    expect(result.current.listening).toBe(false);
  });

  it('factory null is unsupported', () => {
    const { result } = renderHook(() => useSpeechInput({ factory: null, onFinal: vi.fn() }));
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.error).toBe("Voice input isn't supported in this browser. Type instead.");
    expect(result.current.listening).toBe(false);
  });

  it('calls onEnd with empty string and no onFinal when nothing was said', () => {
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ factory: () => rec, onFinal, onEnd }));
    act(() => result.current.start());
    act(() => rec.onend?.());
    expect(onFinal).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith('');
  });

  it('stop() stops the recognizer; unmount aborts', () => {
    const { result, unmount } = renderHook(() =>
      useSpeechInput({ factory: () => rec, onFinal: vi.fn() }),
    );
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(rec.stopped).toBe(1);
    unmount();
    expect(rec.aborted).toBe(1);
  });

  it('uses the latest onFinal callback', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }) => useSpeechInput({ factory: () => rec, onFinal: cb }),
      { initialProps: { cb: a } },
    );
    act(() => result.current.start());
    rerender({ cb: b });
    act(() => rec.emit([{ t: 'hi', final: true }]));
    act(() => rec.onend?.());
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('hi');
  });
});

describe('useSpeechOutput', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('speaks an utterance carrying the cleaned text and tracks speaking', () => {
    const synth = fakeSynth();
    const { result } = renderHook(() => useSpeechOutput({ synth, makeUtterance: mk }));
    expect(result.current.supported).toBe(true);
    act(() => result.current.speak('**Hello** _there_ # friend'));
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const u = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(u.text).toBe('Hello there friend');
    expect(result.current.speaking).toBe(true);
    act(() => u.onend?.());
    expect(result.current.speaking).toBe(false);
  });

  it('strips emoji', () => {
    const synth = fakeSynth();
    const { result } = renderHook(() => useSpeechOutput({ synth, makeUtterance: mk }));
    act(() => result.current.speak('Nice 😀 job'));
    expect((synth.speak.mock.calls[0][0] as FakeUtterance).text).toBe('Nice job');
  });

  it('ignores blank text and unsupported synth', () => {
    const synth = fakeSynth();
    const { result } = renderHook(() => useSpeechOutput({ synth, makeUtterance: mk }));
    act(() => result.current.speak('   '));
    act(() => result.current.speak('**'));
    expect(synth.speak).not.toHaveBeenCalled();

    const { result: r2 } = renderHook(() => useSpeechOutput({ synth: null }));
    expect(r2.current.supported).toBe(false);
    act(() => r2.current.speak('hi'));
  });

  it('muted does not speak; toggleMute persists and cancels', () => {
    const synth = fakeSynth();
    const { result } = renderHook(() => useSpeechOutput({ synth, makeUtterance: mk }));
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem('bw.device.muted')).toBe('1');
    expect(synth.cancel).toHaveBeenCalled();
    act(() => result.current.speak('hello'));
    expect(synth.speak).not.toHaveBeenCalled();

    act(() => result.current.toggleMute());
    expect(localStorage.getItem('bw.device.muted')).toBe('0');
    act(() => result.current.speak('hello'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('reads persisted muted state and honors storageKey', () => {
    localStorage.setItem('custom.key', '1');
    const synth = fakeSynth();
    const { result } = renderHook(() =>
      useSpeechOutput({ synth, makeUtterance: mk, storageKey: 'custom.key' }),
    );
    expect(result.current.muted).toBe(true);
  });

  it('cancels on unmount', () => {
    const synth = fakeSynth();
    const { unmount } = renderHook(() => useSpeechOutput({ synth, makeUtterance: mk }));
    unmount();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
