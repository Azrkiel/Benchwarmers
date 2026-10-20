import { describe, expect, it } from 'vitest';
import { centroid, cosine, DEFAULT_MATCH, identify, l2normalize, toSpeakerHint } from './match';
import type { Candidate } from './match';

const opts = { threshold: 0.85, margin: 0.05 };
const cand = (id: string, v: number[]): Candidate => ({ memberId: id, memberName: id.toUpperCase(), centroid: v });
const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));

describe('cosine', () => {
  it('identical = 1, orthogonal = 0', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('is scale invariant', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });
  it('zero vector = 0', () => {
    expect(cosine([0, 0], [1, 2])).toBe(0);
    expect(cosine([1, 2], [0, 0])).toBe(0);
  });
  it('throws on length mismatch', () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow();
  });
});

describe('l2normalize', () => {
  it('returns unit vector', () => {
    expect(norm(l2normalize([3, 4]))).toBeCloseTo(1, 6);
  });
  it('zero vector stays zero without NaN', () => {
    expect(Array.from(l2normalize([0, 0, 0]))).toEqual([0, 0, 0]);
  });
});

describe('centroid', () => {
  it('has unit norm', () => {
    expect(norm(centroid([[1, 0, 0], [0, 1, 0]]))).toBeCloseTo(1, 5);
  });
  it('differently-scaled copies of one direction give that unit direction', () => {
    const c = centroid([[1, 2, 2], [10, 20, 20], [0.1, 0.2, 0.2]]);
    const u = l2normalize([1, 2, 2]);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(u[i], 5);
  });
  it('throws on empty', () => {
    expect(() => centroid([])).toThrow();
  });
});

describe('identify', () => {
  it('returns null without candidates', () => {
    expect(identify([1, 0], [], opts)).toBeNull();
  });
  it('accepts a clear winner', () => {
    const r = identify([1, 0.05], [cand('maya', [1, 0]), cand('leo', [0, 1])], opts)!;
    expect(r.accepted).toBe(true);
    expect(r.memberId).toBe('maya');
    expect(r.runnerUp?.memberId).toBe('leo');
    expect(r.reason).toBeUndefined();
    expect(r.confidence).toBeGreaterThan(0.99);
  });
  it('rejects below threshold', () => {
    const r = identify([1, 1], [cand('maya', [1, 0]), cand('leo', [0, -1])], opts)!;
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('below-threshold');
  });
  it('rejects on small margin when best is above threshold', () => {
    const r = identify([1, 0], [cand('maya', [1, 0.1]), cand('leo', [1, 0.12])], opts)!;
    expect(r.ranked[0].score).toBeGreaterThanOrEqual(opts.threshold);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('small-margin');
  });
  it('accepts a single candidate with no runnerUp', () => {
    const r = identify([1, 0], [cand('maya', [1, 0.1])], opts)!;
    expect(r.accepted).toBe(true);
    expect(r.runnerUp).toBeUndefined();
    expect(r.ranked).toHaveLength(1);
  });
  it('orders ranked best first', () => {
    const r = identify([1, 0, 0], [cand('c', [0, 0, 1]), cand('a', [1, 0, 0]), cand('b', [1, 1, 0])], opts)!;
    expect(r.ranked.map((x) => x.memberId)).toEqual(['a', 'b', 'c']);
    expect(r.memberId).toBe('a');
  });
  it('clamps confidence to [0,1]', () => {
    const r = identify([1, 0], [cand('maya', [-1, 0])], opts)!;
    expect(r.confidence).toBe(0);
    expect(r.accepted).toBe(false);
  });
});

describe('toSpeakerHint', () => {
  it('returns a hint when accepted', () => {
    const r = identify([1, 0], [cand('maya', [1, 0]), cand('leo', [0, 1])], opts);
    const h = toSpeakerHint(r)!;
    expect(h.memberName).toBe('MAYA');
    expect(h.source).toBe('voice-id');
    expect(h.confidence).toBeCloseTo(1, 5);
  });
  it('returns null when rejected or null', () => {
    const r = identify([1, 1], [cand('maya', [1, 0]), cand('leo', [0, -1])], opts);
    expect(toSpeakerHint(r)).toBeNull();
    expect(toSpeakerHint(null)).toBeNull();
  });
});

describe('DEFAULT_MATCH', () => {
  it('has per-backend defaults', () => {
    expect(DEFAULT_MATCH.wavlm).toEqual({ threshold: 0.85, margin: 0.05 });
    expect(DEFAULT_MATCH.mfcc).toEqual({ threshold: 0.9, margin: 0.02 });
  });
});
