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

/* Proposed additive fields, copied from the master plan's P01.3 contract fragment so
 * the UI can be built before Worker A exports them. Replace with A's exported types
 * once published; do not grow this into a separate room model. */
export type SourceMode = 'scripted' | 'live';
export type SourceStatus = 'healthy' | 'delayed' | 'stale' | 'unavailable';
export type CourtPoint = { x: number; y: number };
export type BasketballContext = {
  sport: 'basketball';
  possessionTeamId: string | null;
  possessionPlayerId: string | null;
  ball: { point: CourtPoint; observedAt: number } | null;
  tracking: 'score_only' | 'team_possession' | 'player_possession' | 'ball';
};
export type FootballContext = { sport: 'football'; possessionTeamId: string | null; ballOn: number; down: number | null; toGo: number | null };
export type GameContext = BasketballContext | FootballContext;
export type RoomGameNext = RoomView['game'] & { gameId?: string; sport?: RoomSport; sourceMode?: SourceMode; sourceStatus?: SourceStatus; context?: GameContext };
export type RoomViewNext = Omit<RoomView, 'game'> & { version?: number; serverNow?: number; rulesVersion?: string; game: RoomGameNext };

/** Team id with the ball, or null when unknown. Never inferred from the last scorer. */
export function possessionTeamId(view: Pick<RoomView, 'game'>): string | null {
  const context = (view.game as RoomGameNext).context;
  if (context) return context.possessionTeamId;
  return view.game.possession;
}

export function sourceStatus(view: Pick<RoomView, 'game'>): SourceStatus {
  return (view.game as RoomGameNext).sourceStatus ?? 'healthy';
}
