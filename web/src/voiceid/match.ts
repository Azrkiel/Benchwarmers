import type { SpeakerHint } from '@shared/types';
import type { Backend } from './types';

export type MatchOptions = { threshold: number; margin: number };

export const DEFAULT_MATCH: Record<Backend, MatchOptions> = {
  wavlm: { threshold: 0.85, margin: 0.05 },
  mfcc: { threshold: 0.9, margin: 0.02 },
};

export type Candidate = { memberId: string; memberName: string; centroid: ArrayLike<number> };
export type Ranked = { memberId: string; memberName: string; score: number };
export type MatchResult = {
  memberId: string;
  memberName: string;
  confidence: number;
  accepted: boolean;
  runnerUp?: Ranked;
  ranked: Ranked[];
  reason?: 'below-threshold' | 'small-margin';
};

function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

export function l2normalize(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length);
  const n = norm(v);
  if (n === 0 || !Number.isFinite(n)) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function centroid(vectors: ArrayLike<number>[]): Float32Array {
  if (vectors.length === 0) throw new Error('centroid: no vectors');
  const dim = vectors[0].length;
  const sum = new Float32Array(dim);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error('centroid: length mismatch');
    const n = l2normalize(v);
    for (let i = 0; i < dim; i++) sum[i] += n[i];
  }
  for (let i = 0; i < dim; i++) sum[i] /= vectors.length;
  return l2normalize(sum);
}

export function identify(
  embedding: ArrayLike<number>,
  candidates: Candidate[],
  opts: MatchOptions,
): MatchResult | null {
  if (candidates.length === 0) return null;
  const ranked: Ranked[] = candidates
    .map((c) => ({ memberId: c.memberId, memberName: c.memberName, score: cosine(embedding, c.centroid) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const aboveThreshold = best.score >= opts.threshold;
  const clearMargin = !runnerUp || best.score - runnerUp.score >= opts.margin;
  const accepted = aboveThreshold && clearMargin;
  const result: MatchResult = {
    memberId: best.memberId,
    memberName: best.memberName,
    confidence: Math.min(1, Math.max(0, best.score)),
    accepted,
    ranked,
  };
  if (runnerUp) result.runnerUp = runnerUp;
  if (!accepted) result.reason = aboveThreshold ? 'small-margin' : 'below-threshold';
  return result;
}

export function toSpeakerHint(r: MatchResult | null): SpeakerHint | null {
  if (!r || !r.accepted) return null;
  return { memberName: r.memberName, confidence: r.confidence, source: 'voice-id' };
}
