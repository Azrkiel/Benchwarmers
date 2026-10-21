import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Game, GameEvent, Prop, StatType } from '../../src/shared/types.js';
import { FANTASY_SCORING } from '../../src/shared/types.js';
import { autoFill, eventFantasy, fantasyByPlayer, gameClock, resolveProp, scoreAt, statLine } from '../../src/game/engine.js';
import { GAMES, fallbackProps } from '../../src/game/games.js';
import { Store } from '../../src/game/store.js';

const game = GAMES['riverton-vs-ironwood'];
const basket = GAMES['harbor-vs-summit'];

const ev = (o: Partial<GameEvent>): GameEvent => ({ t: 0, type: 'play', text: '', tags: [], ...o });
const stats = (o: Partial<Record<StatType, number>>): Record<StatType, number> =>
  ({ ...Object.fromEntries(Object.keys(FANTASY_SCORING).map((k) => [k, 0])), ...o }) as Record<StatType, number>;

describe('football eventFantasy', () => {
  it('scores receiving yards per yard and credits the QB with pass yards', () => {
    const f = eventFantasy(ev({ stat: 'rec_yds', yards: 22, playerId: 'wr', assistPlayerId: 'qb' }));
    expect(f).toEqual([
      { playerId: 'wr', stat: 'rec_yds', points: 2.2 },
      { playerId: 'qb', stat: 'pass_yds', points: 0.88 },
    ]);
  });
  it('scores rushing yards without a passer', () => {
    expect(eventFantasy(ev({ stat: 'rush_yds', yards: 9, playerId: 'rb' }))).toEqual([{ playerId: 'rb', stat: 'rush_yds', points: 0.9 }]);
  });
  it('gives a receiving TD 6 and the QB a pass TD (4), never an assist', () => {
    const f = eventFantasy(ev({ type: 'score', points: 6, stat: 'rec_td', playerId: 'te', assistPlayerId: 'qb' }));
    expect(f.map((x) => [x.playerId, x.stat, x.points])).toEqual([
      ['te', 'rec_td', 6],
      ['qb', 'pass_td', 4],
    ]);
    expect(f.some((x) => x.stat === 'ast')).toBe(false);
  });
  it('scores rush TD, xp, fg, int and fumble once each', () => {
    const one = (type: GameEvent['type'], stat: StatType) => eventFantasy(ev({ type, stat, playerId: 'p' }))[0];
    expect(one('score', 'rush_td').points).toBe(6);
    expect(one('score', 'xp').points).toBe(1);
    expect(one('score', 'fg').points).toBe(3);
    expect(one('play', 'int').points).toBe(-2);
    expect(one('play', 'fumble').points).toBe(-2);
  });
  it('still gives basketball assists', () => {
    const f = eventFantasy(ev({ type: 'score', points: 2, stat: 'pts2', playerId: 'a', assistPlayerId: 'b' }));
    expect(f).toEqual([
      { playerId: 'a', stat: 'pts2', points: 2 },
      { playerId: 'b', stat: 'ast', points: 1.5 },
    ]);
  });
  it('totals the real game by yardage and stat counts', () => {
    const m = fantasyByPlayer(game.events, game.durationSec);
    const qb = m.get('riv-qb-12')!;
    expect(qb.stats.pass_yds).toBeGreaterThan(0);
    expect(qb.stats.pass_td).toBeGreaterThanOrEqual(1);
    expect(qb.stats.int).toBe(1);
    expect(qb.stats.ast).toBe(0);
    const yds = game.events.filter((e) => e.playerId === 'riv-wr-81' && e.stat === 'rec_yds').reduce((n, e) => n + (e.yards ?? 0), 0);
    expect(m.get('riv-wr-81')!.stats.rec_yds).toBe(yds);
  });
});

describe('football statLine', () => {
  it('formats only non-zero parts', () => {
    expect(statLine(stats({ pass_yds: 212, pass_td: 2 }), 'football')).toBe('212 PASS YDS, 2 PASS TD');
    expect(statLine(stats({ rush_yds: 88, rush_td: 1 }), 'football')).toBe('88 RUSH YDS, 1 TD');
    expect(statLine(stats({ fg: 2, xp: 3 }), 'football')).toBe('2 FG, 3 XP');
    expect(statLine(stats({ rec_yds: 40, rec_td: 1, fumble: 1 }), 'football')).toBe('40 REC YDS, 1 TD, 1 FUM');
    expect(statLine(stats({ pass_yds: 10, int: 2 }))).toBe('10 PASS YDS, 2 INT');
  });
  it('has wording for an empty football line and leaves basketball alone', () => {
    expect(statLine(undefined, 'football')).toBe('No stats yet');
    expect(statLine(undefined)).toBe('0 PTS');
    expect(statLine(stats({ pts2: 2, pts3: 1, reb: 3 }), 'basketball')).toBe('7 PTS, 3 REB');
  });
});

describe('football gameClock', () => {
  it('counts down a 15:00 period over 120 game seconds', () => {
    expect(gameClock(game, 0, 'live')).toEqual({ period: 1, clock: 'Q1 15:00' });
    expect(gameClock(game, 60, 'live')).toEqual({ period: 1, clock: 'Q1 7:30' });
    expect(gameClock(game, 120, 'live')).toEqual({ period: 2, clock: 'Q2 15:00' });
    expect(gameClock(game, 180, 'live')).toEqual({ period: 2, clock: 'Q2 7:30' });
    expect(gameClock(game, 479, 'live').clock).toBe('Q4 0:08');
    expect(gameClock(game, 480, 'live')).toEqual({ period: 4, clock: 'Q4 0:00' });
    expect(gameClock(game, 480, 'final')).toEqual({ period: 4, clock: 'Final' });
  });
  it('leaves basketball unchanged', () => {
    expect(gameClock(basket, 0, 'drafting').clock).toBe('Q1 2:00');
  });
});

describe('driveResult resolver', () => {
  const props = fallbackProps(game.id);
  const byDrive = (id: string) => props.find((p) => p.resolver.kind === 'driveResult' && p.resolver.driveId === id)!;
  const endOf = (id: string) => game.events.find((e) => e.driveResult && e.drive?.id === id)!;

  it('resolves every real prop to yes/no matching the drive result', () => {
    expect(props).toHaveLength(8);
    for (const p of props) {
      if (p.resolver.kind !== 'driveResult') throw new Error('kind');
      const res = endOf(p.resolver.driveId).driveResult;
      const expected = p.resolver.outcome === 'td' ? res === 'td' : res === 'td' || res === 'fg';
      expect(resolveProp(p, game.events)).toBe(expected ? 'yes' : 'no');
    }
    const outcomes = new Set(props.map((p) => resolveProp(p, game.events)));
    expect(outcomes).toEqual(new Set(['yes', 'no']));
  });

  const synth = (driveResult: GameEvent['driveResult'] | undefined, outcome: 'score' | 'td'): [Prop, GameEvent[]] => {
    const drive = { id: 'dx', team: 'home' as const, yardline100: 75, halfSecondsRemaining: 900 };
    const events: GameEvent[] = [ev({ t: 1, type: 'drive', drive })];
    if (driveResult) events.push(ev({ t: 10, type: 'drive', drive, driveResult }));
    const prop: Prop = {
      id: 'x',
      gameId: 'g',
      question: 'q',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      opensAt: 1,
      locksAt: 5,
      resolvesAt: 10,
      resolver: { kind: 'driveResult', driveId: 'dx', outcome },
      source: 'fallback',
    };
    return [prop, events];
  };
  it('score: td and fg are yes, others no; td: only td is yes', () => {
    for (const [res, score, td] of [
      ['td', 'yes', 'yes'],
      ['fg', 'yes', 'no'],
      ['punt', 'no', 'no'],
      ['turnover', 'no', 'no'],
      ['missed_fg', 'no', 'no'],
    ] as const) {
      expect(resolveProp(...synth(res, 'score'))).toBe(score);
      expect(resolveProp(...synth(res, 'td'))).toBe(td);
    }
  });
  it('voids when the drive has no end event by resolvesAt', () => {
    expect(resolveProp(...synth(undefined, 'score'))).toBeUndefined();
    const [p, evs] = synth('td', 'score');
    expect(resolveProp({ ...p, resolvesAt: 9 }, evs)).toBeUndefined();
  });
});

describe('football score', () => {
  it('ends 24-20 for Riverton (away) over Ironwood (home)', () => {
    expect(scoreAt(game.events, game.durationSec)).toEqual({ away: 24, home: 20 });
    expect(scoreAt(game.events, 0)).toEqual({ away: 0, home: 0 });
  });
});

describe('football auto-fill', () => {
  it('picks the best remaining projection, varying positions per member', () => {
    const added = autoFill(game, [], 'p', ['a', 'b', 'c', 'd'], 0);
    expect(added).toHaveLength(12);
    expect(new Set(added.map((d) => d.playerId)).size).toBe(12);
    expect(added.slice(0, 2).map((d) => d.playerId)).toEqual(['riv-qb-12', 'irn-qb-9']);
    const all = game.home.roster.concat(game.away.roster);
    for (const m of ['a', 'b', 'c', 'd']) {
      const pos = added.filter((d) => d.memberId === m).map((d) => all.find((p) => p.id === d.playerId)!.position);
      expect(new Set(pos).size).toBe(3);
    }
  });
});

describe('football party (store)', () => {
  let dir: string;
  let t: number;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fb-'));
    t = 1_000_000;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates, drafts, starts, plays to the end and resolves every drive prop', () => {
    const s = new Store({ dataFile: path.join(dir, 's.json'), now: () => t, speed: 4 });
    const p = s.createParty({ crewId: 'sunday-crew', gameId: game.id });
    expect(s.getState(p.code).game.sport).toBe('football');
    expect(s.getState(p.code).props).toHaveLength(8);
    expect(s.getState(p.code).draftBoard).toHaveLength(16);
    expect('sport' in s.getState('DEMO').game).toBe(false);

    s.draft(p.code, 'maya', 'riv-te-88');
    const board = s.getState(p.code).draftBoard;
    expect(board.find((b) => b.player.id === 'riv-te-88')!.ownerName).toBe('Maya');
    s.start(p.code);
    const drafted = s.getState(p.code).draftBoard.filter((b) => b.ownerMemberId);
    expect(drafted).toHaveLength(12);
    expect(drafted.some((b) => b.player.id === 'riv-qb-12')).toBe(true);
    expect(s.getState(p.code).game.clock).toBe('Q1 15:00');

    const seen = new Set<string>();
    let sawFantasy = false;
    const lifecycle: string[] = [];
    s.onLifecycle((e) => lifecycle.push(e.type));
    for (let i = 0; i < 120; i++) {
      t += (5 / s.speed) * 1000;
      s.tick();
      const st = s.getState(p.code);
      if (i === 5) s.pick(p.code, 'sam', 'yes');
      for (const pv of st.props) if (pv.status === 'open') seen.add(pv.id);
      for (const e of st.recentEvents) for (const f of e.fantasy) if (f.points !== 0) sawFantasy = true;
    }
    const st = s.getState(p.code);
    expect(st.party.status).toBe('final');
    expect(st.game.clock).toBe('Final');
    expect(st.game.sport).toBe('football');
    expect(st.game.home.score).toBe(20);
    expect(st.game.away.score).toBe(24);
    expect(seen.size).toBe(8);
    expect(sawFantasy).toBe(true);
    expect(lifecycle.filter((x) => x === 'prop_resolved')).toHaveLength(8);
    expect(lifecycle.filter((x) => x === 'party_final')).toHaveLength(1);
    expect(st.props.every((pv) => pv.status === 'resolved' && (pv.correctOptionId === 'yes' || pv.correctOptionId === 'no'))).toBe(true);
    expect(st.standings).toHaveLength(4);
    expect(st.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(st.standings[0].roster.every((r) => /PASS|RUSH|REC|FG|XP|INT|No stats/.test(r.statLine))).toBe(true);
    expect(st.benchwarmerOfTheNight).toBeDefined();
  });
});
