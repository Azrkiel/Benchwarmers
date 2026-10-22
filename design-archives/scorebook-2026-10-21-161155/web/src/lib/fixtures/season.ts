import type { SeasonResponse, SeasonRow } from '@shared/types';
import { CREW_ID, CREW_NAME, HOUSEHOLDS, memberInfo } from './shared';

type Stats = Omit<SeasonRow, 'name' | 'household' | 'householdId' | 'avatar' | 'rank'>;

// 4 past parties: Maya won 2 nights, Sam 1, Priya 1.
const stats: Stats[] = [
  { memberId: 'maya', points: 612, bestStreak: 5, currentStreak: 2, correct: 21, total: 32, partiesPlayed: 4, fantasyPoints: 468.5, nightsWon: 2, bestDraftPick: 'Big Mo' },
  { memberId: 'sam', points: 540, bestStreak: 4, currentStreak: 0, correct: 19, total: 32, partiesPlayed: 4, fantasyPoints: 421.2, nightsWon: 1, bestDraftPick: 'Quick Kai' },
  { memberId: 'priya', points: 455, bestStreak: 3, currentStreak: 1, correct: 18, total: 32, partiesPlayed: 4, fantasyPoints: 347.8, nightsWon: 1, bestDraftPick: 'The Viking' },
  { memberId: 'leo', points: 380, bestStreak: 3, currentStreak: 0, correct: 14, total: 32, partiesPlayed: 4, fantasyPoints: 330.4, nightsWon: 0, bestDraftPick: 'Doorbell' },
];

const rows: SeasonRow[] = stats
  .slice()
  .sort((a, b) => b.points - a.points)
  .map((s, i) => {
    const { member, household } = memberInfo(s.memberId);
    return { ...s, name: member.name, household: household.name, householdId: household.id, avatar: member.avatar, rank: i + 1 };
  });

export const seasonFixture: SeasonResponse = {
  crew: { id: CREW_ID, name: CREW_NAME, householdIds: ['garcias', 'sams-place'] },
  households: HOUSEHOLDS,
  rows,
};
