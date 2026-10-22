// "Pull up a real game": resolve -> fetch -> convert -> props -> register, cached on disk so restarts and repeat
// imports need no network. Runtime only; nothing here is committed data (server/data/ is gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { buildFootballProps } from '../game/footballProps.js';
import { GAMES, registerGame } from '../game/games.js';
import type { Game, Prop } from '../shared/types.js';
import { espnSummaryToGame } from './convert.js';
import {
  EspnError,
  fetchRosterPositions,
  fetchSummary,
  norm,
  parseEventRef,
  resolveGame,
  type EspnDeps,
  type League,
} from './espn.js';

export type ImportDeps = EspnDeps & {
  /** Cache directory. Default: data/imported-games under the process cwd (like DATA_FILE). */
  dir?: string;
  /** Called once for each newly built (not cache-loaded) game, e.g. to warm AI scouting notes in the background. */
  onNewGame?: (game: Game) => void;
};

export type ImportResult = { game: Game; props: Prop[]; cached: boolean };

type CacheFile = { game: Game; props: Prop[]; importedAt: string };

export const defaultImportDir = (): string => path.resolve(process.cwd(), 'data/imported-games');

const fileFor = (dir: string, gameId: string): string => path.join(dir, `${gameId}.json`);
const indexFile = (dir: string): string => path.join(dir, 'index.json');

function readIndex(dir: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(indexFile(dir), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function remember(dir: string, query: string, gameId: string): void {
  try {
    const idx = readIndex(dir);
    idx[norm(query)] = gameId;
    writeAtomic(indexFile(dir), idx);
  } catch {
    /* the index is only a speed-up */
  }
}

function readCached(dir: string, gameId: string): CacheFile | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(fileFor(dir, gameId), 'utf8')) as CacheFile;
    if (c?.game?.id === gameId && Array.isArray(c.game.events) && Array.isArray(c.props)) return c;
  } catch {
    /* missing or corrupt: fall through to a fresh import */
  }
  return undefined;
}

function useCached(c: CacheFile): ImportResult {
  if (!GAMES[c.game.id]) registerGame(c.game, c.props);
  return { game: GAMES[c.game.id], props: c.props, cached: true };
}

/** Load every cached import into the runtime registry (startup). Returns how many games were loaded. */
export function loadImportedGames(dir: string = defaultImportDir()): number {
  let n = 0;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  for (const f of names) {
    if (!/^espn-\d+\.json$/.test(f)) continue;
    const c = readCached(dir, f.replace(/\.json$/, ''));
    if (!c) continue;
    try {
      registerGame(c.game, c.props);
      n++;
    } catch (err) {
      console.warn(`[import] skipped ${f}:`, (err as Error).message);
    }
  }
  return n;
}

const inflight = new Map<string, Promise<ImportResult>>();

export function importGame(query: string, deps: ImportDeps = {}): Promise<ImportResult> {
  const q = (query ?? '').trim();
  if (!q) return Promise.reject(new EspnError('bad_request', 'Tell me which game, like "UVA vs FSU 2025".'));
  const dir = deps.dir ?? defaultImportDir();
  const key = `${dir}|${norm(q)}`;
  let p = inflight.get(key);
  if (!p) {
    p = doImport(q, dir, deps).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function doImport(q: string, dir: string, deps: ImportDeps): Promise<ImportResult> {
  // Instant paths: an event id / URL, or a query we have answered before.
  const ref = parseEventRef(q);
  const guess = ref ? `espn-${ref.eventId}` : readIndex(dir)[norm(q)];
  if (guess) {
    const c = readCached(dir, guess);
    if (c) return useCached(c);
  }

  const resolved = await resolveGame(q, deps);
  const gameId = `espn-${resolved.eventId}`;
  const known = readCached(dir, gameId);
  if (known) {
    remember(dir, q, gameId);
    return useCached(known);
  }
  if (!resolved.completed) {
    throw new EspnError(
      'not_found',
      `${resolved.title} isn't finished yet (${resolved.status}). I can only replay games that are over.`,
    );
  }

  const league: League = resolved.league;
  const summary = resolved.summary ?? (await fetchSummary(resolved.eventId, league, deps));
  const competitors = (summary as { header?: { competitions?: { competitors?: { team?: { id?: string } }[] }[] } }).header
    ?.competitions?.[0]?.competitors;
  const teamIds = (competitors ?? []).map((c) => c.team?.id).filter((x): x is string => !!x);
  const rosters = await Promise.all(teamIds.map((id) => fetchRosterPositions(id, league, deps)));
  const positions = Object.assign({}, ...rosters) as Record<string, string>;

  let game: Game;
  try {
    game = espnSummaryToGame(summary, positions);
  } catch (err) {
    throw new EspnError('upstream', `ESPN sent a game I couldn't read (${(err as Error).message}).`);
  }
  if (!game.events.some((e) => e.type === 'drive')) {
    throw new EspnError('not_found', `ESPN has no play-by-play for ${resolved.title}, so I can't replay it.`);
  }
  const props = buildFootballProps(game);
  if (props.length === 0) throw new EspnError('not_found', `${resolved.title} doesn't have enough drives to make picks from.`);

  writeAtomic(fileFor(dir, gameId), { game, props, importedAt: new Date().toISOString() } satisfies CacheFile);
  remember(dir, q, gameId);
  registerGame(game, props);
  try {
    deps.onNewGame?.(game);
  } catch (err) {
    console.warn('[import] onNewGame failed', err);
  }
  return { game, props, cached: false };
}
