// Loads the committed game JSON and fallback props. Reads via fs so it works under tsx and vitest alike.
import fs from 'node:fs';
import type { Game, Prop } from '../shared/types.js';

function readJson<T>(url: URL): T {
  return JSON.parse(fs.readFileSync(url, 'utf8')) as T;
}

const harbor = readJson<Game>(new URL('./games/harbor-vs-summit.json', import.meta.url));
const riverton = readJson<Game>(new URL('./games/riverton-vs-ironwood.json', import.meta.url));
const FALLBACK_PROPS = readJson<Prop[]>(new URL('../ai/fallback/props.json', import.meta.url));

export const GAMES: Record<string, Game> = { [harbor.id]: harbor, [riverton.id]: riverton };

export function getGame(id: string): Game | undefined {
  return GAMES[id];
}

const COMMITTED_IDS: ReadonlySet<string> = new Set(Object.keys(GAMES));
const RUNTIME_PROPS = new Map<string, Prop[]>();

/**
 * Add (or replace) a runtime-imported game and its generated props. Committed demo games can never be replaced, so an
 * import can't shadow seed data. `fallbackProps(game.id)` then returns the registered props.
 */
export function registerGame(game: Game, props: Prop[]): void {
  if (COMMITTED_IDS.has(game.id)) throw new Error(`cannot replace committed game ${game.id}`);
  GAMES[game.id] = game;
  RUNTIME_PROPS.set(game.id, props.map((p) => structuredClone(p)));
}

/** Deep copies of the fallback props for a game: committed JSON first, then runtime-registered imports. */
export function fallbackProps(gameId: string): Prop[] {
  const committed = FALLBACK_PROPS.filter((p) => p.gameId === gameId);
  return (committed.length ? committed : (RUNTIME_PROPS.get(gameId) ?? [])).map((p) => structuredClone(p));
}
