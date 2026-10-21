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
  // Football (riverton-vs-ironwood)
  'riv-qb-12': 22.8,
  'irn-qb-9': 21.9,
  'riv-rb-28': 14.7,
  'irn-rb-22': 13.9,
  'riv-wr-81': 13.2,
  'irn-wr-80': 12.6,
  'irn-wr-84': 11.8,
  'riv-wr-85': 11.1,
  'irn-te-87': 9.7,
  'riv-te-88': 9.1,
  'riv-k-3': 8.6,
  'irn-k-6': 8.2,
  'riv-rb-34': 7.4,
  'irn-rb-30': 6.9,
  'riv-wr-17': 6.3,
  'irn-wr-11': 5.8,
};

export function projectionOf(playerId: string): number {
  return PLAYER_PROJECTIONS[playerId] ?? 0;
}
