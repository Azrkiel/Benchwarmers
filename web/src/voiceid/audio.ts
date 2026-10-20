import { SAMPLE_RATE } from './types';

/** Average of channels. A single channel is copied. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  const k = channels.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < k; c++) s += channels[c][i];
    out[i] = s / k;
  }
  return out;
}

/**
 * Linear-interpolation resampler. Downsampling averages over the ratio window
 * first (box low-pass) to limit aliasing.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number = SAMPLE_RATE): Float32Array {
  if (fromRate === toRate) return input.slice();
  const n = input.length;
  const outLen = Math.round((n * toRate) / fromRate);
  const out = new Float32Array(outLen);
  if (n === 0 || outLen === 0) return out;
  const ratio = fromRate / toRate;

  if (ratio > 1) {
    // cum[k] = sum of input[0..k-1]; average over [t - ratio/2, t + ratio/2]
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + input[i];
    const at = (p: number): number => {
      if (p <= 0) return 0;
      if (p >= n) return cum[n];
      const i = Math.floor(p);
      return cum[i] + (cum[i + 1] - cum[i]) * (p - i);
    };
    for (let i = 0; i < outLen; i++) {
      const t = (i + 0.5) * ratio; // center of output sample in input space
      const a = Math.max(0, t - ratio / 2);
      const b = Math.min(n, t + ratio / 2);
      out[i] = b > a ? (at(b) - at(a)) / (b - a) : input[Math.min(n - 1, Math.floor(t))];
    }
    return out;
  }

  for (let i = 0; i < outLen; i++) {
    const p = i * ratio;
    const i0 = Math.min(n - 1, Math.floor(p));
    const i1 = Math.min(n - 1, i0 + 1);
    const f = p - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export function rms(x: Float32Array): number {
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

export function trimSilence(
  x: Float32Array,
  opts: { sampleRate?: number; frameMs?: number; thresholdDb?: number; padMs?: number } = {},
): Float32Array {
  const rate = opts.sampleRate ?? SAMPLE_RATE;
  const frame = Math.max(1, Math.round((rate * (opts.frameMs ?? 20)) / 1000));
  const thresholdDb = opts.thresholdDb ?? -45;
  const pad = Math.round((rate * (opts.padMs ?? 100)) / 1000);
  const nFrames = Math.ceil(x.length / frame);
  if (nFrames === 0) return new Float32Array(0);

  const db = new Float64Array(nFrames);
  let loudest = -Infinity;
  for (let f = 0; f < nFrames; f++) {
    const r = rms(x.subarray(f * frame, Math.min(x.length, (f + 1) * frame)));
    db[f] = r > 0 ? 20 * Math.log10(r) : -Infinity;
    if (db[f] > loudest) loudest = db[f];
  }
  if (!Number.isFinite(loudest)) return new Float32Array(0);
  const cut = Math.max(thresholdDb, loudest - 35);

  let first = -1;
  let last = -1;
  for (let f = 0; f < nFrames; f++) {
    if (db[f] >= cut) {
      if (first < 0) first = f;
      last = f;
    }
  }
  if (first < 0) return new Float32Array(0);
  const start = Math.max(0, first * frame - pad);
  const end = Math.min(x.length, (last + 1) * frame + pad);
  return x.slice(start, end);
}

export function speechSeconds(x: Float32Array, sampleRate: number = SAMPLE_RATE): number {
  return trimSilence(x, { sampleRate }).length / sampleRate;
}

export type Level = { get(): number; subscribe(fn: (level: number) => void): () => void };
export type Capture = {
  start(): Promise<void>;
  stop(): Promise<Float32Array>;
  readonly recording: boolean;
  level$: Level;
  dispose(): void;
};

export function createCapture(opts: { trim?: boolean } = {}): Capture {
  let level = 0;
  const subs = new Set<(l: number) => void>();
  const setLevel = (l: number): void => {
    level = l;
    subs.forEach((fn) => fn(l));
  };
  const level$: Level = {
    get: () => level,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };

  let recording = false;
  let starting: Promise<void> | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let proc: ScriptProcessorNode | null = null;
  let mute: GainNode | null = null;
  let chunks: Float32Array[] = [];

  function teardown(): number {
    const rate = ctx?.sampleRate ?? SAMPLE_RATE;
    if (proc) proc.onaudioprocess = null;
    try {
      source?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      proc?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      mute?.disconnect();
    } catch {
      /* already disconnected */
    }
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => undefined);
    source = null;
    proc = null;
    mute = null;
    stream = null;
    ctx = null;
    recording = false;
    setLevel(0);
    return rate;
  }

  async function doStart(): Promise<void> {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    stream = s;
    const c = new AudioContext();
    ctx = c;
    chunks = [];
    source = c.createMediaStreamSource(s);
    // ScriptProcessorNode is deprecated but needs no separate AudioWorklet module file.
    proc = c.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(data.slice());
      setLevel(Math.min(1, rms(data) * 4));
    };
    mute = c.createGain();
    mute.gain.value = 0;
    source.connect(proc);
    proc.connect(mute);
    mute.connect(c.destination);
    recording = true;
  }

  return {
    async start() {
      if (recording) return;
      if (starting) return starting;
      starting = doStart().finally(() => {
        starting = null;
      });
      return starting;
    },
    async stop() {
      // A stop() issued while getUserMedia is still pending must not leave the mic open.
      if (starting) await starting.catch(() => undefined);
      if (!recording) return new Float32Array(0);
      const rate = teardown();
      const taken = chunks;
      chunks = [];
      let total = 0;
      for (const c of taken) total += c.length;
      const joined = new Float32Array(total);
      let off = 0;
      for (const c of taken) {
        joined.set(c, off);
        off += c.length;
      }
      const mono = downmix([joined]);
      const res = resample(mono, rate, SAMPLE_RATE);
      return opts.trim === false ? res : trimSilence(res, { sampleRate: SAMPLE_RATE });
    },
    get recording() {
      return recording;
    },
    level$,
    dispose() {
      if (ctx || stream) teardown();
      chunks = [];
      recording = false;
      setLevel(0);
    },
  };
}
