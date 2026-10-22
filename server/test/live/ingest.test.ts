import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOOTBALL_PICKS, buildFootballProps } from '../../src/game/footballProps.js';
import { GAMES, fallbackProps } from '../../src/game/games.js';
import { Store } from '../../src/game/store.js';
import { importGame, loadImportedGames } from '../../src/live/ingest.js';
import type { FetchLike } from '../../src/live/espn.js';
import type { Prop } from '../../src/shared/types.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/espn-synthetic.json', import.meta.url), 'utf8'));

let dir: string;
let calls: string[];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-import-'));
  calls = [];
  delete GAMES['espn-900001'];
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete GAMES['espn-900001'];
});

const net: FetchLike = async (url) => {
  calls.push(url);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  if (url.includes('/college-football/summary?event=900001')) return json(fixture);
  if (url.includes('/roster')) return json({ athletes: [{ position: 'offense', items: [{ id: '3', position: { abbreviation: 'TE' } }] }] });
  return json({ code: 404 }, 404);
};
const offline: FetchLike = async () => {
  throw new Error('network must not be used');
};

describe('importGame', () => {
  it('imports by event id, registers the game and its props, and writes the cache', async () => {
    const seen: string[] = [];
    const r = await importGame('900001', { fetch: net, dir, onNewGame: (g) => seen.push(g.id) });
    expect(r.cached).toBe(false);
    expect(r.game.id).toBe('espn-900001');
    expect(GAMES['espn-900001']).toBe(r.game);
    expect(seen).toEqual(['espn-900001']);
    expect(fallbackProps('espn-900001').length).toBe(r.props.length);
    expect(fs.existsSync(path.join(dir, 'espn-900001.json'))).toBe(true);
    // the roster endpoint's position map was applied (Cole Reyes -> TE)
    expect(r.game.home.roster.find((p) => p.name === 'Cole Reyes')!.position).toBe('TE');
  });

  it('second import is served from cache with no network, and does not re-warm AI notes', async () => {
    await importGame('900001', { fetch: net, dir });
    delete GAMES['espn-900001'];
    const seen: string[] = [];
    const r = await importGame('https://www.espn.com/college-football/game/_/gameId/900001', { fetch: offline, dir, onNewGame: (g) => seen.push(g.id) });
    expect(r.cached).toBe(true);
    expect(seen).toEqual([]);
    expect(GAMES['espn-900001']).toBeDefined();
  });

  it('loadImportedGames restores cached games at startup', async () => {
    await importGame('900001', { fetch: net, dir });
    delete GAMES['espn-900001'];
    expect(loadImportedGames(dir)).toBe(1);
    expect(GAMES['espn-900001'].title).toBe('Northgate Wolves at Lakeview Herons');
    expect(fallbackProps('espn-900001').length).toBeGreaterThan(0);
    expect(loadImportedGames(path.join(dir, 'missing'))).toBe(0);
  });

  it('refuses games that are not finished', async () => {
    const live = structuredClone(fixture);
    live.header.competitions[0].status.type = { completed: false, description: 'In Progress' };
    const f: FetchLike = async (u) => (u.includes('/summary?') ? new Response(JSON.stringify(live)) : new Response('{}', { status: 404 }));
    await expect(importGame('900001', { fetch: f, dir })).rejects.toThrow(/isn't finished yet/);
    expect(GAMES['espn-900001']).toBeUndefined();
  });

  it('a party for an imported game works end to end: create, join, draft real names, start, props', async () => {
    const { game } = await importGame('900001', { fetch: net, dir });
    let now = 1_000_000;
    const store = new Store({ persist: false, now: () => now, speed: 10 });
    const party = store.createParty({ crewId: 'sunday-crew', gameId: game.id });
    store.joinParty(party.code, 'garcias');
    store.joinParty(party.code, 'sams-place');
    const qb = game.home.roster.find((p) => p.name === 'Dan Archer')!;
    store.draft(party.code, 'maya', qb.id);
    store.start(party.code);
    now += 20_000; // 200 game seconds at speed 10
    const state = store.getState(party.code);
    expect(state.game.title).toBe(game.title);
    expect(state.game.gameT).toBeGreaterThan(150);
    expect(state.game.clock).toMatch(/^Q\d /);
    expect(state.props.length).toBeGreaterThan(0);
    expect(state.recentEvents.length).toBeGreaterThan(0);
    const maya = state.standings.find((s) => s.roster.some((r) => r.playerId === qb.id));
    expect(maya?.roster.find((r) => r.playerId === qb.id)!.points).toBeGreaterThan(0);
    now += 40_000;
    const late = store.getState(party.code);
    expect(late.game.clock).toBe('Final');
  });

  it('shows OT on the clock mid-overtime', async () => {
    const { game } = await importGame('900001', { fetch: net, dir });
    let now = 0;
    const store = new Store({ persist: false, now: () => now, speed: 10 });
    const party = store.createParty({ crewId: 'sunday-crew', gameId: game.id });
    store.start(party.code);
    now = 50_000; // 500 game seconds -> overtime
    expect(store.getState(party.code).game.clock).toBe('OT');
  });
});

describe('football props builder', () => {
  it('keeps the committed riverton props byte-identical', () => {
    const riverton = GAMES['riverton-vs-ironwood'];
    const committed = JSON.stringify(fallbackProps('riverton-vs-ironwood'));
    expect(JSON.stringify(buildFootballProps(riverton))).toBe(committed);
    expect(JSON.stringify(buildFootballProps(riverton, FOOTBALL_PICKS))).toBe(committed);
  });

  it('auto-picks spread drives for other games, alternating score / td', () => {
    const riverton = GAMES['riverton-vs-ironwood'];
    const other = { ...riverton, id: 'other-game' };
    const props: Prop[] = buildFootballProps(other);
    expect(props.length).toBeGreaterThanOrEqual(6);
    expect(props.length).toBeLessThanOrEqual(8);
    expect(props.map((p) => (p.resolver as { outcome: string }).outcome).slice(0, 4)).toEqual(['score', 'td', 'score', 'td']);
    expect(props.every((p) => p.gameId === 'other-game')).toBe(true);
    for (const p of props) expect(p.locksAt).toBeLessThan(p.resolvesAt);
    for (let i = 1; i < props.length; i++) expect(props[i].opensAt).toBeGreaterThanOrEqual(props[i - 1].resolvesAt - 1e-9);
  });
});
