import type { EventView, PartyStateResponse, Pick, PropView } from '@shared/types';
import {
  BASE_NOW, CREW_NAME, GAME_ID, HOUSEHOLDS, PARTY_CODE, PARTY_ID, SPEED,
  buildDraftBoard, buildStandings, gameBlock, memberInfo, type OwnedSpec, type PlayerLine,
} from './shared';

const GAME_T = 480;
const STARTED_AT = BASE_NOW - (GAME_T / SPEED) * 1000 - 20_000;

const owned: OwnedSpec[] = [
  { playerId: 'har-sg-7', memberId: 'maya', round: 1, points: 37.4, statLine: '16 PTS · 6 REB · 5 AST' },
  { playerId: 'har-c-34', memberId: 'maya', round: 2, points: 41.6, statLine: '14 PTS · 12 REB · 2 AST' },
  { playerId: 'sum-sg-10', memberId: 'maya', round: 3, points: 45.3, statLine: '22 PTS · 4 REB · 5 AST' },
  { playerId: 'sum-c-50', memberId: 'sam', round: 1, points: 38.2, statLine: '10 PTS · 14 REB · 3 AST' },
  { playerId: 'sum-pg-2', memberId: 'sam', round: 2, points: 40.5, statLine: '12 PTS · 4 REB · 9 AST' },
  { playerId: 'har-pg-1', memberId: 'sam', round: 3, points: 33.9, statLine: '12 PTS · 3 REB · 8 AST' },
  { playerId: 'har-sf-11', memberId: 'priya', round: 1, points: 41.3, statLine: '19 PTS · 9 REB · 3 AST' },
  { playerId: 'sum-sf-14', memberId: 'priya', round: 2, points: 2.4, statLine: '0 PTS · 2 REB · 0 AST' },
  { playerId: 'sum-pf-32', memberId: 'priya', round: 3, points: 39.9, statLine: '18 PTS · 10 REB · 4 AST' },
  { playerId: 'har-pf-21', memberId: 'leo', round: 1, points: 34.1, statLine: '14 PTS · 8 REB · 3 AST' },
  { playerId: 'sum-sg-4', memberId: 'leo', round: 2, points: 29.7, statLine: '16 PTS · 3 REB · 4 AST' },
  { playerId: 'har-pg-5', memberId: 'leo', round: 3, points: 25.0, statLine: '6 PTS · 4 REB · 9 AST' },
];

const freeAgents: Record<string, PlayerLine> = {
  'har-sf-23': { points: 19.0, statLine: '12 PTS · 4 REB · 2 AST' },
  'har-c-44': { points: 22.8, statLine: '6 PTS · 8 REB · 2 BLK' },
  'sum-pf-15': { points: 15.6, statLine: '8 PTS · 5 REB · 2 AST' },
  'sum-sf-8': { points: 13.2, statLine: '8 PTS · 3 REB · 1 AST' },
};

const recentEvents: EventView[] = [
  { id: 'e1', t: 480, type: 'period', text: 'Final buzzer. Harbor Hawks win 88-84.', tags: ['final'], fantasy: [] },
  {
    id: 'e2', t: 474, type: 'score', team: 'home', points: 2, text: 'Doorbell finishes the dunk to seal it.', tags: ['dunk'],
    playerId: 'har-pf-21', stat: 'pts2',
    fantasy: [{ memberId: 'leo', memberName: 'Leo', playerId: 'har-pf-21', playerName: 'Doorbell', points: 2 }],
  },
  {
    id: 'e3', t: 463, type: 'score', team: 'away', points: 3, text: 'Rafa answers from the wing!', tags: ['three'],
    playerId: 'sum-sg-10', stat: 'pts3',
    fantasy: [{ memberId: 'maya', memberName: 'Maya', playerId: 'sum-sg-10', playerName: 'Rafa', points: 3 }],
  },
  {
    id: 'e4', t: 451, type: 'score', team: 'home', points: 3, text: 'Splash drains the dagger three!', tags: ['three', 'clutch'],
    playerId: 'har-sg-7', stat: 'pts3',
    fantasy: [{ memberId: 'maya', memberName: 'Maya', playerId: 'har-sg-7', playerName: 'Splash', points: 3 }],
  },
  {
    id: 'e5', t: 440, type: 'foul', team: 'away', text: 'Pike fouls out.', tags: ['foul'],
    playerId: 'sum-pf-32', fantasy: [],
  },
];

const resolvedProp: PropView = {
  id: 'prop-7',
  gameId: GAME_ID,
  question: 'Will the teams combine for more than 105 points?',
  options: [
    { id: 'over', label: 'Over 105', probability: 0.46 },
    { id: 'under', label: 'Under 105', probability: 0.54 },
  ],
  opensAt: 360,
  locksAt: 420,
  resolvesAt: 480,
  resolver: { kind: 'totalPointsOver', atT: 480, line: 105 },
  correctOptionId: 'over',
  explanation: 'The teams finished with 172 combined points, well past the line of 105.',
  source: 'fallback',
  status: 'resolved',
  pickCounts: { over: 3, under: 1 },
};

function pick(
  memberId: string, optionId: string, optionLabel: string, at: number,
  source: 'voice' | 'screen', correct: boolean,
): Pick & { memberName: string; optionLabel: string; correct?: boolean } {
  return {
    partyId: PARTY_ID, memberId, propId: 'prop-7', optionId, at, source, correct,
    memberName: memberInfo(memberId).member.name, optionLabel,
  };
}

export const finalFixture: PartyStateResponse = {
  serverNow: BASE_NOW,
  version: 96,
  speed: SPEED,
  party: { id: PARTY_ID, code: PARTY_CODE, status: 'final', crewName: CREW_NAME, createdAt: BASE_NOW - 1_200_000, startedAt: STARTED_AT },
  game: gameBlock(GAME_T, 88, 84),
  households: HOUSEHOLDS,
  recentEvents,
  lastResolvedProp: resolvedProp,
  props: [resolvedProp],
  picks: [
    pick('maya', 'over', 'Over 105', STARTED_AT + 100_000, 'voice', true),
    pick('sam', 'over', 'Over 105', STARTED_AT + 102_000, 'voice', true),
    pick('priya', 'over', 'Over 105', STARTED_AT + 104_000, 'screen', true),
    pick('leo', 'under', 'Under 105', STARTED_AT + 108_000, 'screen', false),
  ],
  standings: buildStandings(owned, {
    maya: { pickPoints: 70, streak: 2, prevRank: 1 },
    sam: { pickPoints: 55, streak: 0, prevRank: 2 },
    priya: { pickPoints: 60, streak: 1, prevRank: 3 },
    leo: { pickPoints: 40, streak: 0, prevRank: 4 },
  }),
  draftBoard: buildDraftBoard(owned, freeAgents),
  ticker: [
    'Maya wins the night!',
    'Priya called the combined total',
    'Leo missed the combined total',
    'Ice finishes as the Benchwarmer of the Night',
  ],
  recap:
    "Maya takes Sunday Crew night with 194.3 points. Big Mo and Rafa carried her roster, and she hit a pick streak late. " +
    "Sam held second, while Priya's cold night with Ice kept her third. Harbor Hawks edged Summit Foxes 88-84.",
  benchwarmerOfTheNight: { playerId: 'sum-sf-14', playerName: 'Ice', ownerName: 'Priya', points: 2.4 },
};
