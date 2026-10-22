import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { espnSummaryToGame } from '../../src/live/convert.js';
import { eventFantasy, gameClock, resolveProp, scoreAt } from '../../src/game/engine.js';
import { buildFootballProps } from '../../src/game/footballProps.js';
import type { Game, GameEvent } from '../../src/shared/types.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/espn-synthetic.json', import.meta.url), 'utf8'));
const game: Game = espnSummaryToGame(fixture);
const player = (name: string) => [...game.home.roster, ...game.away.roster].find((p) => p.name === name)!;
const find = (pred: (e: GameEvent) => boolean) => game.events.find(pred)!;

describe('espnSummaryToGame (synthetic fixture)', () => {
  it('builds a football game with overtime geometry', () => {
    expect(game.id).toBe('espn-900001');
    expect(game.sport).toBe('football');
    expect(game.title).toBe('Northgate Wolves at Lakeview Herons');
    expect(game.periods).toBe(5);
    expect(game.regulationSec).toBe(480);
    expect(game.durationSec).toBe(540);
    expect(game.home.short).toBe('LKV');
    expect(game.away.name).toBe('Northgate Wolves');
  });

  it('score events sum exactly to the final score, including the 2-pt try', () => {
    const sum = { home: 0, away: 0 };
    for (const e of game.events) if (e.type === 'score') sum[e.team!] += e.points!;
    expect(sum).toEqual({ home: 18, away: 10 });
    expect(scoreAt(game.events, game.durationSec)).toEqual({ home: 18, away: 10 });
    const two = find((e) => e.tags.includes('two-point'));
    expect(two.points).toBe(2);
    expect(two.stat).toBeUndefined();
  });

  it('keeps events ordered, with period markers in place', () => {
    for (let i = 1; i < game.events.length; i++) expect(game.events[i].t).toBeGreaterThanOrEqual(game.events[i - 1].t);
    const periods = game.events.filter((e) => e.type === 'period');
    expect(periods.map((e) => e.t)).toEqual([120, 240, 360, 480, 540]);
    expect(periods.at(-1)!.text).toBe('Final: Herons 18, Wolves 10.');
    expect(periods[3].text).toMatch(/Overtime/);
    expect(game.events.every((e) => e.t <= game.durationSec)).toBe(true);
  });

  it('puts the overtime drives inside the OT window and the clock reads OT', () => {
    const ot = game.events.filter((e) => e.type !== 'period' && e.t >= 480);
    expect(ot.length).toBeGreaterThanOrEqual(4);
    expect(ot.every((e) => e.t > 480 && e.t < 540)).toBe(true);
    expect(gameClock(game, 500, 'live')).toEqual({ period: 5, clock: 'OT' });
    expect(gameClock(game, 100, 'live').period).toBe(1);
    expect(gameClock(game, 479, 'live').clock).toMatch(/^Q4 /);
  });

  it('rosters: box score players with positions, numbers and unique ids', () => {
    expect(player('Dan Archer')).toMatchObject({ position: 'QB', number: 7, id: 'lkv-qb-7', teamId: 'lkv' });
    expect(player('Milo Brandt').position).toBe('RB');
    expect(player('Cole Reyes').position).toBe('WR');
    expect(player('Ivan Pike').position).toBe('K');
    const ids = [...game.home.roster, ...game.away.roster].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(game.away.roster.some((p) => p.name === 'TEAM')).toBe(false);
    const gray = player('Finn Gray');
    expect(gray.number).toBeGreaterThan(0); // no jersey -> stable fallback number
    expect(espnSummaryToGame(fixture).away.roster.find((p) => p.name === 'Finn Gray')!.id).toBe(gray.id);
  });

  it('uses a roster position map when given (FB -> RB)', () => {
    const g = espnSummaryToGame(fixture, { '3': 'TE', '2': 'FB' });
    const all = [...g.home.roster, ...g.away.roster];
    expect(all.find((p) => p.name === 'Cole Reyes')!.position).toBe('TE');
    expect(all.find((p) => p.name === 'Milo Brandt')!.position).toBe('RB');
  });

  it('keeps team colors visibly different', () => {
    expect(game.home.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(game.away.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(game.home.color).not.toBe(game.away.color);
    expect(game.away.color).toBe('#c0c0c0'); // primaries were nearly identical -> alternate used
  });

  it('pass: receiver gets rec_yds and the passer is the assist (engine credits pass_yds)', () => {
    const e = find((x) => x.stat === 'rec_yds' && x.yards === 22);
    expect(e.playerId).toBe(player('Cole Reyes').id);
    expect(e.assistPlayerId).toBe(player('Dan Archer').id);
    expect(eventFantasy(e).map((x) => x.stat).sort()).toEqual(['pass_yds', 'rec_yds']);
  });

  it('passing TD: yardage play, then rec_td with the QB as assist, then the XP on the kicker', () => {
    const i = game.events.findIndex((x) => x.stat === 'rec_td');
    const td = game.events[i];
    expect(td).toMatchObject({ type: 'score', points: 6, team: 'home', playerId: player('Cole Reyes').id, assistPlayerId: player('Dan Archer').id });
    expect(game.events[i - 1]).toMatchObject({ stat: 'rec_yds', yards: 20 });
    expect(game.events[i + 1]).toMatchObject({ type: 'score', points: 1, stat: 'xp', playerId: player('Ivan Pike').id });
    expect(eventFantasy(td).map((x) => x.stat).sort()).toEqual(['pass_td', 'rec_td']);
  });

  it('rushing TD with XP; field goals on the kicker', () => {
    expect(find((x) => x.stat === 'rush_td')).toMatchObject({ team: 'away', points: 6, playerId: player('Tariq Moss').id });
    expect(find((x) => x.stat === 'xp' && x.team === 'away').playerId).toBe(player('Owen Vale').id);
    const fgs = game.events.filter((x) => x.stat === 'fg');
    expect(fgs.map((x) => x.playerId)).toEqual([player('Ivan Pike').id, player('Owen Vale').id]);
    expect(fgs.every((x) => x.points === 3)).toBe(true);
  });

  it('interception on the passer and a lost fumble on the ball carrier', () => {
    expect(find((x) => x.stat === 'int')).toMatchObject({ playerId: player('Eli Stone').id });
    const fum = find((x) => x.stat === 'fumble');
    expect(fum.playerId).toBe(player('Milo Brandt').id);
    expect(game.events.some((x) => x.stat === 'rush_yds' && x.yards === 3 && x.playerId === fum.playerId)).toBe(true);
  });

  it('unmatched names keep the text but get no player', () => {
    const e = find((x) => x.text.includes('Walter Walkon'));
    expect(e.playerId).toBeUndefined();
    expect(e.stat).toBeUndefined();
  });

  it('texture plays: kickoff, sack, incompletion, penalty (foul); timeouts and period markers skipped', () => {
    expect(game.events.some((x) => x.tags.includes('kickoff'))).toBe(true);
    expect(game.events.some((x) => x.tags.includes('sack'))).toBe(true);
    expect(game.events.some((x) => x.tags.includes('incomplete'))).toBe(true);
    expect(find((x) => x.type === 'foul').text).toMatch(/^Penalty: LKV Offside/);
    expect(game.events.some((x) => /timeout/i.test(x.text))).toBe(false);
    expect(game.events.some((x) => /End of (2nd|4th)/.test(x.text))).toBe(false);
  });

  it('drives: matching start/end events with riverton-style shapes and mapped results', () => {
    const starts = game.events.filter((e) => e.type === 'drive' && !e.driveResult);
    const ends = game.events.filter((e) => e.driveResult);
    expect(starts.map((s) => s.drive!.id)).toEqual(['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08']);
    expect(ends.map((e) => e.driveResult)).toEqual(['td', 'turnover', 'turnover', 'td', 'fg', 'fg', 'td', 'downs']);
    expect(ends[0].text).toBe('Drive over: touchdown for the Herons.');
    expect(ends[0].tags).toEqual(['drive', 'end', 'td']);
    expect(starts[0].tags).toEqual(['drive', 'start']);
    expect(starts[0].drive).toMatchObject({ team: 'home', yardline100: 75, halfSecondsRemaining: 1800 });
    expect(starts[2].drive!.yardline100).toBe(40); // "NGT 40" on a Lakeview drive = 40 from the end zone
    for (const s of starts) {
      const end = ends.find((e) => e.drive!.id === s.drive!.id)!;
      expect(end.t).toBeGreaterThan(s.t);
    }
  });

  it('builds non-overlapping props that lock before their drive ends and resolve', () => {
    const props = buildFootballProps(game);
    expect(props.length).toBeGreaterThanOrEqual(4);
    for (const p of props) {
      const end = game.events.find((e) => e.driveResult && e.drive!.id === (p.resolver as { driveId: string }).driveId)!;
      expect(p.locksAt).toBeLessThan(end.t);
      expect(p.opensAt).toBeLessThan(p.locksAt);
      expect(p.odds?.p.yes).toBeGreaterThan(0);
      expect(resolveProp(p, game.events)).toBeDefined();
    }
    const sorted = [...props].sort((a, b) => a.opensAt - b.opensAt);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].opensAt).toBeGreaterThanOrEqual(sorted[i - 1].resolvesAt - 1e-9);
  });
});
