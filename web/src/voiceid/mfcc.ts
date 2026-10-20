import { SAMPLE_RATE } from './types';
import { l2normalize } from './match';

// Pure MFCC mean+std speaker embedding (offline fallback embedder).
// 25 ms frames, 10 ms hop, pre-emphasis 0.97, Hamming window, radix-2 FFT (512),
// 26 triangular mel filters over 20 Hz..min(8000, sr/2), log energies, DCT-II -> 13 coeffs, c0 dropped.
// Embedding = [mean(c1..c12), std(c1..c12)] over frames (24 dims), L2-normalised.

const FRAME_MS = 25;
const HOP_MS = 10;
const PREEMPH = 0.97;
const NFFT = 512;
const NBINS = NFFT / 2 + 1;
const N_MEL = 26;
const N_CEPS = 13; // c0..c12, c0 dropped below
const MEL_LOW_HZ = 20;
const MEL_HIGH_CAP_HZ = 8000;
const LOG_FLOOR = 1e-10;

type Plan = {
  frameLen: number;
  hop: number;
  window: Float64Array;
  melWeights: Float64Array; // N_MEL x NBINS, row-major
  dct: Float64Array; // 12 x N_MEL (coeffs c1..c12), row-major
  cosTable: Float64Array; // FFT twiddles, NFFT/2
  sinTable: Float64Array;
  bitrev: Uint32Array;
};

const plans = new Map<number, Plan>();

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function buildPlan(sampleRate: number): Plan {
  const frameLen = Math.round((FRAME_MS / 1000) * sampleRate);
  const hop = Math.round((HOP_MS / 1000) * sampleRate);

  const window = new Float64Array(frameLen);
  for (let i = 0; i < frameLen; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameLen - 1 || 1));
  }

  const lowHz = MEL_LOW_HZ;
  const highHz = Math.min(MEL_HIGH_CAP_HZ, sampleRate / 2);
  const lowMel = hzToMel(lowHz);
  const highMel = hzToMel(highHz);
  const points = new Float64Array(N_MEL + 2);
  for (let i = 0; i < N_MEL + 2; i++) {
    points[i] = melToHz(lowMel + ((highMel - lowMel) * i) / (N_MEL + 1));
  }

  const melWeights = new Float64Array(N_MEL * NBINS);
  for (let m = 0; m < N_MEL; m++) {
    const left = points[m];
    const center = points[m + 1];
    const right = points[m + 2];
    for (let k = 0; k < NBINS; k++) {
      const f = (k * sampleRate) / NFFT;
      let w = 0;
      if (f > left && f < center) w = (f - left) / (center - left);
      else if (f >= center && f < right) w = (right - f) / (right - center);
      melWeights[m * NBINS + k] = w;
    }
  }

  const dct = new Float64Array(12 * N_MEL);
  for (let k = 1; k < N_CEPS; k++) {
    for (let n = 0; n < N_MEL; n++) {
      dct[(k - 1) * N_MEL + n] = Math.cos((Math.PI * k * (n + 0.5)) / N_MEL);
    }
  }

  const cosTable = new Float64Array(NFFT / 2);
  const sinTable = new Float64Array(NFFT / 2);
  for (let k = 0; k < NFFT / 2; k++) {
    cosTable[k] = Math.cos((2 * Math.PI * k) / NFFT);
    sinTable[k] = -Math.sin((2 * Math.PI * k) / NFFT);
  }

  const bits = Math.log2(NFFT);
  const bitrev = new Uint32Array(NFFT);
  for (let i = 0; i < NFFT; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    bitrev[i] = r;
  }

  return { frameLen, hop, window, melWeights, dct, cosTable, sinTable, bitrev };
}

function getPlan(sampleRate: number): Plan {
  let p = plans.get(sampleRate);
  if (!p) {
    p = buildPlan(sampleRate);
    plans.set(sampleRate, p);
  }
  return p;
}

// In-place iterative radix-2 complex FFT of size NFFT (re/im already bit-reversed-ready input order).
function fft(re: Float64Array, im: Float64Array, plan: Plan): void {
  const { bitrev, cosTable, sinTable } = plan;
  for (let i = 0; i < NFFT; i++) {
    const j = bitrev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let size = 2; size <= NFFT; size *= 2) {
    const half = size / 2;
    const step = NFFT / size;
    for (let start = 0; start < NFFT; start += size) {
      for (let j = 0; j < half; j++) {
        const wr = cosTable[j * step];
        const wi = sinTable[j * step];
        const a = start + j;
        const b = a + half;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

export function mfccEmbedding(x: Float32Array, sampleRate: number = SAMPLE_RATE): Float32Array {
  if (!(Number.isFinite(sampleRate) && sampleRate > 0)) {
    throw new RangeError(`mfccEmbedding: invalid sampleRate ${sampleRate}`);
  }
  const plan = getPlan(sampleRate);
  const { frameLen, hop, window, melWeights, dct } = plan;

  // Pre-emphasis on a sanitised copy (non-finite samples -> 0).
  const n = x.length;
  const y = new Float64Array(Math.max(n, frameLen));
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const s = Number.isFinite(x[i]) ? x[i] : 0;
    y[i] = s - PREEMPH * prev;
    prev = s;
  }

  const numFrames = n <= frameLen ? 1 : 1 + Math.floor((n - frameLen) / hop);

  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const power = new Float64Array(NBINS);
  const logE = new Float64Array(N_MEL);

  // Per-coefficient running sums for mean / std over frames (c1..c12).
  const sum = new Float64Array(12);
  const sumSq = new Float64Array(12);

  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frameLen; i++) {
      const idx = start + i;
      re[i] = idx < n ? y[idx] * window[i] : 0;
    }
    fft(re, im, plan);
    for (let k = 0; k < NBINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];

    for (let m = 0; m < N_MEL; m++) {
      let e = 0;
      const row = m * NBINS;
      for (let k = 0; k < NBINS; k++) e += melWeights[row + k] * power[k];
      logE[m] = Math.log(e + LOG_FLOOR);
    }

    for (let c = 0; c < 12; c++) {
      let v = 0;
      const row = c * N_MEL;
      for (let m = 0; m < N_MEL; m++) v += dct[row + m] * logE[m];
      sum[c] += v;
      sumSq[c] += v * v;
    }
  }

  const out = new Float32Array(24);
  for (let c = 0; c < 12; c++) {
    const mean = sum[c] / numFrames;
    const variance = Math.max(0, sumSq[c] / numFrames - mean * mean);
    out[c] = mean;
    out[12 + c] = Math.sqrt(variance);
  }
  return l2normalize(out);
}
