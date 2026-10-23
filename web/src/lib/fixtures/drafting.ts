import type { PartyStateResponse } from '@shared/types';
import {
  BASE_NOW, CREW_NAME, HOUSEHOLDS, PARTY_CODE, PARTY_ID, SPEED,
  buildDraftBoard, buildStandings, gameBlock, type OwnedSpec,
} from './shared';

// Snake draft, 7 of 12 slots filled: R1 Leo, Priya, Sam, Maya; R2 Maya, Sam, Priya (Leo on the clock).
const owned: OwnedSpec[] = [
  { playerId: 'har-pf-21', memberId: 'leo', round: 1, points: 0, statLine: '' },
  { playerId: 'har-sf-11', memberId: 'priya', round: 1, points: 0, statLine: '' },
  { playerId: 'sum-c-50', memberId: 'sam', round: 1, points: 0, statLine: '' },
  { playerId: 'har-sg-7', memberId: 'maya', round: 1, points: 0, statLine: '' },
  { playerId: 'har-c-34', memberId: 'maya', round: 2, points: 0, statLine: '' },
  { playerId: 'sum-pg-2', memberId: 'sam', round: 2, points: 0, statLine: '' },
  { playerId: 'sum-sf-14', memberId: 'priya', round: 2, points: 0, statLine: '' },
];

const notes: Record<string, string> = {
  'har-c-34': 'Paint presence and rebounder.',
  'sum-pg-2': 'Quick guard who creates steals.',
  'sum-sf-14': 'Inconsistent outside scorer.',
  'har-pg-1': 'Playmaking guard who creates assists.',
  'sum-sg-10': 'Streaky scorer.',
  'har-c-44': 'Shot-blocking center.',
};

export const draftingFixture: PartyStateResponse = {
  serverNow: BASE_NOW,
  version: 7,
  speed: SPEED,
  party: { id: PARTY_ID, code: PARTY_CODE, status: 'drafting', crewName: CREW_NAME, createdAt: BASE_NOW - 600_000 },
  game: gameBlock(0, 0, 0),
  households: HOUSEHOLDS,
  recentEvents: [],
  props: [],
  picks: [],
  standings: buildStandings(owned, {}),
  draftBoard: buildDraftBoard(owned, {}, notes),
  ticker: [
    'Priya drafted Ice',
    'Sam drafted Quick Kai',
    'Maya drafted Big Mo',
    'Maya drafted Splash',
    'Sam drafted Tower',
    'Priya drafted The Viking',
    'Leo drafted Doorbell',
  ],
};
