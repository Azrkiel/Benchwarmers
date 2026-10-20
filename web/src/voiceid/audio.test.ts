import { describe, expect, it } from 'vitest';
import { createCapture, downmix, resample, rms, speechSeconds, trimSilence } from './audio';

function sine(freq: number, rate: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function zeroCrossings(x: Float32Array): number {
  let c = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) c++;
  return c;
}

describe('downmix', () => {
  it('averages two channels', () => {
    const out = downmix([Float32Array.from([1, 0, -1]), Float32Array.from([0, 1, -1])]);
    expect(Array.from(out)).toEqual([0.5, 0.5, -1]);
  });
  it('copies a single channel', () => {
    const src = Float32Array.from([0.1, 0.2]);
    const out = downmix([src]);
    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out).not.toBe(src);
  });
});

describe('resample', () => {
  it('48k -> 16k has the right length', () => {
    expect(resample(new Float32Array(48000), 48000).length).toBe(16000);
    expect(resample(new Float32Array(4801), 48000, 16000).length).toBe(1600);
  });
  it('keeps a 440 Hz sine frequency and amplitude', () => {
    const out = resample(sine(440, 48000, 1), 48000);
    const ideal = sine(440, 16000, 1);
    expect(Math.abs(zeroCrossings(out) - 880)).toBeLessThanOrEqual(2);
    expect(rms(out)).toBeCloseTo(rms(ideal), 1);
    // box filter delays by a fraction of a sample at most; compare ignoring edges
    let maxErr = 0;
    for (let i = 20; i < out.length - 20; i++) maxErr = Math.max(maxErr, Math.abs(out[i] - ideal[i]));
    expect(maxErr).toBeLessThan(0.1);
  });
  it('attenuates content above the target Nyquist', () => {
    const src = sine(20000, 48000, 0.5);
    expect(rms(resample(src, 48000))).toBeLessThan(0.3 * rms(src));
  });
  it('upsamples 8k -> 16k with linear interpolation', () => {
    const out = resample(Float32Array.from([0, 1, 0, 1]), 8000, 16000);
    expect(out.length).toBe(8);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(1);
    expect(out[3]).toBeCloseTo(0.5);
  });
  it('copies at the same rate', () => {
    const src = Float32Array.from([1, 2, 3]);
    const out = resample(src, 16000);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out).not.toBe(src);
  });
});

describe('rms', () => {
  it('computes rms of known signals', () => {
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBeCloseTo(1);
    expect(rms(sine(100, 16000, 1, 1))).toBeCloseTo(Math.SQRT1_2, 3);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('trimSilence', () => {
  const rate = 16000;
  const frame = 320; // 20 ms
  const pad = 1600; // 100 ms
  function burstSignal(lead: number, burstLen: number, tail: number): Float32Array {
    const out = new Float32Array(lead + burstLen + tail);
    out.set(sine(440, rate, burstLen / rate, 0.5), lead);
    return out;
  }

  it('removes leading and trailing silence, keeping padding', () => {
    const burst = 16000;
    const x = burstSignal(32000, burst, 32000);
    const out = trimSilence(x);
    expect(Math.abs(out.length - (burst + 2 * pad))).toBeLessThanOrEqual(frame);
    expect(out.length).toBeLessThan(x.length);
  });
  it('returns empty for all-silence', () => {
    expect(trimSilence(new Float32Array(16000)).length).toBe(0);
    expect(trimSilence(new Float32Array(0)).length).toBe(0);
  });
  it('trims a noise floor below the threshold', () => {
    const burst = 16000;
    const x = burstSignal(32000, burst, 32000);
    // about -60 dBFS rms, deterministic
    for (let i = 0; i < x.length; i++) {
      if (i < 32000 || i >= 32000 + burst) x[i] = 0.0014 * Math.sin(i * 12.9898);
    }
    const out = trimSilence(x);
    expect(Math.abs(out.length - (burst + 2 * pad))).toBeLessThanOrEqual(frame);
  });
  it('clamps padding to bounds', () => {
    const x = sine(440, rate, 0.5);
    expect(trimSilence(x).length).toBe(x.length);
  });
});

describe('speechSeconds', () => {
  it('measures the trimmed length in seconds', () => {
    const x = new Float32Array(16000 * 5);
    x.set(sine(440, 16000, 1, 0.5), 16000 * 2);
    expect(speechSeconds(x)).toBeCloseTo(1.2, 1);
    expect(speechSeconds(new Float32Array(16000))).toBe(0);
  });
});

describe('createCapture', () => {
  it('stop() when not recording resolves empty; dispose zeroes level', async () => {
    const cap = createCapture();
    expect(cap.recording).toBe(false);
    expect((await cap.stop()).length).toBe(0);
    const seen: number[] = [];
    const unsub = cap.level$.subscribe((l) => seen.push(l));
    cap.dispose();
    unsub();
    expect(cap.level$.get()).toBe(0);
  });
});
