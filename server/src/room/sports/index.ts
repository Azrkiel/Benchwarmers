import { football, FOOTBALL_GAME_ID } from './football.js';
import type { RoomSportAdapter } from './adapter.js';

export { FOOTBALL_GAME_ID };
export type { RoomSportAdapter } from './adapter.js';

// Register a new adapter only when its room replay is playable and validated.
const adapters = new Map<string, RoomSportAdapter>([[football.gameId, football]]);
export function getRoomSportAdapter(gameId = FOOTBALL_GAME_ID): RoomSportAdapter | undefined {
  return adapters.get(gameId);
}
