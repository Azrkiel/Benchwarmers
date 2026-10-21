import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Game, GameEvent, Prop } from '../../src/shared/types.js';
import { fantasyByPlayer, resolveProp, scoreAt } from '../../src/game/engine.js';

const game = JSON.parse(readFileSync(new URL('../../src/game/games/harbor-vs-summit.json', import.meta.url), 'utf8')) as Game;
const props = (JSON.parse(readFileSync(new URL('../../src/ai/fallback/props.json', import.meta.url), 'utf8')) as Prop[]).filter(
  (p) => p.gameId === 'harbor-vs-summit',
);
const events: GameEvent[] = game.events;

const teamOf = new Map<string, 'home' | 'away'>();
for (const p of game.home.roster) teamOf.set(p.id, 'home');
for (const p of game.away.roster) teamOf.set(p.id, 'away');
const STAT_FOR_POINTS: Record<number, string> = { 1: 'ft', 2: 'pts2', 3: 'pts3' };

describe('harbor-vs-summit script', () => {
  it('has 55-65 sorted events within (0, 480] and integer times', () => {
    expect(events.length).toBeGreaterThanOrEqual(55);
    expect(events.length).toBeLessThanOrEqual(65);
    for (let i = 0; i < events.length; i++) {
      const t = events[i].t;
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThanOrEqual(480);
      if (i > 0) expect(t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it('has period events at 120/240/360/480 and exactly 2 timeouts', () => {
    expect(events.filter((e) => e.type === 'period').map((e) => e.t)).toEqual([120, 240, 360, 480]);
    const timeouts = events.filter((e) => e.type === 'timeout');
    expect(timeouts).toHaveLength(2);
    for (const e of timeouts) expect(e.team).toBeDefined();
  });

  it('attributes every score and stat to a real player on the right team', () => {
    for (const e of events) {
      if (e.type === 'score') {
        expect(e.team, e.text).toBeDefined();
        expect(e.points, e.text).toBeDefined();
        expect(e.playerId, e.text).toBeDefined();
        expect(teamOf.get(e.playerId!), e.text).toBe(e.team);
        expect(e.stat, e.text).toBe(STAT_FOR_POINTS[e.points!]);
        if (e.assistPlayerId) {
          expect(teamOf.get(e.assistPlayerId), e.text).toBe(e.team);
          expect(e.assistPlayerId, e.text).not.toBe(e.playerId);
        }
      }
      if (e.type === 'play' && e.stat) {
        expect(['reb', 'stl', 'blk', 'tov']).toContain(e.stat);
        expect(e.playerId, e.text).toBeDefined();
        expect(teamOf.has(e.playerId!), e.text).toBe(true);
        expect(e.team, e.text).toBeDefined();
      }
      expect(e.text.length).toBeGreaterThan(0);
      expect(e.tags.every((tag) => tag === tag.toLowerCase())).toBe(true);
    }
  });

  it('has no score before t=41 and no non-period event on a prop boundary', () => {
    const first = events.find((e) => e.type === 'score')!;
    expect(first.t).toBeGreaterThanOrEqual(41);
    for (const e of events) if (e.type !== 'period') expect(e.t % 20, e.text).not.toBe(0);
  });

  it('ends with the Hawks winning by 1-4 and the final event states the score', () => {
    const s = scoreAt(events, 480);
    expect(s.home - s.away).toBeGreaterThanOrEqual(1);
    expect(s.home - s.away).toBeLessThanOrEqual(4);
    const last = events.filter((e) => e.type === 'period').at(-1)!;
    expect(last.text).toContain(`Hawks ${s.home}`);
    expect(last.text).toContain(`Foxes ${s.away}`);
  });

  it('tells the fantasy story', () => {
    const f = fantasyByPlayer(events, 480);
    const ranked = [...f.entries()].sort((a, b) => b[1].points - a[1].points).map(([id]) => id);
    const mo = f.get('har-c-34')!.points;
    expect(mo).toBeGreaterThanOrEqual(2);
    expect(mo).toBeLessThanOrEqual(4);
    expect(f.get('har-sg-7')!.stats.pts3).toBeGreaterThanOrEqual(5);
    expect(ranked.indexOf('har-sg-7')).toBeLessThan(2);
    expect(ranked.indexOf('sum-pg-2')).toBeLessThan(3);
  });

  it('features nearly every rostered player', () => {
    const seen = new Set<string>();
    for (const e of events) {
      if (e.playerId) seen.add(e.playerId);
      if (e.assistPlayerId) seen.add(e.assistPlayerId);
    }
    const missing = [...teamOf.keys()].filter((id) => !seen.has(id));
    expect(missing.length).toBeLessThanOrEqual(2);
  });
});

const EXPECTED: Record<string, string> = {
  'fb-1': 'home',
  'fb-2': 'three',
  'fb-3': 'under',
  'fb-4': 'away',
  'fb-5': 'ft',
  'fb-6': 'over',
  'fb-7': 'away',
  'fb-8': 'under',
};

describe('fallback props', () => {
  it('has fb-1..fb-8 with the exact windows', () => {
    expect(props.map((p) => p.id)).toEqual(Array.from({ length: 8 }, (_, i) => `fb-${i + 1}`));
    props.forEach((p, i) => {
      expect(p.gameId).toBe('harbor-vs-summit');
      expect(p.source).toBe('fallback');
      expect(p.correctOptionId).toBeUndefined();
      expect(p.opensAt).toBe(60 * i);
      expect(p.locksAt).toBe(60 * i + 40);
      expect(p.resolvesAt).toBe(60 * i + 60);
      expect(p.locksAt - p.opensAt).toBeGreaterThanOrEqual(40);
    });
    expect(props[0].opensAt).toBe(0);
    for (let i = 1; i < props.length; i++) expect(props[i].opensAt).toBeGreaterThanOrEqual(props[i - 1].resolvesAt);
  });

  it('keeps resolver params inside each window and uses each kind at least twice', () => {
    const kinds: Record<string, number> = {};
    for (const p of props) {
      const r = p.resolver;
      kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
      if (r.kind === 'nextScoreType') {
        expect(r.afterT).toBeGreaterThanOrEqual(p.locksAt);
        expect(r.afterT).toBeLessThan(p.resolvesAt);
      } else if (r.kind === 'teamScoresFirst') {
        expect(r.afterT).toBeGreaterThanOrEqual(p.id === 'fb-1' ? 40 : p.locksAt);
        expect(r.untilT).toBeLessThanOrEqual(p.resolvesAt);
        expect(r.afterT).toBeLessThan(r.untilT);
      } else if (r.kind === 'totalPointsOver') {
        expect(r.atT).toBe(p.resolvesAt);
        expect(r.line % 1).toBe(0.5);
      }
    }
    for (const k of ['nextScoreType', 'teamScoresFirst', 'totalPointsOver']) expect(kinds[k]).toBeGreaterThanOrEqual(2);
    expect(props.some((p) => p.resolver.kind === 'nextScoreType' && p.options.some((o) => o.id === 'other'))).toBe(true);
    expect(props.some((p) => p.resolver.kind === 'teamScoresFirst' && p.options.some((o) => o.id === 'none'))).toBe(true);
  });

  it('has probabilities summing to 1 and no betting language', () => {
    for (const p of props) {
      const sum = p.options.reduce((s, o) => s + (o.probability ?? 0), 0);
      expect(Math.abs(sum - 1), p.id).toBeLessThanOrEqual(0.01);
      const words = `${p.question} ${p.explanation} ${p.options.map((o) => o.label).join(' ')}`;
      expect(words).not.toMatch(/\b(bet|odds|money|wager)\b/i);
    }
  });

  for (const p of props) {
    it(`${p.id} resolves to the expected option and explains it`, () => {
      const want = EXPECTED[p.id];
      expect(resolveProp(p, events)).toBe(want);
      const label = p.options.find((o) => o.id === want)!.label;
      expect(p.explanation!.toLowerCase()).toContain(label.toLowerCase());
    });
  }

  it('has varied outcomes', () => {
    const outcomes = props.map((p) => resolveProp(p, events));
    expect(outcomes).not.toContain(undefined);
    for (const id of ['over', 'under', 'home', 'away']) expect(outcomes).toContain(id);
    expect(new Set(outcomes).size).toBeGreaterThanOrEqual(5);
  });
});
