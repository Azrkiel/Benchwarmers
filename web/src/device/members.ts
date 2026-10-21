import type { Member, PartyStateResponse } from '@shared/types';

type StateLike = Pick<PartyStateResponse, 'households'>;

export const FALLBACK_HOUSEHOLDS: Record<string, { name: string; members: Member[] }> = {
  garcias: {
    name: 'The Garcias',
    members: [
      { id: 'maya', name: 'Maya', avatar: '🦊' },
      { id: 'leo', name: 'Leo', avatar: '🦁' },
    ],
  },
  'sams-place': {
    name: "Sam's Place",
    members: [
      { id: 'sam', name: 'Sam', avatar: '🐻' },
      { id: 'priya', name: 'Priya', avatar: '🦉' },
    ],
  },
};

export function membersFor(householdId: string, state?: StateLike | null): Member[] {
  const hh = state?.households?.find((h) => h.id === householdId);
  if (hh && hh.members.length > 0) return hh.members;
  return FALLBACK_HOUSEHOLDS[householdId]?.members ?? [];
}

export function householdName(householdId: string, state?: StateLike | null): string {
  const hh = state?.households?.find((h) => h.id === householdId);
  return hh?.name ?? FALLBACK_HOUSEHOLDS[householdId]?.name ?? householdId;
}
