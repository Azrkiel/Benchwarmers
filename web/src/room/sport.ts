import type { RoomView } from '@shared/room';

/**
 * Client helpers over Worker A's additive game contract (master plan P01.3). The
 * fields are optional on RoomView during migration, so every read defaults to the
 * football behavior older snapshots imply.
 */
export type RoomSport = 'basketball' | 'football';
export const BASKETBALL_GAME_ID = 'harbor-vs-summit';

export const GAME_CHOICES = [
  { id: 'basketball', gameId: BASKETBALL_GAME_ID, label: 'Basketball', detail: 'Harbor vs Summit', source: 'Fictional basketball replay' },
  // Omitting gameId keeps the server's backward-compatible football room.
  { id: 'football', gameId: undefined, label: 'Football', detail: 'Swiss Cheese at Morning Wood', source: 'Fictional football replay' },
] as const;
export type GameChoice = (typeof GAME_CHOICES)[number];

export function roomSport(view: Pick<RoomView, 'game'>): RoomSport {
  return view.game.sport === 'basketball' ? 'basketball' : 'football';
}

export function sourceLabel(view: Pick<RoomView, 'game'>): string {
  return roomSport(view) === 'basketball' ? 'Fictional basketball replay' : 'Fictional football replay';
}

/* Worker A's exported contract (server/src/room/types.ts, checkpoint d6a1098). */
export type { SourceMode, SourceStatus, CourtPoint, BasketballContext, FootballContext, GameContext } from '@shared/room';
/** A snapshot whose additive metadata may be absent (older servers and fixtures). */
export type RoomViewNext = RoomView;
export type RoomGameNext = RoomView['game'];

/** Team id with the ball, or null when unknown. Never inferred from the last scorer. */
export function possessionTeamId(view: Pick<RoomView, 'game'>): string | null {
  const context = view.game.context;
  if (context) return context.possessionTeamId;
  return view.game.possession;
}

export function sourceStatus(view: Pick<RoomView, 'game'>): NonNullable<RoomView['game']['sourceStatus']> {
  return view.game.sourceStatus ?? 'healthy';
}
