import { describe, expect, it } from 'vitest';
import { centroid, cosine, identify } from './match';
import { mfccEmbedding } from './mfcc';

const RATE = 16000;

// mulberry32: small seeded PRNG, returns floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type VoiceSpec = { f0: number; formantHz: number; seconds: number; seed: number; jitter: number };

// Harmonic series on f0 with a gaussian spectral envelope centred on formantHz, plus seeded noise.
function synthVoice({ f0, formantHz, seconds, seed, jitter }: VoiceSpec): Float32Array {
  const rand = mulberry32(seed);
  const n = Math.round(RATE * seconds);
  const actualF0 = f0 * (1 + jitter);
  const bw = 600;
  const harmonics: { freq: number; amp: number; phase: number }[] = [];
  for (let k = 1; actualF0 * k < 7900; k++) {
    const freq = actualF0 * k;
    const amp = Math.exp(-((freq - formantHz) ** 2) / (2 * bw * bw));
    harmonics.push({ freq, amp, phase: 2 * Math.PI * rand() });
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const h of harmonics) s += h.amp * Math.sin(2 * Math.PI * h.freq * t + h.phase);
    out[i] = 0.1 * s + 0.01 * (2 * rand() - 1);
  }
  return out;
}

const VOICE_A = { f0: 120, formantHz: 500 };
const VOICE_B = { f0: 220, formantHz: 2000 };

describe('mfccEmbedding', () => {
  it('returns 24 dims, unit norm', () => {
    const e = mfccEmbedding(synthVoice({ ...VOICE_A, seconds: 2, seed: 1, jitter: 0 }));
    expect(e).toBeInstanceOf(Float32Array);
    expect(e.length).toBe(24);
    let s = 0;
    for (const v of e) s += v * v;
    expect(Math.sqrt(s)).toBeCloseTo(1, 5);
  });

  it('never returns NaN for silence, empty or very short input', () => {
    const inputs = [
      new Float32Array(RATE), // 1 s silence
      new Float32Array(0),
      new Float32Array([0.5]),
      new Float32Array(100).fill(0.3),
      new Float32Array(399).map((_, i) => Math.sin(i)),
    ];
    for (const x of inputs) {
      const e = mfccEmbedding(x);
      expect(e.length).toBe(24);
      for (const v of e) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const x = synthVoice({ ...VOICE_B, seconds: 2, seed: 7, jitter: 0.01 });
    const a = mfccEmbedding(x);
    const b = mfccEmbedding(x.slice());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('distinguishes two synthetic voices across takes', () => {
    const A1 = mfccEmbedding(synthVoice({ ...VOICE_A, seconds: 3, seed: 11, jitter: 0 }));
    const A2 = mfccEmbedding(synthVoice({ ...VOICE_A, seconds: 2, seed: 23, jitter: 0.02 }));
    const B1 = mfccEmbedding(synthVoice({ ...VOICE_B, seconds: 2, seed: 31, jitter: 0 }));
    const B2 = mfccEmbedding(synthVoice({ ...VOICE_B, seconds: 3, seed: 47, jitter: -0.02 }));

    const aa = cosine(A1, A2);
    const ab = cosine(A1, B1);
    const bb = cosine(B1, B2);
    const ba = cosine(B1, A1);
    console.info(`cosine A1-A2=${aa.toFixed(4)} A1-B1=${ab.toFixed(4)} B1-B2=${bb.toFixed(4)} B1-A1=${ba.toFixed(4)}`);
    expect(aa).toBeGreaterThan(ab);
    expect(bb).toBeGreaterThan(ba);

    const candidates = [
      { memberId: 'a', memberName: 'Voice A', centroid: centroid([A1]) },
      { memberId: 'b', memberName: 'Voice B', centroid: centroid([B1]) },
    ];
    const opts = { threshold: 0, margin: 0 };
    expect(identify(A2, candidates, opts)?.memberId).toBe('a');
    expect(identify(B2, candidates, opts)?.memberId).toBe('b');
  });

  it('embeds a 5 s clip quickly', () => {
    const x = synthVoice({ ...VOICE_A, seconds: 5, seed: 3, jitter: 0 });
    mfccEmbedding(x); // warm caches
    const t0 = performance.now();
    mfccEmbedding(x);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);
  });
});
