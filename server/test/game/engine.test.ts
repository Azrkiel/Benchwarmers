import { describe, expect, it } from 'vitest';
import {
  FANTASY_SCORING,
  type DraftPick,
  type Game,
  type GameEvent,
  type Pick,
  type Player,
  type Position,
  type Prop,
  type PropOdds,
  type StatType,
} from '../../src/shared/types.js';
import {
  GameError,
  allPlayers,
  alternativesFor,
  autoFill,
  computeGameT,
  computeStandings,
  draftPlayer,
  eventFantasy,
  fantasyByPlayer,
  findPlayer,
  gameClock,
  playerLabel,
  propStatus,
  resolveProp,
  rollRanks,
  round1,
  roundHalf,
  scoreAt,
  scorePick,
  statLine,
  tallyPicks,
  upsertPick,
  visibleEvents,
} from '../../src/game/engine.js';
import { PLAYER_PROJECTIONS, projectionOf } from '../../src/game/projections.js';

// ---------- fixtures ----------

const mk = (id: string, teamId: string, position: Position, nickname?: string): Player => ({
  id,
  teamId,
  name: `Name ${id}`,
  number: 1,
  position,
  ...(nickname ? { nickname } : {}),
});

// Ids match the real roster so PLAYER_PROJECTIONS applies.
const game: Game = {
  id: 'g',
  title: 'Test',
  durationSec: 480,
  periods: 4,
  events: [],
  home: {
    id: 'harbor',
    name: 'Harbor',
    short: 'HAR',
    color: '#000',
    roster: [
      mk('har-pg-1', 'harbor', 'PG', 'Jet'),
      mk('har-sg-7', 'harbor', 'SG', 'Splash'),
      mk('har-c-34', 'harbor', 'C', 'Big Mo'),
      mk('har-c-44', 'harbor', 'C', 'The Wall'),
    ],
  },
  away: {
    id: 'summit',
    name: 'Summit',
    short: 'SUM',
    color: '#fff',
    roster: [
      mk('sum-pg-2', 'summit', 'PG', 'Quick Kai'),
      mk('sum-sg-10', 'summit', 'SG', 'Rafa'),
      mk('sum-c-50', 'summit', 'C', 'Tower'),
      mk('sum-pf-32', 'summit', 'PF'),
    ],
  },
};

const ev = (t: number, o: Partial<GameEvent> = {}): GameEvent => ({ t, type: 'score', text: 'x', tags: [], ...o });
const scoreEv = (t: number, team: 'home' | 'away', stat: 'pts2' | 'pts3' | 'ft', extra: Partial<GameEvent> = {}): GameEvent =>
  ev(t, { type: 'score', team, stat, points: stat === 'pts3' ? 3 : stat === 'pts2' ? 2 : 1, ...extra });

const mkProp = (id: string, o: Partial<Prop> = {}): Prop => ({
  id,
  gameId: 'g',
  question: 'q',
  options: [
    { id: 'three', label: 'A three' },
    { id: 'two', label: 'A two' },
    { id: 'ft', label: 'Free throw' },
  ],
  opensAt: 10,
  locksAt: 20,
  resolvesAt: 30,
  resolver: { kind: 'nextScoreType', afterT: 20 },
  source: 'fallback',
  ...o,
});

const pick = (memberId: string, propId: string, optionId: string, at = 1): Pick => ({
  partyId: 'p',
  memberId,
  propId,
  optionId,
  at,
  source: 'voice',
});

// ---------- clock ----------

describe('computeGameT', () => {
  it('scales by speed and clamps', () => {
    expect(computeGameT(5000, 1000, 4, 480)).toBe(16);
    expect(computeGameT(500, 1000, 4, 480)).toBe(0);
    expect(computeGameT(10_000_000, 0, 4, 480)).toBe(480);
    expect(computeGameT(5000, undefined, 4, 480)).toBe(0);
  });
});

describe('gameClock', () => {
  it('counts down within a period', () => {
    expect(gameClock(game, 0, 'live')).toEqual({ period: 1, clock: 'Q1 2:00' });
    expect(gameClock(game, 130, 'live')).toEqual({ period: 2, clock: 'Q2 1:50' });
    expect(gameClock(game, 119, 'live')).toEqual({ period: 1, clock: 'Q1 0:01' });
    expect(gameClock(game, 120, 'live')).toEqual({ period: 2, clock: 'Q2 2:00' });
  });
  it('final and end of game', () => {
    expect(gameClock(game, 480, 'final')).toEqual({ period: 4, clock: 'Final' });
    expect(gameClock(game, 480, 'live').period).toBe(4);
  });
});

describe('events helpers', () => {
  const events = [scoreEv(50, 'away', 'pts3'), scoreEv(10, 'home', 'pts2'), ev(20, { type: 'play' }), scoreEv(60, 'home', 'ft')];
  it('visibleEvents filters and sorts by t', () => {
    expect(visibleEvents(events, 50).map((e) => e.t)).toEqual([10, 20, 50]);
  });
  it('scoreAt sums score points by team', () => {
    expect(scoreAt(events, 55)).toEqual({ home: 2, away: 3 });
    expect(scoreAt(events, 100)).toEqual({ home: 3, away: 3 });
    expect(scoreAt(events, 0)).toEqual({ home: 0, away: 0 });
  });
});

// ---------- lifecycle ----------

describe('propStatus', () => {
  const p = mkProp('a');
  it('boundaries', () => {
    expect(propStatus(p, 9.9)).toBe('upcoming');
    expect(propStatus(p, 10)).toBe('open');
    expect(propStatus(p, 19.9)).toBe('open');
    expect(propStatus(p, 20)).toBe('locked');
    expect(propStatus(p, 29.9)).toBe('locked');
    expect(propStatus(p, 30)).toBe('resolved');
  });
});

describe('upsertPick', () => {
  const p = mkProp('a');
  it('accepts only while open', () => {
    expect(upsertPick([], pick('m', 'a', 'two'), p, 15)).toHaveLength(1);
    expect(() => upsertPick([], pick('m', 'a', 'two'), p, 5)).toThrowError('That question is not open yet.');
    expect(() => upsertPick([], pick('m', 'a', 'two'), p, 20)).toThrowError('Picks are locked for this question.');
    expect(() => upsertPick([], pick('m', 'a', 'two'), p, 35)).toThrowError('Picks are locked for this question.');
    for (const t of [5, 20, 35]) {
      try {
        upsertPick([], pick('m', 'a', 'two'), p, t);
      } catch (e) {
        expect(e).toBeInstanceOf(GameError);
        expect((e as GameError).code).toBe('PICKS_LOCKED');
        expect((e as GameError).name).toBe('GameError');
      }
    }
  });
  it('rejects bad option', () => {
    try {
      upsertPick([], pick('m', 'a', 'nope'), p, 15);
      expect.unreachable();
    } catch (e) {
      expect((e as GameError).code).toBe('BAD_OPTION');
    }
  });
  it('latest pick wins and input is not mutated', () => {
    const first = [pick('m', 'a', 'two', 1), pick('n', 'a', 'ft', 2)];
    const next = upsertPick(first, pick('m', 'a', 'three', 3), p, 15);
    expect(first).toHaveLength(2);
    expect(first[0].optionId).toBe('two');
    expect(next).toHaveLength(2);
    expect(next.find((x) => x.memberId === 'm')?.optionId).toBe('three');
    expect(next.find((x) => x.memberId === 'n')?.optionId).toBe('ft');
  });
});

// ---------- resolvers ----------

describe('resolveProp nextScoreType', () => {
  const p = mkProp('a');
  it('maps stat to option, skipping earlier scores', () => {
    const events = [scoreEv(15, 'home', 'pts2'), scoreEv(22, 'home', 'pts3')];
    expect(resolveProp(p, events)).toBe('three');
    expect(resolveProp(p, [scoreEv(20, 'away', 'ft')])).toBe('ft');
    expect(resolveProp(p, [scoreEv(25, 'away', 'pts2')])).toBe('two');
  });
  it('uses other when the option is missing, else voids', () => {
    const noThree = mkProp('b', { options: [{ id: 'two', label: 'two' }, { id: 'other', label: 'other' }] });
    expect(resolveProp(noThree, [scoreEv(25, 'home', 'pts3')])).toBe('other');
    const noOther = mkProp('c', { options: [{ id: 'two', label: 'two' }] });
    expect(resolveProp(noOther, [scoreEv(25, 'home', 'pts3')])).toBeUndefined();
  });
  it('voids with no score or only after resolvesAt', () => {
    expect(resolveProp(p, [])).toBeUndefined();
    expect(resolveProp(p, [scoreEv(31, 'home', 'pts2')])).toBeUndefined();
    expect(resolveProp(p, [ev(25, { type: 'play' })])).toBeUndefined();
  });
});

describe('resolveProp teamScoresFirst', () => {
  const opts = [{ id: 'home', label: 'H' }, { id: 'away', label: 'A' }];
  const p = mkProp('a', { options: opts, resolver: { kind: 'teamScoresFirst', afterT: 20, untilT: 28 } });
  it('first scoring team in window', () => {
    expect(resolveProp(p, [scoreEv(19, 'home', 'pts2'), scoreEv(21, 'away', 'pts2')])).toBe('away');
    expect(resolveProp(p, [scoreEv(20, 'home', 'pts2')])).toBe('home');
  });
  it('none option or void', () => {
    const withNone = mkProp('b', {
      options: [...opts, { id: 'none', label: 'Nobody' }],
      resolver: { kind: 'teamScoresFirst', afterT: 20, untilT: 28 },
    });
    expect(resolveProp(withNone, [scoreEv(28, 'home', 'pts2')])).toBe('none');
    expect(resolveProp(p, [scoreEv(28, 'home', 'pts2')])).toBeUndefined();
  });
});

describe('resolveProp totalPointsOver', () => {
  const p = mkProp('a', {
    options: [{ id: 'over', label: 'o' }, { id: 'under', label: 'u' }],
    resolver: { kind: 'totalPointsOver', atT: 25, line: 5 },
  });
  const events = [scoreEv(10, 'home', 'pts2'), scoreEv(20, 'away', 'pts3'), scoreEv(26, 'home', 'pts3')];
  it('over / under / equal -> under', () => {
    expect(resolveProp({ ...p, resolver: { kind: 'totalPointsOver', atT: 25, line: 4.5 } }, events)).toBe('over');
    expect(resolveProp(p, events)).toBe('under'); // 5 == line
    expect(resolveProp({ ...p, resolver: { kind: 'totalPointsOver', atT: 25, line: 6.5 } }, events)).toBe('under');
  });
});

// ---------- tally / streaks ----------

describe('tallyPicks', () => {
  // props i: resolves at 10*i+5, resolved by gameT 100; nextScore afterT window
  const props = [1, 2, 3, 4, 5].map((i) =>
    mkProp(`p${i}`, { opensAt: i * 10, locksAt: i * 10 + 2, resolvesAt: i * 10 + 5, resolver: { kind: 'nextScoreType', afterT: i * 10 + 2 } }),
  );
  const twos = props.map((_, i) => scoreEv((i + 1) * 10 + 3, 'home', 'pts2'));

  it('3 correct = 10 + 15 + 20, 4th = +20 (cap)', () => {
    const picks = props.slice(0, 4).map((p) => pick('m', p.id, 'two', 7));
    const t3 = tallyPicks('m', props.slice(0, 3), picks, twos, 100);
    expect(t3).toMatchObject({ pickPoints: 45, streak: 3, bestStreak: 3, correct: 3, total: 3 });
    const t4 = tallyPicks('m', props.slice(0, 4), picks, twos, 100);
    expect(t4.pickPoints).toBe(65);
    expect(t4.streak).toBe(4);
  });

  it('wrong resets so next correct = 10', () => {
    const picks = [pick('m', 'p1', 'two'), pick('m', 'p2', 'two'), pick('m', 'p3', 'ft'), pick('m', 'p4', 'two')];
    const t = tallyPicks('m', props.slice(0, 4), picks, twos, 100);
    expect(t.pickPoints).toBe(10 + 15 + 10);
    expect(t).toMatchObject({ streak: 1, bestStreak: 2, correct: 3, total: 4 });
  });

  it('void and no-pick leave streak unchanged', () => {
    // p2 has no score in window -> void
    const events = [twos[0], twos[2], twos[3]];
    const picks = [pick('m', 'p1', 'two'), pick('m', 'p2', 'two'), pick('m', 'p3', 'two')];
    const t = tallyPicks('m', props.slice(0, 3), picks, events, 100);
    expect(t).toMatchObject({ pickPoints: 25, streak: 2, correct: 2, total: 2 });
    // no pick on p2
    const picks2 = [pick('m', 'p1', 'two'), pick('m', 'p3', 'two')];
    const t2 = tallyPicks('m', props.slice(0, 3), picks2, twos, 100);
    expect(t2).toMatchObject({ pickPoints: 25, streak: 2, total: 2 });
  });

  it('ignores unresolved props, other members; lastPickAt is max over all picks', () => {
    const picks = [pick('m', 'p1', 'two', 5), pick('m', 'p5', 'two', 99), pick('x', 'p1', 'two', 500)];
    const t = tallyPicks('m', props, picks, twos, 20);
    expect(t.total).toBe(1);
    expect(t.lastPickAt).toBe(99);
    expect(tallyPicks('nobody', props, picks, twos, 100).lastPickAt).toBeUndefined();
  });
});

// ---------- projections ----------

describe('projections', () => {
  it('covers all 16 players, distinct, Big Mo highest', () => {
    const ids = allPlayers(game).map((p) => p.id);
    for (const id of ids) expect(projectionOf(id)).toBeGreaterThan(0);
    expect(Object.keys(PLAYER_PROJECTIONS)).toHaveLength(16);
    expect(new Set(Object.values(PLAYER_PROJECTIONS)).size).toBe(16);
    const max = Math.max(...Object.values(PLAYER_PROJECTIONS));
    expect(PLAYER_PROJECTIONS['har-c-34']).toBe(max);
    expect(projectionOf('sum-pg-2')).toBeGreaterThan(19);
    expect(projectionOf('har-sg-7')).toBeGreaterThan(19);
    expect(projectionOf('unknown')).toBe(0);
  });
});

// ---------- draft ----------

const dp = (memberId: string, playerId: string, round: 1 | 2 | 3 = 1): DraftPick => ({
  partyId: 'p',
  memberId,
  playerId,
  round,
  at: 1,
});

describe('draft', () => {
  const base = { game, partyId: 'p', now: 99, status: 'drafting' as const };

  it('helpers', () => {
    expect(allPlayers(game).map((p) => p.id)[0]).toBe('har-pg-1');
    expect(allPlayers(game)).toHaveLength(8);
    expect(findPlayer(game, 'sum-c-50')?.nickname).toBe('Tower');
    expect(findPlayer(game, 'zzz')).toBeUndefined();
    expect(playerLabel(findPlayer(game, 'sum-pf-32')!)).toBe('Name sum-pf-32');
    expect(playerLabel(findPlayer(game, 'har-c-34')!)).toBe('Big Mo');
    expect(alternativesFor(game, [dp('s', 'har-c-34')], 'C').map((p) => p.id)).toEqual(['sum-c-50', 'har-c-44']);
    expect(alternativesFor(game, [], 'C', 1).map((p) => p.id)).toEqual(['har-c-34']);
  });

  it('drafts a player with next round, not mutating', () => {
    const drafts = [dp('sam', 'har-c-34')];
    const d = draftPlayer({ ...base, drafts, memberId: 'sam', playerId: 'sum-pg-2' });
    expect(d).toEqual({ partyId: 'p', memberId: 'sam', playerId: 'sum-pg-2', round: 2, at: 99 });
    expect(drafts).toHaveLength(1);
    expect(draftPlayer({ ...base, status: 'scheduled', drafts: [], memberId: 'sam', playerId: 'sum-pg-2' }).round).toBe(1);
  });

  it('PLAYER_TAKEN has two same-position alternatives', () => {
    try {
      draftPlayer({ ...base, drafts: [dp('sam', 'har-c-34')], memberId: 'maya', playerId: 'har-c-34', memberNames: { sam: 'Sam' } });
      expect.unreachable();
    } catch (e) {
      const err = e as GameError;
      expect(err.code).toBe('PLAYER_TAKEN');
      expect(err.message).toBe("Big Mo is already on Sam's team. Try Tower or The Wall.");
      expect(err.alternatives?.map((a) => a.id)).toEqual(['sum-c-50', 'har-c-44']);
      expect(err.alternatives?.[0]).toEqual({ id: 'sum-c-50', name: 'Name sum-c-50', nickname: 'Tower' });
    }
  });

  it('PLAYER_TAKEN fallback owner name and same-member message', () => {
    expect(() => draftPlayer({ ...base, drafts: [dp('sam', 'har-c-34')], memberId: 'maya', playerId: 'har-c-34' })).toThrowError(
      "Big Mo is already on someone else's team.",
    );
    expect(() => draftPlayer({ ...base, drafts: [dp('maya', 'har-c-34')], memberId: 'maya', playerId: 'har-c-34' })).toThrowError(
      'You already have Big Mo.',
    );
  });

  it('PLAYER_TAKEN falls back to best remaining overall when position exhausted', () => {
    const drafts = [dp('a', 'sum-pf-32'), dp('b', 'har-pg-1')];
    try {
      draftPlayer({ ...base, drafts, memberId: 'c', playerId: 'sum-pf-32' });
      expect.unreachable();
    } catch (e) {
      expect((e as GameError).code).toBe('PLAYER_TAKEN');
      expect((e as GameError).alternatives?.map((a) => a.id)).toEqual(['har-c-34', 'sum-pg-2']);
    }
  });

  it('PLAYER_TAKEN keeps the one same-position player first and pads to two', () => {
    const drafts = [dp('a', 'har-c-34'), dp('b', 'sum-c-50')];
    try {
      draftPlayer({ ...base, drafts, memberId: 'c', playerId: 'har-c-34' });
      expect.unreachable();
    } catch (e) {
      const alts = (e as GameError).alternatives ?? [];
      expect(alts).toHaveLength(2);
      expect(alts[0].id).toBe('har-c-44');
      expect(alts[1].id).not.toBe('har-c-44');
    }
  });

  it('ROSTER_FULL, BAD_STATUS, NOT_FOUND and check order', () => {
    const full = [dp('sam', 'har-pg-1', 1), dp('sam', 'har-sg-7', 2), dp('sam', 'har-c-34', 3)];
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as GameError).code;
      }
      return undefined;
    };
    expect(() => draftPlayer({ ...base, drafts: full, memberId: 'sam', playerId: 'sum-c-50' })).toThrowError('You already have three players.');
    expect(code(() => draftPlayer({ ...base, drafts: full, memberId: 'sam', playerId: 'sum-c-50' }))).toBe('ROSTER_FULL');
    // roster full beats player taken
    expect(code(() => draftPlayer({ ...base, drafts: full, memberId: 'sam', playerId: 'har-pg-1' }))).toBe('ROSTER_FULL');
    expect(code(() => draftPlayer({ ...base, status: 'live', drafts: [], memberId: 'sam', playerId: 'sum-c-50' }))).toBe('BAD_STATUS');
    expect(code(() => draftPlayer({ ...base, status: 'final', drafts: [], memberId: 'sam', playerId: 'nope' }))).toBe('BAD_STATUS');
    expect(() => draftPlayer({ ...base, status: 'live', drafts: [], memberId: 'sam', playerId: 'sum-c-50' })).toThrowError(
      'The draft is closed. The game has already tipped off.',
    );
    expect(code(() => draftPlayer({ ...base, drafts: [], memberId: 'sam', playerId: 'nope' }))).toBe('NOT_FOUND');
  });
});

describe('autoFill', () => {
  it('fills to 3, best by projection, prefers missing positions, no duplicates', () => {
    const added = autoFill(game, [], 'p', ['a', 'b'], 500);
    expect(added).toHaveLength(6);
    expect(added.every((d) => d.auto === true && d.at === 500 && d.partyId === 'p')).toBe(true);
    expect(new Set(added.map((d) => d.playerId)).size).toBe(6);
    const of = (m: string) => added.filter((d) => d.memberId === m);
    expect(of('a').map((d) => d.round)).toEqual([1, 2, 3]);
    expect(of('a').map((d) => d.playerId)).toEqual(['har-c-34', 'har-sg-7', 'har-pg-1']);
    expect(of('b').map((d) => d.playerId)).toEqual(['sum-pg-2', 'sum-c-50', 'sum-sg-10']);
    for (const m of ['a', 'b']) {
      const pos = of(m).map((d) => findPlayer(game, d.playerId)!.position);
      expect(new Set(pos).size).toBe(3);
    }
  });

  it('only returns new picks, respects existing drafts, deterministic', () => {
    const existing = [dp('a', 'har-c-34')];
    const added = autoFill(game, existing, 'p', ['a', 'b'], 7);
    expect(added).toHaveLength(5);
    expect(added.filter((d) => d.memberId === 'a').map((d) => d.round)).toEqual([2, 3]);
    expect(added.some((d) => d.playerId === 'har-c-34')).toBe(false);
    expect(autoFill(game, existing, 'p', ['a', 'b'], 7)).toEqual(added);
    const fullAll = autoFill(game, [...existing, ...added], 'p', ['a', 'b'], 8);
    expect(fullAll).toEqual([]);
  });

  it('falls back to any undrafted when positions run out', () => {
    // 3 members x 3 = 9 > 8 players: last member gets only what is left
    const added = autoFill(game, [], 'p', ['a', 'b', 'c'], 1);
    expect(added).toHaveLength(8);
    expect(new Set(added.map((d) => d.playerId)).size).toBe(8);
  });
});

// ---------- fantasy ----------

describe('fantasy', () => {
  const stats: StatType[] = ['pts2', 'pts3', 'ft', 'reb', 'ast', 'stl', 'blk', 'tov'];
  it('each stat scores per FANTASY_SCORING', () => {
    for (const stat of stats) {
      const type = stat === 'pts2' || stat === 'pts3' || stat === 'ft' ? 'score' : 'play';
      const r = eventFantasy(ev(1, { type, playerId: 'x', stat }));
      expect(r).toEqual([{ playerId: 'x', stat, points: FANTASY_SCORING[stat] }]);
    }
    expect(FANTASY_SCORING.tov).toBeLessThan(0);
  });
  it('assist on a score credits the assister; other events nothing', () => {
    expect(eventFantasy(ev(1, { playerId: 'a', stat: 'pts3', assistPlayerId: 'b' }))).toEqual([
      { playerId: 'a', stat: 'pts3', points: 3 },
      { playerId: 'b', stat: 'ast', points: 1.5 },
    ]);
    expect(eventFantasy(ev(1, { type: 'foul', playerId: 'a', stat: 'reb' }))).toEqual([]);
    expect(eventFantasy(ev(1, { type: 'score' }))).toEqual([]);
    expect(eventFantasy(ev(1, { type: 'play', playerId: 'a', stat: 'reb', assistPlayerId: 'b' }))).toHaveLength(1);
  });
  it('fantasyByPlayer aggregates visible events, rounds', () => {
    const events: GameEvent[] = [
      ev(1, { playerId: 'a', stat: 'pts3', assistPlayerId: 'b', team: 'home', points: 3 }),
      ev(2, { type: 'play', playerId: 'a', stat: 'reb' }),
      ev(3, { type: 'play', playerId: 'a', stat: 'reb' }),
      ev(4, { type: 'play', playerId: 'a', stat: 'tov' }),
      ev(50, { type: 'play', playerId: 'a', stat: 'blk' }),
    ];
    const m = fantasyByPlayer(events, 10);
    expect(m.get('a')!.points).toBe(round1(3 + 1.2 * 2 - 1));
    expect(m.get('a')!.points).toBe(4.4);
    expect(m.get('a')!.stats).toMatchObject({ pts3: 1, reb: 2, tov: 1, blk: 0 });
    expect(m.get('b')!.points).toBe(1.5);
    expect(fantasyByPlayer(events, 100).get('a')!.stats.blk).toBe(1);
    expect(m.has('zzz')).toBe(false);
  });
  it('round1 avoids -0', () => {
    expect(Object.is(round1(-0.04), 0)).toBe(true);
    expect(round1(1.25 + 0.0001)).toBe(1.3);
    expect(round1(0.1 + 0.2)).toBe(0.3);
  });
  it('statLine', () => {
    const z = Object.fromEntries(Object.keys(FANTASY_SCORING).map((k) => [k, 0])) as Record<StatType, number>;
    expect(statLine(z)).toBe('0 PTS');
    expect(statLine(undefined)).toBe('0 PTS');
    expect(statLine({ ...z, pts2: 3, pts3: 1, ft: 3, reb: 5, ast: 3, stl: 1 })).toBe('12 PTS, 5 REB, 3 AST, 1 STL');
    expect(statLine({ ...z, blk: 2, tov: 1 })).toBe('0 PTS, 2 BLK, 1 TOV');
  });
});

// ---------- phase 8 pick bonuses ----------

describe('scorePick', () => {
  // opensAt 0, locksAt 100 so gameT == f * 100
  const prop = mkProp('b1', { opensAt: 0, locksAt: 100, resolvesAt: 110 });
  const at = (gameT: number | undefined, member = 'm', option = 'two'): Pick => ({
    ...pick(member, 'b1', option),
    ...(gameT !== undefined ? { gameT } : {}),
  });
  const odds = (p: Record<string, number>): PropOdds => ({ source: 'drive_odds', bucket: 'b', n: 10, p });
  // 2 of 5 pick 'two' (share 0.4 < 0.5 -> minority); `p` is one of them
  const minorityParty = (p: Pick): Pick[] => [p, pick('b', 'b1', 'two'), pick('c', 'b1', 'ft'), pick('d', 'b1', 'ft'), pick('e', 'b1', 'ft')];
  const score = (p: Pick, o: { partyPicks?: Pick[]; streakBefore?: number; prop?: Prop; outcome?: string } = {}) =>
    scorePick({ prop: o.prop ?? prop, pick: p, partyPicks: o.partyPicks ?? [p], streakBefore: o.streakBefore ?? 0, outcome: o.outcome ?? 'two' });

  it('roundHalf', () => {
    expect(roundHalf(13.2)).toBe(13);
    expect(roundHalf(12.5)).toBe(12.5);
    expect(roundHalf(12.8)).toBe(13);
    expect(roundHalf(12.74)).toBe(12.5);
  });

  it('speed buckets: boundaries, clamp, missing gameT, zero window', () => {
    expect(score(at(25))).toMatchObject({ speed: 1.25, points: 12.5, bonuses: ['early_call'] });
    expect(score(at(60))).toMatchObject({ speed: 1.1, points: 11, bonuses: ['quick_call'] });
    expect(score(at(60.1))).toMatchObject({ speed: 1, points: 10, bonuses: [] });
    expect(score(at(500))).toMatchObject({ speed: 1, bonuses: [] }); // f clamps to 1
    expect(score(at(-50))).toMatchObject({ speed: 1.25, bonuses: ['early_call'] }); // f clamps to 0
    expect(score(at(undefined))).toMatchObject({ speed: 1, bonuses: [] });
    const flat = mkProp('b1', { opensAt: 50, locksAt: 50, resolvesAt: 60 });
    const s = score(at(50), { prop: flat });
    expect(Number.isFinite(s.factor)).toBe(true);
    expect(s.speed).toBe(1.25);
  });

  it('contrarian: 1-of-2, 2-of-4, 1-of-3, 2-of-5, single picker', () => {
    const party = (opts: string[]) => opts.map((o, i) => pick(`x${i}`, 'b1', o));
    const mine = pick('x0', 'b1', 'two');
    const c = (opts: string[]) => score(mine, { partyPicks: party(opts) });
    // exactly half is not a minority (share must be < 0.5), so 1-of-2 and 2-of-4 are both x1
    expect(c(['two', 'ft'])).toMatchObject({ contrarian: 1, bonuses: [] });
    expect(c(['two', 'two', 'ft', 'ft'])).toMatchObject({ contrarian: 1, bonuses: [] });
    expect(c(['two', 'ft', 'ft'])).toMatchObject({ contrarian: 1.5, bonuses: ['lone_call'] });
    expect(c(['two', 'two', 'ft', 'ft', 'ft'])).toMatchObject({ contrarian: 1.2, bonuses: ['against_the_room'] });
    expect(c(['two'])).toMatchObject({ contrarian: 1, bonuses: [] });
    // picks on other props are ignored
    expect(score(mine, { partyPicks: [mine, pick('y', 'other', 'ft')] }).contrarian).toBe(1);
  });

  it('odds: clamp both ends, missing p, no odds', () => {
    const withP = (p: Record<string, number>): Prop => ({ ...prop, odds: odds(p) });
    const o = (p: Record<string, number>) => score(at(undefined), { prop: withP(p) });
    expect(o({ two: 0.1 })).toMatchObject({ odds: 2, bonuses: ['bold_call'], points: 20 });
    expect(o({ two: 0.9 }).odds).toBeCloseTo(0.5 / 0.9, 10);
    expect(o({ two: 0.9 }).bonuses).toEqual([]);
    expect(o({ two: 5 }).odds).toBe(0.5); // floor
    expect(o({ ft: 0.3 }).odds).toBe(2); // p missing -> max
    expect(o({ two: 0 }).odds).toBe(2);
    expect(score(at(undefined)).odds).toBe(1);
  });

  it('factor cap: streak 2 x odds 2 x early 1.25 x lone 1.5 -> x5 -> 50', () => {
    const p = at(10);
    const party = [p, pick('b', 'b1', 'ft'), pick('c', 'b1', 'ft')];
    const s = score(p, { partyPicks: party, streakBefore: 2, prop: { ...prop, odds: odds({ two: 0.1 }) } });
    expect(s).toMatchObject({ streak: 2, odds: 2, speed: 1.25, contrarian: 1.5, factor: 5, points: 50 });
    expect(s.bonuses).toEqual(['bold_call', 'lone_call', 'early_call']);
  });

  it('rounds points to nearest 0.5', () => {
    const p = at(50); // quick 1.1
    expect(score(p, { partyPicks: minorityParty(p) }).points).toBe(13); // 10 x 1.1 x 1.2 = 13.2
    expect(score(at(10)).points).toBe(12.5);
  });

  it('bonus ordering: biggest factor first, ties speed > contrarian > bold', () => {
    const p = at(50); // quick 1.1
    const party = minorityParty(p); // minority 1.2
    const odds15: Prop = { ...prop, odds: odds({ two: 0.5 / 1.3 }) }; // odds 1.3
    expect(score(p, { partyPicks: party, prop: odds15 }).bonuses).toEqual(['bold_call', 'against_the_room', 'quick_call']);
  });

  it('wrong pick: 0 points, no bonuses, factors still reported', () => {
    const p = at(10);
    const s = score(p, { partyPicks: minorityParty(p), outcome: 'ft', streakBefore: 1 });
    expect(s).toMatchObject({ correct: false, points: 0, bonuses: [], streak: 1.5, speed: 1.25, contrarian: 1.2 });
    expect(s.factor).toBeCloseTo(1.5 * 1.25 * 1.2, 10);
  });

  it('tallyPicks exposes scores and lastScore; standings carry lastPickScore', () => {
    const p1 = mkProp('t1', { opensAt: 0, locksAt: 10, resolvesAt: 15, resolver: { kind: 'nextScoreType', afterT: 10 } });
    const evs = [scoreEv(12, 'home', 'pts2')];
    const mine = { ...pick('m', 't1', 'two'), gameT: 1 };
    const party = [mine, pick('o', 't1', 'two'), pick('q', 't1', 'ft'), pick('r', 't1', 'ft'), pick('s', 't1', 'ft')];
    const t = tallyPicks('m', [p1], party, evs, 100);
    expect(t.pickPoints).toBe(15); // 10 x early 1.25 x minority 1.2 (2 of 5)
    expect(t.scores).toHaveLength(1);
    expect(t.lastScore).toBe(t.scores[0]);
    const none = tallyPicks('m', [p1], [], evs, 100);
    expect(none.scores).toEqual([]);
    expect('lastScore' in none).toBe(false);
    const members = [{ memberId: 'm', name: 'M', avatar: 'x', household: 'H', householdId: 'h' }];
    const rows = computeStandings({ members, drafts: [], props: [p1], picks: party, events: evs, gameT: 100, prevRanks: {} });
    expect(rows[0].lastPickScore).toMatchObject({ propId: 't1', points: 15 });
    const rows2 = computeStandings({ members, drafts: [], props: [], picks: [], events: [], gameT: 0, prevRanks: {} });
    expect('lastPickScore' in rows2[0]).toBe(false);
  });
});

// ---------- standings ----------

describe('standings', () => {
  const members = ['maya', 'leo', 'sam'].map((id) => ({
    memberId: id,
    name: id.toUpperCase(),
    avatar: '🙂',
    household: 'H',
    householdId: 'h',
  }));
  // One 2-pointer by har-c-34 (2) and one by sum-pg-2 (2) and one 3 by har-sg-7 (3)
  const events: GameEvent[] = [
    scoreEv(1, 'home', 'pts2', { playerId: 'har-c-34' }),
    scoreEv(2, 'away', 'pts2', { playerId: 'sum-pg-2' }),
    scoreEv(3, 'home', 'pts3', { playerId: 'har-sg-7' }),
  ];
  const drafts = [dp('maya', 'har-sg-7'), dp('leo', 'har-c-34'), dp('sam', 'sum-pg-2')];

  it('ranks by total, with rosters and stat lines', () => {
    const rows = computeStandings({ members, drafts, props: [], picks: [], events, gameT: 10, prevRanks: {} });
    expect(rows.map((r) => r.memberId)).toEqual(['maya', 'leo', 'sam']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ total: 3, draftPoints: 3, pickPoints: 0, streak: 0, prevRank: 1, name: 'MAYA' });
    expect(rows[0].roster).toEqual([{ memberId: 'maya', playerId: 'har-sg-7', points: 3, statLine: '3 PTS' }]);
    // before events visible
    const early = computeStandings({ members, drafts, props: [], picks: [], events, gameT: 0, prevRanks: {} });
    expect(early.every((r) => r.total === 0)).toBe(true);
    expect(early.map((r) => r.memberId)).toEqual(['leo', 'maya', 'sam']); // memberId asc
  });

  it('picks add points and can reorder', () => {
    const prop = mkProp('p1', { opensAt: 0, locksAt: 4, resolvesAt: 5, resolver: { kind: 'nextScoreType', afterT: 4 } });
    const evs = [...events, scoreEv(4.5, 'home', 'pts2')];
    const picks = [pick('sam', 'p1', 'two', 3)];
    const rows = computeStandings({ members, drafts, props: [prop], picks, events: evs, gameT: 10, prevRanks: { sam: 1, maya: 3 } });
    expect(rows[0]).toMatchObject({ memberId: 'sam', total: 12, pickPoints: 10, draftPoints: 2, streak: 1, rank: 1, prevRank: 1 });
    expect(rows.find((r) => r.memberId === 'maya')).toMatchObject({ rank: 2, prevRank: 3 });
    expect(rows.find((r) => r.memberId === 'leo')!.prevRank).toBe(3); // fallback to rank
  });

  it('tiebreak: draftPoints then earliest lastPickAt', () => {
    const prop = mkProp('p1', { opensAt: 0, locksAt: 4, resolvesAt: 5, resolver: { kind: 'nextScoreType', afterT: 4 } });
    const evs: GameEvent[] = [scoreEv(4.5, 'home', 'pts2')];
    const mem = ['a', 'b', 'c', 'd'].map((id) => ({ ...members[0], memberId: id, name: id }));
    // a, b, c each correct once (10, equal draftPoints): earliest lastPickAt first; d has nothing.
    const picks = [pick('a', 'p1', 'two', 30), pick('b', 'p1', 'two', 10), pick('c', 'p1', 'two', 20)];
    const rows = computeStandings({ members: mem, drafts: [], props: [prop], picks, events: evs, gameT: 10, prevRanks: {} });
    expect(rows.map((r) => r.memberId)).toEqual(['b', 'c', 'a', 'd']);

  });

  it('draftPoints breaks a total tie before lastPickAt', () => {
    const prop = mkProp('p1', { opensAt: 0, locksAt: 4, resolvesAt: 5, resolver: { kind: 'nextScoreType', afterT: 4 } });
    // x: draft har-c-34 scoring 5 twos = 10 pts, no pick. y: pick correct = 10, no draft.
    const evs: GameEvent[] = [1, 2, 3, 3.5, 3.9].map((t) => scoreEv(t, 'home', 'pts2', { playerId: 'har-c-34' }));
    evs.push(scoreEv(4.5, 'home', 'pts2', { playerId: 'sum-c-50' }));
    const mem = ['x', 'y'].map((id) => ({ ...members[0], memberId: id, name: id }));
    // y alphabetically after x, and y has a pick; ensure draftPoints tiebreak (x) wins over lastPickAt
    const rows = computeStandings({
      members: mem,
      drafts: [dp('x', 'har-c-34')],
      props: [prop],
      picks: [pick('y', 'p1', 'two', 1)],
      events: evs,
      gameT: 10,
      prevRanks: {},
    });
    expect(rows.map((r) => [r.memberId, r.total])).toEqual([['x', 10], ['y', 10]]);
    // flip: give y a draft of lower value so tie broken by draftPoints desc not by lastPickAt (y has earlier pick)
    expect(rows[0].draftPoints).toBeGreaterThan(rows[1].draftPoints);
    expect(rows[0].rank).toBe(1);
  });
});

describe('rollRanks', () => {
  it('first roll seeds prev with new ranks', () => {
    const r = rollRanks({}, {}, { a: 1, b: 2 });
    expect(r).toEqual({ lastRanks: { a: 1, b: 2 }, prevRanks: { a: 1, b: 2 }, changed: true });
  });
  it('unchanged ranks leave state alone', () => {
    const last = { a: 1, b: 2 };
    const prev = { a: 2, b: 1 };
    const r = rollRanks(last, prev, { a: 1, b: 2 });
    expect(r.changed).toBe(false);
    expect(r.lastRanks).toBe(last);
    expect(r.prevRanks).toBe(prev);
  });
  it('change moves last into prev', () => {
    const r = rollRanks({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 2, b: 1 });
    expect(r).toEqual({ lastRanks: { a: 2, b: 1 }, prevRanks: { a: 1, b: 2 }, changed: true });
  });
  it('prevRank in standings reflects movement', () => {
    const members = ['a', 'b'].map((id) => ({ memberId: id, name: id, avatar: '', household: 'H', householdId: 'h' }));
    const drafts = [dp('b', 'har-c-34')];
    const events = [scoreEv(1, 'home', 'pts2', { playerId: 'har-c-34' })];
    const prev = rollRanks({}, {}, { a: 1, b: 2 }).prevRanks;
    const rows = computeStandings({ members, drafts, props: [], picks: [], events, gameT: 5, prevRanks: prev });
    expect(rows[0]).toMatchObject({ memberId: 'b', rank: 1, prevRank: 2 });
    expect(rows[1]).toMatchObject({ memberId: 'a', rank: 2, prevRank: 1 });
  });
});
