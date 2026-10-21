import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DriveState } from '../../src/shared/types.js';
import { driveOddsProp, getOdds } from '../../src/game/odds.js';

type Row = { p_score: number; p_td: number; n: number };
const raw = JSON.parse(readFileSync(new URL('../../src/game/odds/drive_odds.json', import.meta.url), 'utf8')) as Record<string, Row>;

const drive = (yardline100: number, halfSecondsRemaining: number): DriveState => ({
  id: 'd01',
  team: 'home',
  yardline100,
  halfSecondsRemaining,
});

describe('getOdds buckets', () => {
  it('splits bands at 10/11', () => {
    expect(getOdds(10, 900, 'score').bucket).toBe('1-10|normal');
    expect(getOdds(11, 900, 'score').bucket).toBe('11-20|normal');
  });

  it('maps 99 to the last band', () => {
    expect(getOdds(99, 900, 'td').bucket).toBe('91-99|normal');
  });

  it('clamps out-of-range yardlines', () => {
    expect(getOdds(0, 900, 'score').bucket).toBe('1-10|normal');
    expect(getOdds(100, 900, 'score').bucket).toBe('91-99|normal');
    expect(getOdds(-5, 900, 'score').bucket).toBe('1-10|normal');
  });

  it('rounds fractional yardlines', () => {
    expect(getOdds(10.4, 900, 'score').bucket).toBe('1-10|normal');
    expect(getOdds(10.6, 900, 'score').bucket).toBe('11-20|normal');
  });

  it('switches clock state at 120 seconds', () => {
    expect(getOdds(50, 119, 'score').bucket).toBe('41-50|two-minute');
    expect(getOdds(50, 120, 'score').bucket).toBe('41-50|normal');
  });

  it('returns the row values for the requested type', () => {
    const r = getOdds(25, 900, 'score');
    expect(r).toEqual({ p: raw['21-30|normal']!.p_score, bucket: '21-30|normal', n: raw['21-30|normal']!.n });
    expect(getOdds(25, 900, 'td').p).toBe(raw['21-30|normal']!.p_td);
  });

  it('shares one bucket across a merged band', () => {
    const wide = Object.keys(raw).filter((k) => {
      const [range] = k.split('|');
      const [lo, hi] = range!.split('-').map(Number);
      return hi! - lo! + 1 > 10;
    });
    if (wide.length === 0) {
      for (const k of Object.keys(raw)) {
        const [lo, hi] = k.split('|')[0]!.split('-').map(Number);
        expect(hi! - lo! + 1).toBeLessThanOrEqual(10);
      }
      return;
    }
    for (const k of wide) {
      const [range, clock] = k.split('|');
      const [lo, hi] = range!.split('-').map(Number);
      const secs = clock === 'two-minute' ? 60 : 900;
      expect(getOdds(lo!, secs, 'score').bucket).toBe(k);
      expect(getOdds(hi!, secs, 'score').bucket).toBe(k);
      expect(getOdds(lo!, secs, 'score')).toEqual(getOdds(hi!, secs, 'score'));
    }
  });

  it('maps yardline 5 and 35 at 60s to the same merged bucket', () => {
    expect(getOdds(5, 60, 'score').bucket).toBe('1-40|two-minute');
    expect(getOdds(35, 60, 'score').bucket).toBe(getOdds(5, 60, 'score').bucket);
  });

  it('covers every yardline 1-99 in both clock states', () => {
    for (const secs of [60, 900]) {
      for (let y = 1; y <= 99; y++) {
        const r = getOdds(y, secs, 'score');
        expect(raw[r.bucket]).toBeDefined();
      }
    }
  });
});

describe('drive_odds.json data', () => {
  it('has p_td <= p_score for every key', () => {
    for (const [k, v] of Object.entries(raw)) {
      expect(v.p_td, k).toBeLessThanOrEqual(v.p_score);
    }
  });

  it('has n >= 200 for every key', () => {
    for (const [k, v] of Object.entries(raw)) {
      expect(v.n, k).toBeGreaterThanOrEqual(200);
    }
  });
});

describe('driveOddsProp', () => {
  const drives = [drive(1, 1500), drive(25, 900), drive(50, 100), drive(75, 119), drive(99, 30), drive(35, 60)];

  it('sums yes + no to 1 for both outcomes', () => {
    for (const d of drives) {
      for (const outcome of ['score', 'td'] as const) {
        const { p } = driveOddsProp(d, outcome);
        expect(p.yes! + p.no!).toBeCloseTo(1, 10);
        expect(p.yes! + p.no!).toBe(1);
      }
    }
  });

  it('fills source, bucket and n from the lookup', () => {
    const o = driveOddsProp(drive(25, 900), 'score');
    expect(o.source).toBe('drive_odds');
    expect(o.bucket).toBe('21-30|normal');
    expect(o.n).toBe(raw['21-30|normal']!.n);
    expect(o.p.yes).toBe(0.831);
    expect(o.p.no).toBe(0.169);
  });

  it('rounds to 3 decimals', () => {
    for (const d of drives) {
      const { yes, no } = driveOddsProp(d, 'td').p;
      expect(Math.round(yes! * 1000) / 1000).toBe(yes);
      expect(Math.round(no! * 1000) / 1000).toBe(no);
    }
  });

  it('has td yes < score yes for the same drive', () => {
    for (const d of drives) {
      expect(driveOddsProp(d, 'td').p.yes!).toBeLessThan(driveOddsProp(d, 'score').p.yes!);
    }
  });
});
