// Shared building blocks for the committed TV fixtures. Deterministic: no Date.now(), no randomness.
import type {
  DraftBoardEntry,
  FantasyRow,
  Household,
  Member,
  Player,
  StandingRow,
  Team,
  TeamScore,
} from '@shared/types';

/** Fixed serverNow base for every fixture. */
export const BASE_NOW = 1_760_000_000_000;

export const CREW_ID = 'sunday-crew';
export const CREW_NAME = 'Sunday Crew';
export const GAME_ID = 'harbor-vs-summit';
export const GAME_TITLE = 'Harbor Hawks vs. Summit Foxes';
export const DURATION_SEC = 480;
export const PERIOD_SEC = 120;
export const PERIODS = 4;
export const PARTY_ID = 'party-demo';
export const PARTY_CODE = 'DEMO';
export const SPEED = 4;

export const HOUSEHOLDS: Household[] = [
  {
    id: 'garcias',
    name: 'The Garcias',
    city: 'Austin',
    color: '#EDA77B',
    members: [
      { id: 'maya', name: 'Maya', avatar: '🦊' },
      { id: 'leo', name: 'Leo', avatar: '🦁' },
    ],
  },
  {
    id: 'sams-place',
    name: "Sam's Place",
    city: 'Seattle',
    color: '#B9B3E3',
    members: [
      { id: 'sam', name: 'Sam', avatar: '🐻' },
      { id: 'priya', name: 'Priya', avatar: '🦉' },
    ],
  },
];

/** Member order used for stable tie-breaks. */
export const MEMBER_IDS = ['maya', 'leo', 'sam', 'priya'] as const;

export function memberInfo(memberId: string): { member: Member; household: Household } {
  for (const household of HOUSEHOLDS) {
    const member = household.members.find((m) => m.id === memberId);
    if (member) return { member, household };
  }
  throw new Error(`unknown member ${memberId}`);
}

// Copied from server/src/game/games/harbor-vs-summit.json so the web bundle stays independent.
export const TEAMS: { home: Team; away: Team } = {
  home: {
    id: 'harbor',
    name: 'Harbor Hawks',
    short: 'HAR',
    color: '#1F7AE0',
    roster: [
      { id: 'har-pg-1', teamId: 'harbor', name: 'Jalen Reyes', number: 3, position: 'PG', nickname: 'Jet' },
      { id: 'har-sg-7', teamId: 'harbor', name: 'Tommy Okafor', number: 7, position: 'SG', nickname: 'Splash' },
      { id: 'har-sf-11', teamId: 'harbor', name: 'Andre Lindqvist', number: 11, position: 'SF', nickname: 'The Viking' },
      { id: 'har-pf-21', teamId: 'harbor', name: 'Marcus Bell', number: 21, position: 'PF', nickname: 'Doorbell' },
      { id: 'har-c-34', teamId: 'harbor', name: 'Moses Adeyemi', number: 34, position: 'C', nickname: 'Big Mo' },
      { id: 'har-pg-5', teamId: 'harbor', name: 'Danny Cho', number: 5, position: 'PG', nickname: 'Dime' },
      { id: 'har-sf-23', teamId: 'harbor', name: 'Luis Navarro', number: 23, position: 'SF', nickname: 'Lefty' },
      { id: 'har-c-44', teamId: 'harbor', name: 'Grant Whitfield', number: 44, position: 'C', nickname: 'The Wall' },
    ],
  },
  away: {
    id: 'summit',
    name: 'Summit Foxes',
    short: 'SUM',
    color: '#E8642C',
    roster: [
      { id: 'sum-pg-2', teamId: 'summit', name: 'Kai Thompson', number: 2, position: 'PG', nickname: 'Quick Kai' },
      { id: 'sum-sg-10', teamId: 'summit', name: 'Rafael Duarte', number: 10, position: 'SG', nickname: 'Rafa' },
      { id: 'sum-sf-14', teamId: 'summit', name: 'Owen Mercer', number: 14, position: 'SF', nickname: 'Ice' },
      { id: 'sum-pf-32', teamId: 'summit', name: 'DeShawn Pike', number: 32, position: 'PF', nickname: 'Pike' },
      { id: 'sum-c-50', teamId: 'summit', name: 'Viktor Halvorsen', number: 50, position: 'C', nickname: 'Tower' },
      { id: 'sum-sg-4', teamId: 'summit', name: 'Eli Brooks', number: 4, position: 'SG', nickname: 'Bucket' },
      { id: 'sum-pf-15', teamId: 'summit', name: 'Nate Kimura', number: 15, position: 'PF', nickname: 'Hustle' },
      { id: 'sum-sf-8', teamId: 'summit', name: 'Caleb Frost', number: 8, position: 'SF', nickname: 'Frosty' },
    ],
  },
};

export const ALL_PLAYERS: Player[] = [...TEAMS.home.roster, ...TEAMS.away.roster];

export function playerById(playerId: string): Player {
  const p = ALL_PLAYERS.find((x) => x.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

/** Display name: nickname when there is one. */
export function playerLabel(playerId: string): string {
  const p = playerById(playerId);
  return p.nickname ?? p.name;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- Clock ----------

export function periodFor(gameT: number): number {
  return Math.min(PERIODS, Math.floor(gameT / PERIOD_SEC) + 1);
}

/** "Q3 0:48" style clock; counts down inside the period, "Final" at the end. */
export function clockFor(gameT: number): string {
  if (gameT >= DURATION_SEC) return 'Final';
  const period = periodFor(gameT);
  const remaining = period * PERIOD_SEC - gameT;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `Q${period} ${m}:${String(s).padStart(2, '0')}`;
}

export function gameBlock(gameT: number, homeScore: number, awayScore: number) {
  const home: TeamScore = { id: TEAMS.home.id, name: TEAMS.home.name, short: TEAMS.home.short, color: TEAMS.home.color, score: homeScore };
  const away: TeamScore = { id: TEAMS.away.id, name: TEAMS.away.name, short: TEAMS.away.short, color: TEAMS.away.color, score: awayScore };
  return {
    id: GAME_ID,
    title: GAME_TITLE,
    durationSec: DURATION_SEC,
    gameT,
    period: periodFor(gameT),
    clock: clockFor(gameT),
    home,
    away,
  };
}

// ---------- Draft board + standings builders ----------

export type OwnedSpec = {
  playerId: string;
  memberId: string;
  round: 1 | 2 | 3;
  points: number;
  statLine: string;
};

export type PlayerLine = { points: number; statLine: string };

export function boardEntry(
  player: Player,
  side: 'home' | 'away',
  owned?: OwnedSpec,
  line?: PlayerLine,
  scoutingNote?: string,
): DraftBoardEntry {
  const team = side === 'home' ? TEAMS.home : TEAMS.away;
  const entry: DraftBoardEntry = {
    player,
    side,
    teamShort: team.short,
    points: owned?.points ?? line?.points ?? 0,
    statLine: owned?.statLine ?? line?.statLine ?? '',
  };
  if (owned) {
    const { member, household } = memberInfo(owned.memberId);
    entry.ownerMemberId = member.id;
    entry.ownerName = member.name;
    entry.householdId = household.id;
    entry.round = owned.round;
  }
  if (scoutingNote) entry.scoutingNote = scoutingNote;
  return entry;
}

/**
 * All 16 players, home first. `lines` carries points/statLine for undrafted players,
 * `notes` maps playerId -> scoutingNote.
 */
export function buildDraftBoard(
  owned: OwnedSpec[],
  lines: Record<string, PlayerLine> = {},
  notes: Record<string, string> = {},
): DraftBoardEntry[] {
  const byPlayer = new Map(owned.map((o) => [o.playerId, o]));
  const entries: DraftBoardEntry[] = [];
  for (const p of TEAMS.home.roster) entries.push(boardEntry(p, 'home', byPlayer.get(p.id), lines[p.id], notes[p.id]));
  for (const p of TEAMS.away.roster) entries.push(boardEntry(p, 'away', byPlayer.get(p.id), lines[p.id], notes[p.id]));
  return entries;
}

export type PickState = { pickPoints: number; streak: number; prevRank?: number };

/** One row per member; draftPoints summed from that member's roster; ranks by total desc. */
export function buildStandings(owned: OwnedSpec[], state: Record<string, PickState>): StandingRow[] {
  const rows = MEMBER_IDS.map((memberId) => {
    const { member, household } = memberInfo(memberId);
    const roster: FantasyRow[] = owned
      .filter((o) => o.memberId === memberId)
      .sort((a, b) => a.round - b.round)
      .map((o) => ({ memberId, playerId: o.playerId, points: o.points, statLine: o.statLine }));
    const draftPoints = round1(roster.reduce((sum, r) => sum + r.points, 0));
    const s = state[memberId] ?? { pickPoints: 0, streak: 0 };
    return {
      memberId,
      name: member.name,
      household: household.name,
      householdId: household.id,
      avatar: member.avatar,
      draftPoints,
      pickPoints: s.pickPoints,
      total: round1(draftPoints + s.pickPoints),
      streak: s.streak,
      prevRank: s.prevRank,
      roster,
    };
  });
  rows.sort((a, b) => b.total - a.total); // stable: ties keep MEMBER_IDS order
  return rows.map(({ prevRank, ...row }, i) => ({ ...row, rank: i + 1, prevRank: prevRank ?? i + 1 }));
}
