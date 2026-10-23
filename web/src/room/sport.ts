import type { RoomView } from '@shared/room';

/**
 * Client adapter for the additive game contract (master plan P01.3). Worker A owns the
 * real fields; until they land, older football snapshots simply omit them, so every
 * read here is optional and defaults to the football behavior the server has today.
 */
export type RoomSport = 'basketball' | 'football';
export const BASKETBALL_GAME_ID = 'harbor-vs-summit';

export const GAME_CHOICES = [
  { id: 'basketball', gameId: BASKETBALL_GAME_ID, label: 'Basketball', detail: 'Harbor vs Summit', source: 'Fictional basketball replay' },
  // Omitting gameId keeps the server's backward-compatible football room.
  { id: 'football', gameId: undefined, label: 'Football', detail: 'Swiss Cheese at Morning Wood', source: 'Fictional football replay' },
] as const;
export type GameChoice = (typeof GAME_CHOICES)[number];

type AdditiveGame = { sport?: string; gameId?: string };

export function roomSport(view: Pick<RoomView, 'game'>): RoomSport {
  return (view.game as AdditiveGame).sport === 'basketball' ? 'basketball' : 'football';
}

export function sourceLabel(view: Pick<RoomView, 'game'>): string {
  return roomSport(view) === 'basketball' ? 'Fictional basketball replay' : 'Fictional football replay';
}
