import type { EventView, PartyStateResponse, Pick, PropView } from '@shared/types';
import {
  BASE_NOW, CREW_NAME, GAME_ID, HOUSEHOLDS, PARTY_CODE, PARTY_ID, SPEED,
  buildDraftBoard, buildStandings, gameBlock, memberInfo, type OwnedSpec, type PlayerLine,
} from './shared';

const GAME_T = 312; // Q3 0:48
const STARTED_AT = BASE_NOW - (GAME_T / SPEED) * 1000;

// 12 of 12 slots drafted; Lefty, The Wall, Hustle and Frosty are still free agents.
const owned: OwnedSpec[] = [
  { playerId: 'har-sg-7', memberId: 'maya', round: 1, points: 28.2, statLine: '12 PTS · 4 REB · 3 AST' },
  { playerId: 'har-c-34', memberId: 'maya', round: 2, points: 31.2, statLine: '10 PTS · 9 REB · 1 AST' },
  { playerId: 'sum-sg-10', memberId: 'maya', round: 3, points: 33.1, statLine: '16 PTS · 3 REB · 4 AST' },
  { playerId: 'sum-c-50', memberId: 'sam', round: 1, points: 30.4, statLine: '8 PTS · 11 REB · 2 AST' },
  { playerId: 'sum-pg-2', memberId: 'sam', round: 2, points: 29.8, statLine: '9 PTS · 3 REB · 6 AST' },
  { playerId: 'har-pg-1', memberId: 'sam', round: 3, points: 24.4, statLine: '8 PTS · 2 REB · 5 AST' },
  { playerId: 'har-sf-11', memberId: 'priya', round: 1, points: 33.8, statLine: '15 PTS · 7 REB · 2 AST' },
  { playerId: 'sum-sf-14', memberId: 'priya', round: 2, points: 1.5, statLine: '0 PTS · 1 REB · 0 AST' },
  { playerId: 'sum-pf-32', memberId: 'priya', round: 3, points: 35.0, statLine: '14 PTS · 8 REB · 3 AST' },
  { playerId: 'har-pf-21', memberId: 'leo', round: 1, points: 25.6, statLine: '10 PTS · 6 REB · 2 AST' },
  { playerId: 'sum-sg-4', memberId: 'leo', round: 2, points: 22.4, statLine: '12 PTS · 2 REB · 3 AST' },
  { playerId: 'har-pg-5', memberId: 'leo', round: 3, points: 18.8, statLine: '4 PTS · 3 REB · 7 AST' },
];

const freeAgents: Record<string, PlayerLine> = {
  'har-sf-23': { points: 14.0, statLine: '8 PTS · 3 REB · 1 AST' },
  'har-c-44': { points: 16.2, statLine: '4 PTS · 6 REB · 2 BLK' },
  'sum-pf-15': { points: 11.4, statLine: '6 PTS · 4 REB · 1 AST' },
  'sum-sf-8': { points: 9.6, statLine: '6 PTS · 2 REB · 1 AST' },
};

const notes: Record<string, string> = {
  'har-c-34': 'Anchors the paint and grabs everything off the glass.',
  'sum-pg-2': 'Fastest hands on the floor; steals turn into easy points.',
  'sum-sf-14': 'Cold-blooded from deep, but disappears for stretches.',
};

// Newest first, t descending.
const recentEvents: EventView[] = [
  {
    id: 'e1', t: 308, type: 'score', team: 'home', points: 3, text: 'Big Mo hits a 3!', tags: ['three', 'clutch'],
    playerId: 'har-c-34', stat: 'pts3',
    fantasy: [{ memberId: 'maya', memberName: 'Maya', playerId: 'har-c-34', playerName: 'Big Mo', points: 3 }],
  },
  {
    id: 'e2', t: 301, type: 'play', team: 'away', text: 'Quick Kai strips the ball at midcourt.', tags: ['steal'],
    playerId: 'sum-pg-2', stat: 'stl',
    fantasy: [{ memberId: 'sam', memberName: 'Sam', playerId: 'sum-pg-2', playerName: 'Quick Kai', points: 3 }],
  },
  {
    id: 'e3', t: 296, type: 'score', team: 'away', points: 2, text: 'Rafa drives for the layup.', tags: ['layup'],
    playerId: 'sum-sg-10', stat: 'pts2',
    fantasy: [{ memberId: 'maya', memberName: 'Maya', playerId: 'sum-sg-10', playerName: 'Rafa', points: 2 }],
  },
  {
    id: 'e4', t: 289, type: 'foul', team: 'home', text: 'Doorbell picks up his third foul.', tags: ['foul'],
    playerId: 'har-pf-21', fantasy: [],
  },
  {
    id: 'e5', t: 281, type: 'score', team: 'home', points: 2, text: 'Lefty banks in a floater.', tags: ['floater'],
    playerId: 'har-sf-23', stat: 'pts2', fantasy: [],
  },
  {
    id: 'e6', t: 274, type: 'play', team: 'away', text: 'Tower cleans the glass.', tags: ['rebound'],
    playerId: 'sum-c-50', stat: 'reb',
    fantasy: [{ memberId: 'sam', memberName: 'Sam', playerId: 'sum-c-50', playerName: 'Tower', points: 1.2 }],
  },
  {
    id: 'e7', t: 266, type: 'score', team: 'away', points: 3, text: 'Ice finally hits one from the corner!', tags: ['three', 'assist'],
    playerId: 'sum-sf-14', stat: 'pts3', assistPlayerId: 'sum-pg-2',
    fantasy: [
      { memberId: 'priya', memberName: 'Priya', playerId: 'sum-sf-14', playerName: 'Ice', points: 3 },
      { memberId: 'sam', memberName: 'Sam', playerId: 'sum-pg-2', playerName: 'Quick Kai', points: 1.5 },
    ],
  },
  {
    id: 'e8', t: 259, type: 'score', team: 'home', points: 1, text: 'Jet sinks a free throw.', tags: ['free-throw'],
    playerId: 'har-pg-1', stat: 'ft',
    fantasy: [{ memberId: 'sam', memberName: 'Sam', playerId: 'har-pg-1', playerName: 'Jet', points: 1 }],
  },
  {
    id: 'e9', t: 250, type: 'play', team: 'home', text: 'The Wall swats it into the stands.', tags: ['block'],
    playerId: 'har-c-44', stat: 'blk', fantasy: [],
  },
  {
    id: 'e10', t: 243, type: 'score', team: 'away', points: 2, text: 'Hustle tips in the putback.', tags: ['putback'],
    playerId: 'sum-pf-15', stat: 'pts2', fantasy: [],
  },
];

const resolvedProp: PropView = {
  id: 'prop-3',
  gameId: GAME_ID,
  question: 'Who scores first after halftime?',
  options: [
    { id: 'harbor', label: 'Harbor Hawks', probability: 0.52 },
    { id: 'summit', label: 'Summit Foxes', probability: 0.48 },
  ],
  opensAt: 180,
  locksAt: 240,
  resolvesAt: 252,
  resolver: { kind: 'teamScoresFirst', afterT: 240, untilT: 300 },
  correctOptionId: 'harbor',
  explanation: 'Harbor got on the board first after the break when Jet sank a free throw at 4:19.',
  source: 'fallback',
  status: 'resolved',
  pickCounts: { harbor: 2, summit: 2 },
};

const activeProp: PropView = {
  id: 'prop-4',
  gameId: GAME_ID,
  question: 'Will the next score be a 3-pointer?',
  options: [
    { id: 'yes', label: 'Yes', probability: 0.41 },
    { id: 'no', label: 'No', probability: 0.59 },
  ],
  opensAt: 300,
  locksAt: 360,
  resolvesAt: 372,
  resolver: { kind: 'nextScoreType', afterT: 360 },
  source: 'fallback',
  status: 'open',
  secondsToLock: 48,
  realSecondsToLock: 12,
  pickCounts: { yes: 2, no: 1 },
};

const upcomingProp: PropView = {
  id: 'prop-5',
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
  source: 'fallback',
  status: 'upcoming',
  secondsToOpen: 48,
  pickCounts: {},
};

function pick(
  memberId: string, propId: string, optionId: string, optionLabel: string, at: number,
  source: 'voice' | 'screen', correct?: boolean,
): Pick & { memberName: string; optionLabel: string; correct?: boolean } {
  const p: Pick & { memberName: string; optionLabel: string; correct?: boolean } = {
    partyId: PARTY_ID, memberId, propId, optionId, at, source,
    memberName: memberInfo(memberId).member.name, optionLabel,
  };
  if (correct !== undefined) p.correct = correct;
  return p;
}

export const liveFixture: PartyStateResponse = {
  serverNow: BASE_NOW,
  version: 42,
  speed: SPEED,
  party: { id: PARTY_ID, code: PARTY_CODE, status: 'live', crewName: CREW_NAME, createdAt: BASE_NOW - 900_000, startedAt: STARTED_AT },
  game: gameBlock(GAME_T, 48, 45),
  households: HOUSEHOLDS,
  recentEvents,
  activeProp,
  lastResolvedProp: resolvedProp,
  props: [resolvedProp, activeProp, upcomingProp],
  picks: [
    pick('maya', 'prop-3', 'harbor', 'Harbor Hawks', STARTED_AT + 40_000, 'voice', true),
    pick('priya', 'prop-3', 'harbor', 'Harbor Hawks', STARTED_AT + 44_000, 'screen', true),
    pick('sam', 'prop-3', 'summit', 'Summit Foxes', STARTED_AT + 47_000, 'voice', false),
    pick('leo', 'prop-3', 'summit', 'Summit Foxes', STARTED_AT + 52_000, 'screen', false),
    pick('maya', 'prop-4', 'yes', 'Yes', BASE_NOW - 9_000, 'screen'),
    pick('leo', 'prop-4', 'yes', 'Yes', BASE_NOW - 6_000, 'voice'),
    pick('sam', 'prop-4', 'no', 'No', BASE_NOW - 3_000, 'voice'),
  ],
  standings: buildStandings(owned, {
    maya: { pickPoints: 50, streak: 3, prevRank: 2 },
    sam: { pickPoints: 35, streak: 0, prevRank: 1 },
    priya: { pickPoints: 40, streak: 1, prevRank: 3 },
    leo: { pickPoints: 20, streak: 0, prevRank: 4 },
  }),
  draftBoard: buildDraftBoard(owned, freeAgents, notes),
  ticker: [
    'Sam picked No',
    'Leo picked Yes',
    'Maya picked Yes',
    'Maya is on a 3-pick streak',
    'Priya called it: Harbor scored first',
  ],
};
