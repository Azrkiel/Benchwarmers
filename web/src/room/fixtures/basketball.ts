/**
 * FIXTURE ONLY. Basketball room snapshots shaped like the master plan's proposed
 * additive contract (P01.3/P04). They let the display and phone UI be built before
 * Worker A publishes the real snapshot; they are not evidence the connected game works.
 * Public state only: no tokens and no future outcomes.
 */
import type { RoomPlayer, RoomQuestion, RoomStanding } from '@shared/room';
import type { RoomViewNext } from '../sport';

export const FIXTURE_STATES = ['lobby', 'open', 'locked', 'resolved', 'final', 'stale'] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

const HOME = { id: 'harbor', short: 'HAR', name: 'Harbor Hawks', color: '#1F7AE0' };
const AWAY = { id: 'summit', short: 'SUM', name: 'Summit Foxes', color: '#E8642C' };

// [id, name, position, team, pregame projection] from server/src/game/projections.ts.
const ROSTER: [string, string, string, 'harbor' | 'summit', number][] = [
  ['har-c-34', 'Moses Adeyemi', 'C', 'harbor', 24.2], ['sum-pg-2', 'Kai Thompson', 'PG', 'summit', 20.6],
  ['har-sg-7', 'Tommy Okafor', 'SG', 'harbor', 20.1], ['har-pg-1', 'Jalen Reyes', 'PG', 'harbor', 18.4],
  ['sum-c-50', 'Viktor Halvorsen', 'C', 'summit', 17.7], ['sum-sg-10', 'Rafael Duarte', 'SG', 'summit', 16.9],
  ['har-sf-11', 'Andre Lindqvist', 'SF', 'harbor', 16.2], ['sum-sf-14', 'Owen Mercer', 'SF', 'summit', 15.5],
  ['har-pf-21', 'Marcus Bell', 'PF', 'harbor', 14.8], ['sum-pf-32', 'DeShawn Pike', 'PF', 'summit', 14.1],
  ['har-c-44', 'Grant Whitfield', 'C', 'harbor', 12.3], ['sum-sg-4', 'Eli Brooks', 'SG', 'summit', 11.6],
  ['har-pg-5', 'Danny Cho', 'PG', 'harbor', 10.9], ['sum-pf-15', 'Nate Kimura', 'PF', 'summit', 10.2],
  ['har-sf-23', 'Luis Navarro', 'SF', 'harbor', 9.5], ['sum-sf-8', 'Caleb Frost', 'SF', 'summit', 8.8],
];
// Plan §3.2 salary model: roundTo500(clamp(3500, 11500, projection * 350)).
const salaryFor = (projection: number) => Math.round(Math.max(3500, Math.min(11500, projection * 350)) / 500) * 500;

export const FIXTURE_PLAYERS: (RoomPlayer & { projectedPoints?: number; projectionSource?: 'demo_projection' })[] = ROSTER.map(([id, name, position, teamId, projection], i) => ({
  id, name, position, teamId, teamShort: teamId === 'harbor' ? 'HAR' : 'SUM', role: 'Fictional player', salary: salaryFor(projection),
  multiplier: 1, stats: {}, rawPoints: 0, points: i < 6 ? 4 + i * 1.5 : 0, statLine: i < 6 ? '4 PTS · 2 REB' : 'No stats yet', projectedPoints: projection, projectionSource: 'demo_projection',
}));

const NAMES = ['Maya', 'Leo', 'Sam', 'Priya', 'Jordan', 'Alexandria Montgomery-Whitfield', 'Chris', 'Dana', 'Eli', 'Fran', 'Gus', 'Hana', 'Ivan', 'Jules', 'Kip', 'Lena'];

function standings(count: number, final: boolean): RoomStanding[] {
  const rows = Array.from({ length: count }, (_, i) => {
    const name = i < NAMES.length ? NAMES[i]! : `Guest ${i + 1}`;
    const total = Math.max(0, 82.5 - i * 6.5 + (i === 2 ? 6.5 : 0)) + (final ? 4 : 0);
    return { participantId: `fx-${i}`, name, rank: 0, total, fantasyPoints: total * 0.7, predictionPoints: total * 0.3, streak: i === 0 ? 3 : 0,
      roster: FIXTURE_PLAYERS.slice(i % 6, (i % 6) + 5).map((p, slot) => ({ playerId: p.id, captain: slot === 0, points: p.points * (slot === 0 ? 1.5 : 1) })) };
  });
  rows.sort((a, b) => b.total - a.total);
  // Ties share a rank (Maya and Sam are deliberately tied in second for QA).
  for (const row of rows) row.rank = 1 + rows.filter((other) => other.total > row.total).length;
  return rows;
}

function question(state: FixtureState, now: number): RoomQuestion | undefined {
  if (state === 'lobby' || state === 'final') return undefined;
  const open = state === 'open' || state === 'stale';
  return {
    id: 'bball-q-004', kind: 'next_made_field_goal_value', text: 'Next basket: two or three?', opensAt: now - 4000, locksAt: now + (open ? 8000 : -1000),
    remainingMs: open ? 8000 : 0, status: state === 'resolved' ? 'resolved' : open ? 'open' : 'locked',
    options: [{ id: 'two', label: 'Two', basePoints: 10 }, { id: 'three', label: 'Three', basePoints: 10 }],
    pickCounts: { two: 2, three: 1 },
    ...(state === 'resolved' ? { result: { optionId: 'three', explanation: 'Tommy Okafor made a three from the wing.' } } : {}),
  };
}

export function basketballFixture(state: FixtureState, participants = 4, now = Date.now()): RoomViewNext {
  const live = state !== 'lobby' && state !== 'final';
  const phase = state === 'lobby' ? 'lobby' : state === 'final' ? 'final' : 'live';
  const score = state === 'lobby' ? [0, 0] : state === 'final' ? [57, 56] : state === 'resolved' ? [45, 39] : [42, 39];
  const q = question(state, now);
  return {
    version: 48, serverNow: now, rulesVersion: 'basketball-v1',
    room: { code: 'HOOP42', name: 'Friday Basketball', seasonId: 'fx-season', phase, speed: 1, participantCount: participants, createdAt: now - 600000 },
    game: {
      title: 'Harbor Hawks vs. Summit Foxes', home: { ...HOME, score: score[0]! }, away: { ...AWAY, score: score[1]! },
      quarter: state === 'final' ? 4 : 3, clock: state === 'final' ? '0:00' : '4:18', situation: '', ballOn: 0, fieldX: 0,
      possession: live ? 'harbor' : null, driveNumber: 0, driveCount: 0, isScripted: true,
      recentPlays: live ? [
        { id: 'bb-e-118', text: 'Kai Thompson layup. Summit 39.', kind: 'score', quarter: 3, clock: '4:41' },
        { id: 'bb-e-121', text: 'Defensive rebound, Grant Whitfield.', kind: 'stat', quarter: 3, clock: '4:18' },
        ...(state === 'resolved' ? [{ id: 'bb-e-124', text: 'Tommy Okafor three from the wing.', kind: 'score', quarter: 3, clock: '4:02' }] : []),
      ] : [],
      gameId: 'harbor-vs-summit', sport: 'basketball', sourceMode: 'scripted', sourceStatus: state === 'stale' ? 'stale' : 'healthy',
      context: { sport: 'basketball', possessionTeamId: live ? 'harbor' : null, possessionPlayerId: null, ball: null, tracking: live ? 'team_possession' : 'score_only' },
    },
    rules: { salaryCap: 50000, flexSlots: 4, captainMultiplier: 1.5, positionMultipliers: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1 }, pickFactorCap: 5 },
    players: FIXTURE_PLAYERS,
    standings: standings(participants, state === 'final'),
    ...(q ? { question: q } : {}),
    season: { id: 'fx-season', name: 'Friday season', standings: state === 'final' ? [{ participantId: 'fx-0', name: 'Maya', points: 160.5, fantasyPoints: 110, predictionPoints: 50.5, nightsPlayed: 2, nightsWon: 1 }, { participantId: 'fx-1', name: 'Leo', points: 141, fantasyPoints: 100, predictionPoints: 41, nightsPlayed: 2, nightsWon: 1 }] : [] },
  };
}
