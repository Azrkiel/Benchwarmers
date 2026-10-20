// Seed data: the Sunday Crew, three finished past nights, season stats and the DEMO party.
import type { Crew, DraftPick, Household, Pick, Prop, SeasonStats, WatchParty } from '../shared/types.js';
import { fallbackProps } from './games.js';

export type PartyRecord = {
  party: WatchParty;
  drafts: DraftPick[];
  picks: Pick[];
  props: Prop[];
  resolvedPropIds: string[];
  recap?: string;
  lastRanks: Record<string, number>;
  prevRanks: Record<string, number>;
  fingerprint: string;
  seasonApplied: boolean;
  /** Newest first, capped at 20. */
  ticker: string[];
};

export type StoreState = {
  crews: Crew[];
  households: Household[];
  /** Keyed by upper-case party code. */
  parties: Record<string, PartyRecord>;
  season: Record<string, SeasonStats>;
  /** Best single drafted-player score per member, used to pick the season's bestDraftPick. */
  bestDraftPoints: Record<string, number>;
  scoutingNotes: Record<string, Record<string, string>>;
};

const GAME_ID = 'harbor-vs-summit';
const DAY = 24 * 60 * 60 * 1000;

function emptyRecord(party: WatchParty, props: Prop[], seasonApplied: boolean): PartyRecord {
  return {
    party,
    drafts: [],
    picks: [],
    props,
    resolvedPropIds: [],
    lastRanks: {},
    prevRanks: {},
    fingerprint: '',
    seasonApplied,
    ticker: [],
  };
}

export function seedState(now: number): StoreState {
  const crews: Crew[] = [{ id: 'sunday-crew', name: 'Sunday Crew', householdIds: ['garcias', 'sams-place'] }];
  const households: Household[] = [
    {
      id: 'garcias',
      name: 'The Garcias',
      city: 'Austin',
      color: '#F2B33D',
      members: [
        { id: 'maya', name: 'Maya', avatar: '🦊' },
        { id: 'leo', name: 'Leo', avatar: '🐻' },
      ],
    },
    {
      id: 'sams-place',
      name: "Sam's Place",
      city: 'Seattle',
      color: '#3DD6B5',
      members: [
        { id: 'sam', name: 'Sam', avatar: '🐙' },
        { id: 'priya', name: 'Priya', avatar: '🦉' },
      ],
    },
  ];

  const parties: Record<string, PartyRecord> = {};
  [
    ['OCT6', 21],
    ['OCT13', 14],
    ['OCT20', 7],
  ].forEach(([code, daysAgo]) => {
    const c = code as string;
    const startedAt = now - (daysAgo as number) * DAY;
    parties[c] = emptyRecord(
      {
        id: `party-${c.toLowerCase()}`,
        code: c,
        crewId: 'sunday-crew',
        gameId: GAME_ID,
        householdIds: ['garcias', 'sams-place'],
        createdAt: startedAt - 60 * 60 * 1000,
        startedAt,
        status: 'final',
        version: 1,
      },
      [],
      true,
    );
  });

  parties.DEMO = emptyRecord(
    {
      id: 'party-demo',
      code: 'DEMO',
      crewId: 'sunday-crew',
      gameId: GAME_ID,
      householdIds: ['garcias', 'sams-place'],
      createdAt: now,
      status: 'drafting',
      version: 1,
    },
    fallbackProps(GAME_ID),
    false,
  );

  const season: Record<string, SeasonStats> = {
    maya: { memberId: 'maya', points: 112.5, fantasyPoints: 71.4, correct: 11, total: 17, bestStreak: 4, currentStreak: 2, partiesPlayed: 3, nightsWon: 1, bestDraftPick: 'Splash Okafor (31.5 pts)' },
    leo: { memberId: 'leo', points: 85, fantasyPoints: 58.2, correct: 9, total: 18, bestStreak: 3, currentStreak: 0, partiesPlayed: 3, nightsWon: 0, bestDraftPick: 'Big Mo (24.6 pts)' },
    sam: { memberId: 'sam', points: 127.5, fantasyPoints: 64.8, correct: 12, total: 17, bestStreak: 5, currentStreak: 1, partiesPlayed: 3, nightsWon: 2, bestDraftPick: 'Tower (28.8 pts)' },
    priya: { memberId: 'priya', points: 98, fantasyPoints: 76.1, correct: 10, total: 16, bestStreak: 3, currentStreak: 3, partiesPlayed: 3, nightsWon: 0, bestDraftPick: 'Quick Kai (29.4 pts)' },
  };
  const bestDraftPoints: Record<string, number> = { maya: 31.5, leo: 24.6, sam: 28.8, priya: 29.4 };

  return { crews, households, parties, season, bestDraftPoints, scoutingNotes: {} };
}
