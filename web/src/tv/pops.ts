import type { EventView, FantasyPop, Household } from '@shared/types';

/** Pop-ups stay on screen this long. */
export const POP_MS = 2500;

/**
 * Ids of events not seen before. `undefined` prevIds means first render: return [] so the
 * initial load does not spam pop-ups.
 */
export function newEventIds(prevIds: Set<string> | undefined, events: EventView[]): string[] {
  if (!prevIds) return [];
  return events.filter((e) => !prevIds.has(e.id)).map((e) => e.id);
}

/** Up to 1 decimal, no trailing ".0": 3 -> "3", 1.5 -> "1.5", 1.25 -> "1.3". */
export function formatPoints(n: number): string {
  return String(Math.round(Math.abs(n) * 10) / 10);
}

/** "+3 Maya", "+1.5 Sam", negative "−1 Leo" (U+2212 minus). */
export function formatPop(p: FantasyPop): string {
  const sign = p.points < 0 ? '−' : '+';
  return `${sign}${formatPoints(p.points)} ${p.memberName}`;
}

export function findMember(households: Household[], memberId: string) {
  for (const h of households) {
    const m = h.members.find((x) => x.id === memberId);
    if (m) return { member: m, household: h };
  }
  return undefined;
}

export function memberColor(households: Household[], memberId: string): string {
  return findMember(households, memberId)?.household.color ?? '#8892a6';
}
