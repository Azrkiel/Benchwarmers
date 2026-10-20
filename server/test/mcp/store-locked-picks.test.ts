import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/game/store.js';

let dir: string;
let file: string;
let t: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-locked-'));
  file = path.join(dir, 'nested', 'store.json');
  t = 1_000_000;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const mk = () => new Store({ dataFile: file, now: () => t, speed: 4 });

/** Real ms after start for a given game second, at speed 4. */
const atGameSec = (sec: number) => (sec / 4) * 1000;

describe('getState picks for locked props', () => {
  it('includes picks for a locked (not yet resolved) prop, without correct', () => {
    const s = mk();
    s.start('DEMO');
    const startT = t;
    s.pick('DEMO', 'maya', 'home', 'fb-1');
    s.pick('DEMO', 'sam', 'away', 'fb-1');

    // fb-1: opensAt 0, locksAt 40, resolvesAt 60. Game second 50 -> locked.
    t = startT + atGameSec(50);
    const st = s.getState('DEMO');
    const fb1 = st.props.find((p) => p.id === 'fb-1')!;
    expect(fb1.status).toBe('locked');
    expect(fb1).not.toHaveProperty('correctOptionId');
    expect(fb1).not.toHaveProperty('explanation');

    const fb1Picks = st.picks.filter((p) => p.propId === 'fb-1');
    expect(fb1Picks).toHaveLength(2);
    const maya = fb1Picks.find((p) => p.memberId === 'maya')!;
    const sam = fb1Picks.find((p) => p.memberId === 'sam')!;
    expect(maya.memberName).toBe('Maya');
    expect(maya.optionLabel).toBe('Hawks');
    expect(sam.memberName).toBe('Sam');
    expect(sam.optionLabel).toBe('Foxes');
    for (const p of fb1Picks) expect(p).not.toHaveProperty('correct');
  });

  it('keeps the picks after resolution, with correct set', () => {
    const s = mk();
    s.start('DEMO');
    const startT = t;
    s.pick('DEMO', 'maya', 'home', 'fb-1');
    s.pick('DEMO', 'sam', 'away', 'fb-1');

    // Game second 70: fb-1 resolved; fb-2 (opensAt 60) is now active.
    t = startT + atGameSec(70);
    const st = s.getState('DEMO');
    const fb1 = st.props.find((p) => p.id === 'fb-1')!;
    expect(fb1.status).toBe('resolved');
    expect(fb1.correctOptionId).toBeDefined();

    const fb1Picks = st.picks.filter((p) => p.propId === 'fb-1');
    expect(fb1Picks).toHaveLength(2);
    for (const p of fb1Picks) {
      expect(p.correct).toBe(p.optionId === fb1.correctOptionId);
    }
  });
});
