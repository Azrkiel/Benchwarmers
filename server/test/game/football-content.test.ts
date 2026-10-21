import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Game, GameEvent, Prop } from '../../src/shared/types.js';
import { GAMES } from '../../src/game/games.js';
import { PLAYER_PROJECTIONS } from '../../src/game/projections.js';
import { driveOddsProp } from '../../src/game/odds.js';
import { matchGame } from '../../src/mcp/match.js';
import { buildFootballProps } from '../../scripts/build-football-props.js';

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as T;
const game = readJson<Game>('../../src/game/games/riverton-vs-ironwood.json');
const basketball = readJson<Game>('../../src/game/games/harbor-vs-summit.json');
const allProps = readJson<Prop[]>('../../src/ai/fallback/props.json');
const scouting = readJson<Record<string, string>>('../../src/ai/fallback/scouting.json');
const props = allProps.filter((p) => p.gameId === game.id);
const events: GameEvent[] = game.events;

const players = [...game.home.roster, ...game.away.roster];
const teamOf = new Map<string, 'home' | 'away'>();
for (const p of game.home.roster) teamOf.set(p.id, 'home');
for (const p of game.away.roster) teamOf.set(p.id, 'away');

const starts = events.filter((e) => e.type === 'drive' && !e.driveResult);
const ends = events.filter((e) => e.driveResult !== undefined);
const startOf = (id: string) => starts.find((e) => e.drive!.id === id)!;
const endOf = (id: string) => ends.find((e) => e.drive!.id === id)!;
const eventsOfDrive = (id: string) => {
  const s = startOf(id).t;
  const e = endOf(id).t;
  return events.filter((x) => x.t >= s && x.t <= e && x.type !== 'period');
};

describe('riverton-vs-ironwood structure', () => {
  it('is registered after harbor-vs-summit', () => {
    expect(Object.keys(GAMES)[0]).toBe('harbor-vs-summit');
    expect(GAMES['riverton-vs-ironwood'].sport).toBe('football');
  });

  it('has the football header and 8 players per team with positions', () => {
    expect(game.sport).toBe('football');
    expect(game.title).toBe('Riverton Otters at Ironwood Forge');
    expect(game.durationSec).toBe(480);
    expect(game.periods).toBe(4);
    expect(game.away.short).toBe('RIV');
    expect(game.home.short).toBe('IRN');
    expect(game.away.color).not.toBe(game.home.color);
    for (const c of [game.away.color, game.home.color]) {
      expect([basketball.away.color, basketball.home.color]).not.toContain(c);
    }
    for (const team of [game.home, game.away]) {
      expect(team.roster).toHaveLength(8);
      const count = (pos: string) => team.roster.filter((p) => p.position === pos).length;
      expect([count('QB'), count('RB'), count('WR'), count('TE'), count('K')]).toEqual([1, 2, 3, 1, 1]);
      for (const p of team.roster) {
        expect(p.teamId).toBe(team.id);
        expect(p.id).toBe(`${team.short.toLowerCase()}-${p.position.toLowerCase()}-${p.number}`);
        expect(p.nickname, p.id).toBeTruthy();
      }
    }
  });

  it('has no duplicate nicknames or ids across both games', () => {
    const all = [...basketball.home.roster, ...basketball.away.roster, ...players];
    const nicks = all.map((p) => p.nickname!.toLowerCase());
    expect(new Set(nicks).size).toBe(nicks.length);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it('has distinct projections for all 16 football players', () => {
    const vals = players.map((p) => PLAYER_PROJECTIONS[p.id]);
    for (const v of vals) expect(v).toBeGreaterThan(0);
    expect(new Set(vals).size).toBe(16);
    expect(new Set(Object.values(PLAYER_PROJECTIONS)).size).toBe(Object.keys(PLAYER_PROJECTIONS).length);
  });

  it('has scouting notes for every football player', () => {
    for (const p of players) expect(scouting[p.id], p.id).toContain(p.nickname!);
  });

  it('has sorted integer event times in (0, 480] and period events at 120/240/360/480', () => {
    for (let i = 0; i < events.length; i++) {
      expect(Number.isInteger(events[i].t)).toBe(true);
      expect(events[i].t).toBeGreaterThan(0);
      expect(events[i].t).toBeLessThanOrEqual(480);
      if (i > 0) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
      expect(events[i].text.length).toBeGreaterThan(0);
      expect(events[i].tags.every((t) => t === t.toLowerCase())).toBe(true);
    }
    expect(events.filter((e) => e.type === 'period').map((e) => e.t)).toEqual([120, 240, 360, 480]);
  });

  it('has 10-12 drives that alternate possession with sequential, non-overlapping spans', () => {
    expect(starts.length).toBeGreaterThanOrEqual(10);
    expect(starts.length).toBeLessThanOrEqual(12);
    expect(ends).toHaveLength(starts.length);
    expect(new Set(starts.map((s) => s.drive!.id)).size).toBe(starts.length);
    for (let i = 0; i < starts.length; i++) {
      const d = starts[i].drive!;
      expect(starts[i].team).toBe(d.team);
      expect(endOf(d.id).team).toBe(d.team);
      if (i > 0) {
        expect(d.team).not.toBe(starts[i - 1].drive!.team);
        expect(starts[i].t).toBeGreaterThan(endOf(starts[i - 1].drive!.id).t);
      }
      expect(endOf(d.id).t).toBeGreaterThanOrEqual(starts[i].t);
    }
  });

  it('gives each start event a DriveState on the 7.5x football clock', () => {
    let twoMinute = 0;
    for (const s of starts) {
      const d = s.drive!;
      expect(d.halfSecondsRemaining).toBe(1800 - (s.t % 240) * 7.5);
      expect(d.yardline100).toBeGreaterThanOrEqual(1);
      expect(d.yardline100).toBeLessThanOrEqual(99);
      if (d.halfSecondsRemaining < 120) twoMinute++;
    }
    expect(twoMinute).toBeGreaterThanOrEqual(1);
    const yl = starts.map((s) => s.drive!.yardline100);
    expect(yl.filter((y) => y >= 65 && y <= 80).length).toBeGreaterThanOrEqual(6);
    expect(yl.filter((y) => y <= 50).length).toBeGreaterThanOrEqual(2);
  });

  it('gives each end event the same DriveState and a driveResult; plays carry yards', () => {
    for (const s of starts) {
      const e = endOf(s.drive!.id);
      expect(e.drive).toEqual(s.drive);
      const body = eventsOfDrive(s.drive!.id).filter((x) => x.type === 'play' && x.stat?.endsWith('_yds'));
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body.length).toBeLessThanOrEqual(5);
      for (const p of body) {
        expect(p.team).toBe(s.team);
        expect(teamOf.get(p.playerId!)).toBe(s.team);
        expect(p.yards).toBeGreaterThan(0);
        if (p.stat === 'rec_yds') {
          expect(p.assistPlayerId).toBeDefined();
          expect(teamOf.get(p.assistPlayerId!)).toBe(s.team);
          expect(players.find((x) => x.id === p.assistPlayerId)!.position).toBe('QB');
        }
      }
    }
  });

  it('scores a TD as a 6-point score plus a separate 1-point xp, and a FG as 3 points', () => {
    const kicker = (team: 'home' | 'away') => players.find((p) => p.position === 'K' && teamOf.get(p.id) === team)!.id;
    for (const s of starts) {
      const id = s.drive!.id;
      const end = endOf(id);
      const body = eventsOfDrive(id).filter((x) => x.type === 'score');
      if (end.driveResult === 'td') {
        const td = body.filter((x) => x.points === 6);
        const xp = body.filter((x) => x.points === 1);
        expect(td, id).toHaveLength(1);
        expect(xp, id).toHaveLength(1);
        expect(['rush_td', 'rec_td']).toContain(td[0].stat);
        if (td[0].stat === 'rec_td') {
          expect(players.find((x) => x.id === td[0].assistPlayerId)!.position).toBe('QB');
        }
        expect(xp[0].stat).toBe('xp');
        expect(xp[0].playerId).toBe(kicker(s.team!));
        expect(xp[0].t).toBeGreaterThanOrEqual(td[0].t);
        expect(end.t).toBeGreaterThanOrEqual(xp[0].t);
      } else if (end.driveResult === 'fg') {
        expect(body, id).toHaveLength(1);
        expect(body[0].points).toBe(3);
        expect(body[0].stat).toBe('fg');
        expect(body[0].playerId).toBe(kicker(s.team!));
      } else {
        expect(body, id).toHaveLength(0);
      }
    }
  });

  it('has a plausible final score stated in the last event', () => {
    let home = 0;
    let away = 0;
    for (const e of events) {
      if (e.type !== 'score') continue;
      if (e.team === 'home') home += e.points!;
      else away += e.points!;
    }
    expect(Math.abs(home - away)).toBeLessThanOrEqual(14);
    expect(home + away).toBeGreaterThanOrEqual(30);
    expect(home + away).toBeLessThanOrEqual(65);
    const last = events.at(-1)!;
    expect(last.type).toBe('period');
    expect(last.text).toContain(`Otters ${away}`);
    expect(last.text).toContain(`Forge ${home}`);
  });

  it('mixes drive results', () => {
    const results = new Set(ends.map((e) => e.driveResult));
    for (const r of ['td', 'fg', 'punt', 'turnover', 'downs', 'end_of_half']) expect(results).toContain(r);
  });
});

describe('football fallback props', () => {
  it('equals the build script output', () => {
    expect(props).toEqual(buildFootballProps(game));
  });

  it('keeps basketball props first and numbers football ones ff-1..ff-8', () => {
    expect(allProps.slice(0, 8).every((p) => p.gameId === 'harbor-vs-summit')).toBe(true);
    expect(props.map((p) => p.id)).toEqual(Array.from({ length: 8 }, (_, i) => `ff-${i + 1}`));
  });

  it('follows the window rules', () => {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      expect(p.source).toBe('fallback');
      expect(p.correctOptionId).toBeUndefined();
      expect(p.options.map((o) => o.id)).toEqual(['yes', 'no']);
      if (p.resolver.kind !== 'driveResult') throw new Error('expected a driveResult resolver');
      const start = startOf(p.resolver.driveId);
      const end = endOf(p.resolver.driveId);
      expect(p.opensAt).toBe(start.t);
      expect(p.locksAt).toBeGreaterThanOrEqual(p.opensAt + 30);
      expect(p.resolvesAt).toBe(end.t);
      expect(p.resolvesAt).toBeGreaterThanOrEqual(p.locksAt + 1);
      const first = eventsOfDrive(start.drive!.id).find((e) => e.type !== 'drive')!;
      expect(first.t).toBeGreaterThanOrEqual(p.opensAt + 30);
      expect(first.t).toBeGreaterThanOrEqual(p.locksAt);
      if (i > 0) expect(p.opensAt).toBeGreaterThanOrEqual(props[i - 1].resolvesAt);
      expect(p.odds).toEqual(driveOddsProp(start.drive!, p.resolver.outcome));
      expect(p.odds!.p.yes + p.odds!.p.no).toBeCloseTo(1, 9);
      const words = `${p.question} ${p.options.map((o) => o.label).join(' ')}`;
      expect(words).not.toMatch(/\b(bet|odds|money|wager|payout)\b/i);
    }
  });

  it('has both outcome kinds, both teams, and both yes and no winning', () => {
    const answers: string[] = [];
    const kinds: string[] = [];
    const sides = new Set<string>();
    for (const p of props) {
      if (p.resolver.kind !== 'driveResult') throw new Error('expected a driveResult resolver');
      const r = endOf(p.resolver.driveId).driveResult;
      const yes = p.resolver.outcome === 'td' ? r === 'td' : r === 'td' || r === 'fg';
      answers.push(yes ? 'yes' : 'no');
      kinds.push(p.resolver.outcome);
      sides.add(startOf(p.resolver.driveId).team!);
    }
    expect(answers).toContain('yes');
    expect(answers).toContain('no');
    expect(kinds).toContain('score');
    expect(kinds).toContain('td');
    expect(sides.size).toBe(2);
  });
});

describe('matchGame with football', () => {
  const games = Object.values(GAMES);
  const idOf = (s: string | undefined): string => {
    const r = matchGame(s, games);
    if (!r.ok) throw new Error(`${s}: ${JSON.stringify(r)}`);
    return r.value.id;
  };
  it.each(['the football game', 'football', 'Otters', 'Forge', 'Riverton', 'Ironwood', 'Otters at Forge', 'riverton-vs-ironwood'])(
    '%s -> riverton-vs-ironwood',
    (s) => expect(idOf(s)).toBe('riverton-vs-ironwood'),
  );
  it.each([undefined, '', 'Hawks vs Foxes', 'basketball', 'Harbor'])('%s -> harbor-vs-summit', (s) =>
    expect(idOf(s)).toBe('harbor-vs-summit'),
  );
});
