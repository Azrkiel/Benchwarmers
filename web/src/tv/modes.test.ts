import { describe, expect, it } from 'vitest';
import { activitySignature, baseModeFor, nextMode, type ModeState } from './modes';
import { fitScale } from './Stage';
import { draftingFixture, liveFixture } from '../lib/fixtures';

describe('baseModeFor', () => {
  it('maps statuses', () => {
    expect(baseModeFor('scheduled')).toBe('draft');
    expect(baseModeFor('drafting')).toBe('draft');
    expect(baseModeFor('live')).toBe('live');
    expect(baseModeFor('final')).toBe('final');
  });
});

describe('activitySignature', () => {
  it('differs across fixtures', () => {
    expect(activitySignature(draftingFixture)).not.toBe(activitySignature(liveFixture));
  });
});

describe('nextMode', () => {
  const live = (sig: string, changedAt: number, mode: ModeState['mode'] = 'live'): ModeState => ({ mode, sig, changedAt });

  it('jumps to live on new signature', () => {
    const r = nextMode(live('a', 0, 'rosters'), { status: 'live', sig: 'b', now: 5000 });
    expect(r).toEqual({ mode: 'live', sig: 'b', changedAt: 5000 });
  });

  it('rotates live -> rosters -> live after 20s', () => {
    const a = nextMode(live('a', 0), { status: 'live', sig: 'a', now: 19999 });
    expect(a.mode).toBe('live');
    const b = nextMode(a, { status: 'live', sig: 'a', now: 20000 });
    expect(b).toEqual({ mode: 'rosters', sig: 'a', changedAt: 20000 });
    const c = nextMode(b, { status: 'live', sig: 'a', now: 40000 });
    expect(c.mode).toBe('live');
  });

  it('stays on draft and final for those statuses', () => {
    const d = nextMode(live('a', 0), { status: 'drafting', sig: 'a', now: 100000 });
    expect(d.mode).toBe('draft');
    expect(nextMode(d, { status: 'drafting', sig: 'a', now: 200000 }).mode).toBe('draft');
    const f = nextMode(live('a', 0), { status: 'final', sig: 'a', now: 100000 });
    expect(f.mode).toBe('final');
    expect(nextMode(f, { status: 'final', sig: 'a', now: 500000 }).mode).toBe('final');
  });
});

describe('fitScale', () => {
  it('is 1 at 1920x1080', () => {
    expect(fitScale(1920, 1080)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
  it('letterboxes vertically when narrow', () => {
    const r = fitScale(960, 1080);
    expect(r.scale).toBe(0.5);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(270);
  });
});
