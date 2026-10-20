// Loads the committed game JSON and fallback props. Reads via fs so it works under tsx and vitest alike.
import fs from 'node:fs';
import type { Game, Prop } from '../shared/types.js';

function readJson<T>(url: URL): T {
  return JSON.parse(fs.readFileSync(url, 'utf8')) as T;
}

const harbor = readJson<Game>(new URL('./games/harbor-vs-summit.json', import.meta.url));
const FALLBACK_PROPS = readJson<Prop[]>(new URL('../ai/fallback/props.json', import.meta.url));

export const GAMES: Record<string, Game> = { [harbor.id]: harbor };

export function getGame(id: string): Game | undefined {
  return GAMES[id];
}

/** Deep copies of the committed fallback props for a game. */
export function fallbackProps(gameId: string): Prop[] {
  return FALLBACK_PROPS.filter((p) => p.gameId === gameId).map((p) => structuredClone(p));
}
