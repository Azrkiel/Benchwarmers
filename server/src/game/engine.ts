// Pure Benchwarmers game engine. No clocks, env or I/O: `now` / `gameT` are injected.
import {
  CONTRARIAN,
  FANTASY_SCORING,
  FOOTBALL_STATS,
  ODDS_MULTIPLIER,
  PICK_BASE_POINTS,
  PICK_FACTOR_CAP,
  ROSTER_SIZE,
  SPEED_BUCKETS,
  STREAK_MULTIPLIERS,
  type DraftPick,
  type FantasyRow,
  type Game,
  type GameEvent,
  type PartyStatus,
  type Pick,
  type PickBonus,
  type PickScore,
  type Player,
  type Position,
  type Prop,
  type PropStatus,
  type StandingRow,
  type StatType,
} from '../shared/types.js';
import { projectionOf } from './projections.js';

// ---------- Errors ----------

export type GameErrorCode =
  | 'NOT_FOUND'
  | 'BAD_STATUS'
  | 'PICKS_LOCKED'
  | 'PLAYER_TAKEN'
  | 'ROSTER_FULL'
  | 'BAD_OPTION'
  | 'BAD_REQUEST'
  | 'NOT_IN_PARTY';

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
    readonly alternatives?: { id: string; name: string; nickname?: string }[],
  ) {
    super(message);
    this.name = 'GameError';
  }
}

// ---------- Clock ----------

export function computeGameT(now: number, startedAt: number | undefined, speed: number, durationSec: number): number {
  if (startedAt === undefined) return 0;
  const t = ((now - startedAt) / 1000) * speed;
  return Math.min(durationSec, Math.max(0, t));
}

/** Football clock seconds per game second. */
export const FOOTBALL_CLOCK_SCALE = 7.5;

export function gameClock(game: Game, gameT: number, status: PartyStatus): { period: number; clock: string } {
  const periods = game.periods;
  if (status === 'final') return { period: periods, clock: 'Final' };
  const periodLen = game.durationSec / periods;
  const period = Math.min(periods, Math.floor(gameT / periodLen) + 1);
  const elapsedInPeriod = gameT - (period - 1) * periodLen;
  // Football: game seconds scale x7.5 to football clock seconds (a 120 game-s period is 15:00).
  const scale = game.sport === 'football' ? FOOTBALL_CLOCK_SCALE : 1;
  const remaining = Math.max(0, Math.ceil((periodLen - elapsedInPeriod) * scale - 1e-9));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return { period, clock: `Q${period} ${m}:${String(s).padStart(2, '0')}` };
}

// ---------- Events ----------

export function visibleEvents(events: GameEvent[], gameT: number): GameEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.t <= gameT)
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map(({ e }) => e);
}

export function scoreAt(events: GameEvent[], gameT: number): { home: number; away: number } {
  const score = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === 'score' && e.t <= gameT && e.team) score[e.team] += e.points ?? 0;
  }
  return score;
}

// ---------- Prop lifecycle + resolvers ----------

export function propStatus(prop: Prop, gameT: number): PropStatus {
  if (gameT < prop.opensAt) return 'upcoming';
  if (gameT < prop.locksAt) return 'open';
  if (gameT < prop.resolvesAt) return 'locked';
  return 'resolved';
}

const FOOTBALL_STAT_SET: ReadonlySet<StatType> = new Set(FOOTBALL_STATS);
const YARD_STATS: ReadonlySet<StatType> = new Set<StatType>(['pass_yds', 'rush_yds', 'rec_yds']);

const STAT_TO_SCORE_OPTION: Partial<Record<StatType, string>> = { pts3: 'three', pts2: 'two', ft: 'ft' };

/** Winning option id, or undefined when the prop is voided. */
export function resolveProp(prop: Prop, events: GameEvent[]): string | undefined {
  const evs = visibleEvents(events, prop.resolvesAt);
  const r = prop.resolver;
  const hasOption = (id: string) => prop.options.some((o) => o.id === id);
  switch (r.kind) {
    case 'nextScoreType': {
      const e = evs.find((x) => x.type === 'score' && x.t >= r.afterT);
      if (!e) return undefined;
      const id = e.stat ? STAT_TO_SCORE_OPTION[e.stat] : undefined;
      if (id && hasOption(id)) return id;
      return hasOption('other') ? 'other' : undefined;
    }
    case 'teamScoresFirst': {
      const e = evs.find((x) => x.type === 'score' && x.t >= r.afterT && x.t < r.untilT && x.team);
      if (e?.team) return e.team;
      return hasOption('none') ? 'none' : undefined;
    }
    case 'driveResult': {
      const end = evs.find((x) => x.driveResult !== undefined && x.drive?.id === r.driveId);
      if (!end) return undefined;
      const yes = r.outcome === 'td' ? end.driveResult === 'td' : end.driveResult === 'td' || end.driveResult === 'fg';
      return yes ? 'yes' : 'no';
    }
    case 'totalPointsOver': {
      const s = scoreAt(evs, r.atT);
      return s.home + s.away > r.line ? 'over' : 'under';
    }
  }
}

// ---------- Picks ----------

export function upsertPick(picks: Pick[], pick: Pick, prop: Prop, gameT: number): Pick[] {
  const status = propStatus(prop, gameT);
  if (status === 'upcoming') throw new GameError('PICKS_LOCKED', 'That question is not open yet.');
  if (status !== 'open') throw new GameError('PICKS_LOCKED', 'Picks are locked for this question.');
  if (!prop.options.some((o) => o.id === pick.optionId)) {
    const labels = prop.options.map((o) => o.label).join(', ');
    throw new GameError('BAD_OPTION', `That is not one of the choices. Your options are ${labels}.`);
  }
  return [...picks.filter((p) => !(p.memberId === pick.memberId && p.propId === pick.propId)), pick];
}

/** Round to the nearest 0.5. */
export function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Phase 8: score one resolved pick. Pure. `partyPicks` = every pick in the party (all members). */
export function scorePick(args: { prop: Prop; pick: Pick; partyPicks: Pick[]; streakBefore: number; outcome?: string }): PickScore {
  const { prop, pick, partyPicks, streakBefore } = args;
  const correct = args.outcome !== undefined ? pick.optionId === args.outcome : true;
  const streak = STREAK_MULTIPLIERS[Math.min(streakBefore, STREAK_MULTIPLIERS.length - 1)];

  // Speed
  let speed: number = 1;
  let speedBonus: PickBonus | undefined;
  if (pick.gameT !== undefined) {
    const span = prop.locksAt - prop.opensAt;
    const f = span > 0 ? clamp01((pick.gameT - prop.opensAt) / span) : 0;
    const bucket = SPEED_BUCKETS.find((b) => f <= b.maxF);
    if (bucket) {
      speed = bucket.factor;
      speedBonus = bucket.bonus;
    }
  }

  // Contrarian
  const onProp = partyPicks.filter((p) => p.propId === prop.id);
  const pickers = onProp.length;
  const same = onProp.filter((p) => p.optionId === pick.optionId).length;
  let contrarian: number = 1;
  let contrarianBonus: PickBonus | undefined;
  if (same === 1 && pickers >= CONTRARIAN.loneMinPickers) {
    contrarian = CONTRARIAN.lone;
    contrarianBonus = 'lone_call';
  } else if (pickers > 0 && same / pickers < 0.5 && pickers >= CONTRARIAN.minorityMinPickers) {
    contrarian = CONTRARIAN.minority;
    contrarianBonus = 'against_the_room';
  }

  // Odds
  let odds: number = 1;
  if (prop.odds) {
    const p = prop.odds.p[pick.optionId];
    odds =
      p === undefined || !(p > 0)
        ? ODDS_MULTIPLIER.max
        : Math.min(ODDS_MULTIPLIER.max, Math.max(ODDS_MULTIPLIER.min, ODDS_MULTIPLIER.target / p));
  }

  const factor = Math.min(PICK_FACTOR_CAP, streak * odds * speed * contrarian);
  const candidates: { bonus: PickBonus; f: number }[] = [];
  if (speedBonus && speed > 1) candidates.push({ bonus: speedBonus, f: speed });
  if (contrarianBonus && contrarian > 1) candidates.push({ bonus: contrarianBonus, f: contrarian });
  if (odds > 1) candidates.push({ bonus: 'bold_call', f: odds });
  candidates.sort((a, b) => b.f - a.f); // stable: ties keep speed, contrarian, bold order

  return {
    propId: prop.id,
    memberId: pick.memberId,
    optionId: pick.optionId,
    correct,
    base: PICK_BASE_POINTS,
    streak,
    odds,
    speed,
    contrarian,
    factor,
    points: correct ? roundHalf(PICK_BASE_POINTS * factor) : 0,
    bonuses: correct ? candidates.map((c) => c.bonus) : [],
  };
}

export type PickTally = {
  pickPoints: number;
  streak: number;
  bestStreak: number;
  correct: number;
  total: number;
  lastPickAt?: number;
  /** Scores for resolved picks, in resolved order. */
  scores: PickScore[];
  lastScore?: PickScore;
};

export function tallyPicks(memberId: string, props: Prop[], picks: Pick[], events: GameEvent[], gameT: number): PickTally {
  const mine = picks.filter((p) => p.memberId === memberId);
  const resolved = props
    .filter((p) => propStatus(p, gameT) === 'resolved')
    .sort((a, b) => a.resolvesAt - b.resolvesAt || a.opensAt - b.opensAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const t: PickTally = { pickPoints: 0, streak: 0, bestStreak: 0, correct: 0, total: 0, scores: [] };
  for (const prop of resolved) {
    const outcome = resolveProp(prop, events);
    const pick = mine.find((p) => p.propId === prop.id);
    if (outcome === undefined || !pick) continue;
    t.total++;
    const score = scorePick({ prop, pick, partyPicks: picks, streakBefore: t.streak, outcome });
    t.scores.push(score);
    t.pickPoints += score.points;
    if (score.correct) {
      t.streak++;
      t.correct++;
      t.bestStreak = Math.max(t.bestStreak, t.streak);
    } else {
      t.streak = 0;
    }
  }
  const last = t.scores[t.scores.length - 1];
  if (last) t.lastScore = last;
  for (const p of mine) t.lastPickAt = t.lastPickAt === undefined ? p.at : Math.max(t.lastPickAt, p.at);
  return t;
}

// ---------- Draft ----------

export function allPlayers(game: Game): Player[] {
  return [...game.home.roster, ...game.away.roster];
}

export function findPlayer(game: Game, id: string): Player | undefined {
  return allPlayers(game).find((p) => p.id === id);
}

export function playerLabel(p: Player): string {
  return p.nickname ?? p.name;
}

function byProjection(a: Player, b: Player): number {
  return projectionOf(b.id) - projectionOf(a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function alternativesFor(game: Game, drafts: DraftPick[], position: Position, n = 2): Player[] {
  const taken = new Set(drafts.map((d) => d.playerId));
  return allPlayers(game)
    .filter((p) => p.position === position && !taken.has(p.id))
    .sort(byProjection)
    .slice(0, n);
}

function toAlt(p: Player): { id: string; name: string; nickname?: string } {
  return p.nickname !== undefined ? { id: p.id, name: p.name, nickname: p.nickname } : { id: p.id, name: p.name };
}

export function draftPlayer(args: {
  game: Game;
  drafts: DraftPick[];
  partyId: string;
  memberId: string;
  playerId: string;
  now: number;
  status: PartyStatus;
  memberNames?: Record<string, string>;
}): DraftPick {
  const { game, drafts, partyId, memberId, playerId, now, status, memberNames } = args;
  if (status !== 'drafting' && status !== 'scheduled') {
    throw new GameError('BAD_STATUS', `The draft is closed. The game has already ${game.sport === 'football' ? 'kicked off' : 'tipped off'}.`);
  }
  const player = findPlayer(game, playerId);
  if (!player) throw new GameError('NOT_FOUND', "I couldn't find that player.");
  const count = drafts.filter((d) => d.memberId === memberId).length;
  if (count >= ROSTER_SIZE) throw new GameError('ROSTER_FULL', 'You already have three players.');
  const owner = drafts.find((d) => d.playerId === playerId);
  if (owner) {
    const label = playerLabel(player);
    if (owner.memberId === memberId) throw new GameError('PLAYER_TAKEN', `You already have ${label}.`);
    let alts = alternativesFor(game, drafts, player.position, 2);
    if (alts.length < 2) {
      // Same position first; pad with the best remaining players overall so there are two options.
      const taken = new Set([...drafts.map((d) => d.playerId), ...alts.map((p) => p.id)]);
      const extra = allPlayers(game).filter((p) => !taken.has(p.id)).sort(byProjection);
      alts = [...alts, ...extra].slice(0, 2);
    }
    const ownerName = memberNames?.[owner.memberId];
    const who = ownerName ? `${ownerName}'s` : "someone else's";
    const tail = alts.length ? ` Try ${alts.map(playerLabel).join(' or ')}.` : '';
    throw new GameError('PLAYER_TAKEN', `${label} is already on ${who} team.${tail}`, alts.map(toAlt));
  }
  return { partyId, memberId, playerId, round: (count + 1) as 1 | 2 | 3, at: now };
}

export function autoFill(game: Game, drafts: DraftPick[], partyId: string, memberIds: string[], now: number): DraftPick[] {
  const all = allPlayers(game);
  const byId = new Map(all.map((p) => [p.id, p]));
  const current = [...drafts];
  const added: DraftPick[] = [];
  for (let r = 1; r <= ROSTER_SIZE; r++) {
    for (const memberId of memberIds) {
      const mine = current.filter((d) => d.memberId === memberId);
      if (mine.length >= r) continue;
      const taken = new Set(current.map((d) => d.playerId));
      const have = new Set(mine.map((d) => byId.get(d.playerId)?.position));
      const free = all.filter((p) => !taken.has(p.id));
      const fresh = free.filter((p) => !have.has(p.position));
      const pool = fresh.length ? fresh : free;
      if (!pool.length) continue;
      const best = [...pool].sort(byProjection)[0];
      const pick: DraftPick = {
        partyId,
        memberId,
        playerId: best.id,
        round: (mine.length + 1) as 1 | 2 | 3,
        at: now,
        auto: true,
      };
      current.push(pick);
      added.push(pick);
    }
  }
  return added;
}

// ---------- Fantasy ----------

export function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Fantasy credit for one event. `qty` = how much the stat counter moves (yards for *_yds stats, else 1). */
function eventCredits(e: GameEvent): { playerId: string; stat: StatType; points: number; qty: number }[] {
  const out: { playerId: string; stat: StatType; points: number; qty: number }[] = [];
  const stat = e.stat;
  if (!stat) return out;
  const per = (st: StatType, yards: number | undefined) =>
    YARD_STATS.has(st) ? { qty: yards ?? 0, points: round2(FANTASY_SCORING[st] * (yards ?? 0)) } : { qty: 1, points: FANTASY_SCORING[st] };
  if (e.type === 'score' && e.playerId) {
    out.push({ playerId: e.playerId, stat, ...per(stat, e.yards) });
    if (e.assistPlayerId) {
      // Football: a receiving TD credits the passer; no basketball 'ast'.
      if (stat === 'rec_td') out.push({ playerId: e.assistPlayerId, stat: 'pass_td', ...per('pass_td', undefined) });
      else if (!FOOTBALL_STAT_SET.has(stat)) out.push({ playerId: e.assistPlayerId, stat: 'ast', ...per('ast', undefined) });
    }
  } else if (e.type === 'play' && e.playerId) {
    out.push({ playerId: e.playerId, stat, ...per(stat, e.yards) });
    // Football: a completion credits the passer with the same yards.
    if (stat === 'rec_yds' && e.assistPlayerId) out.push({ playerId: e.assistPlayerId, stat: 'pass_yds', ...per('pass_yds', e.yards) });
  }
  return out;
}

export function eventFantasy(e: GameEvent): { playerId: string; stat: StatType; points: number }[] {
  return eventCredits(e).map(({ playerId, stat, points }) => ({ playerId, stat, points }));
}

const STAT_KEYS = Object.keys(FANTASY_SCORING) as StatType[];

function emptyStats(): Record<StatType, number> {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatType, number>;
}

export function fantasyByPlayer(
  events: GameEvent[],
  gameT: number,
): Map<string, { points: number; stats: Record<StatType, number> }> {
  const map = new Map<string, { points: number; stats: Record<StatType, number> }>();
  for (const e of visibleEvents(events, gameT)) {
    for (const f of eventCredits(e)) {
      let row = map.get(f.playerId);
      if (!row) {
        row = { points: 0, stats: emptyStats() };
        map.set(f.playerId, row);
      }
      row.points += f.points;
      row.stats[f.stat] += f.qty;
    }
  }
  for (const row of map.values()) row.points = round1(row.points);
  return map;
}

const FOOTBALL_LINE: [StatType[], string][] = [
  [['pass_yds'], 'PASS YDS'],
  [['pass_td'], 'PASS TD'],
  [['rush_yds'], 'RUSH YDS'],
  [['rec_yds'], 'REC YDS'],
  [['rush_td', 'rec_td'], 'TD'],
  [['fg'], 'FG'],
  [['xp'], 'XP'],
  [['int'], 'INT'],
  [['fumble'], 'FUM'],
];

export function footballStatLine(s: Record<StatType, number>): string {
  const parts: string[] = [];
  for (const [keys, label] of FOOTBALL_LINE) {
    const n = keys.reduce((sum, k) => sum + s[k], 0);
    if (n > 0) parts.push(`${n} ${label}`);
  }
  return parts.length ? parts.join(', ') : 'No stats yet';
}

export function statLine(stats: Record<StatType, number> | undefined, sport?: Game['sport']): string {
  const s = stats ?? emptyStats();
  if (sport === 'football' || (sport === undefined && FOOTBALL_STATS.some((k) => s[k] > 0))) return footballStatLine(s);
  const parts = [`${s.pts2 * 2 + s.pts3 * 3 + s.ft} PTS`];
  const extras: [StatType, string][] = [
    ['reb', 'REB'],
    ['ast', 'AST'],
    ['stl', 'STL'],
    ['blk', 'BLK'],
    ['tov', 'TOV'],
  ];
  for (const [k, label] of extras) if (s[k] > 0) parts.push(`${s[k]} ${label}`);
  return parts.join(', ');
}

// ---------- Standings ----------

export type StandingMember = { memberId: string; name: string; avatar: string; household: string; householdId: string };

export function computeStandings(args: {
  members: StandingMember[];
  drafts: DraftPick[];
  props: Prop[];
  picks: Pick[];
  events: GameEvent[];
  gameT: number;
  prevRanks: Record<string, number>;
}): StandingRow[] {
  const { members, drafts, props, picks, events, gameT, prevRanks } = args;
  const fantasy = fantasyByPlayer(events, gameT);
  const rows = members.map((m) => {
    const roster: FantasyRow[] = drafts
      .filter((d) => d.memberId === m.memberId)
      .sort((a, b) => a.round - b.round)
      .map((d) => {
        const f = fantasy.get(d.playerId);
        return { memberId: m.memberId, playerId: d.playerId, points: f?.points ?? 0, statLine: statLine(f?.stats) };
      });
    const draftPoints = round1(roster.reduce((s, r) => s + r.points, 0));
    const tally = tallyPicks(m.memberId, props, picks, events, gameT);
    return { m, roster, draftPoints, tally, total: round1(draftPoints + tally.pickPoints) };
  });
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.draftPoints - a.draftPoints ||
      (a.tally.lastPickAt === undefined ? 1 : 0) - (b.tally.lastPickAt === undefined ? 1 : 0) ||
      (a.tally.lastPickAt ?? 0) - (b.tally.lastPickAt ?? 0) ||
      (a.m.memberId < b.m.memberId ? -1 : a.m.memberId > b.m.memberId ? 1 : 0),
  );
  return rows.map((r, i) => ({
    memberId: r.m.memberId,
    name: r.m.name,
    household: r.m.household,
    householdId: r.m.householdId,
    avatar: r.m.avatar,
    rank: i + 1,
    prevRank: prevRanks[r.m.memberId] ?? i + 1,
    total: r.total,
    draftPoints: r.draftPoints,
    pickPoints: r.tally.pickPoints,
    streak: r.tally.streak,
    roster: r.roster,
    ...(r.tally.lastScore ? { lastPickScore: r.tally.lastScore } : {}),
  }));
}

export function rollRanks(
  lastRanks: Record<string, number>,
  prevRanks: Record<string, number>,
  newRanks: Record<string, number>,
): { lastRanks: Record<string, number>; prevRanks: Record<string, number>; changed: boolean } {
  const keys = Object.keys(newRanks);
  const same = keys.length === Object.keys(lastRanks).length && keys.every((k) => lastRanks[k] === newRanks[k]);
  if (same) return { lastRanks, prevRanks, changed: false };
  const empty = Object.keys(lastRanks).length === 0;
  return { lastRanks: newRanks, prevRanks: empty ? newRanks : lastRanks, changed: true };
}
