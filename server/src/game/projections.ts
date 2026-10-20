// Projected fantasy points per night (a "season average"), used for draft
// alternatives and auto-fill. Distinct values so ordering is never ambiguous.
export const PLAYER_PROJECTIONS: Record<string, number> = {
  'har-c-34': 24.2,
  'sum-pg-2': 20.6,
  'har-sg-7': 20.1,
  'har-pg-1': 18.4,
  'sum-c-50': 17.7,
  'sum-sg-10': 16.9,
  'har-sf-11': 16.2,
  'sum-sf-14': 15.5,
  'har-pf-21': 14.8,
  'sum-pf-32': 14.1,
  'har-c-44': 12.3,
  'sum-sg-4': 11.6,
  'har-pg-5': 10.9,
  'sum-pf-15': 10.2,
  'har-sf-23': 9.5,
  'sum-sf-8': 8.8,
};

export function projectionOf(playerId: string): number {
  return PLAYER_PROJECTIONS[playerId] ?? 0;
}
