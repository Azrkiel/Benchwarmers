import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import type { GameImporter } from '../../src/api/routes.js';
import { GAMES } from '../../src/game/games.js';
import { Store } from '../../src/game/store.js';
import { EspnError } from '../../src/live/espn.js';

let server: http.Server;
let base: string;
let importer: GameImporter;
const asked: string[] = [];

beforeEach(async () => {
  asked.length = 0;
  importer = async (q) => {
    asked.push(q);
    return { game: GAMES['riverton-vs-ironwood'], props: [], cached: q === 'cached' };
  };
  const store = new Store({ persist: false, speed: 4 });
  const app = createApp({ store, importer: (q) => importer(q) });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (body?: unknown) =>
  fetch(`${base}/api/games/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('POST /api/games/import', () => {
  it('201 with a game summary and the cached flag', async () => {
    const res = await post({ query: '  UVA vs FSU 2025 ' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { game: Record<string, unknown>; cached: boolean };
    expect(asked).toEqual(['UVA vs FSU 2025']);
    expect(body.cached).toBe(false);
    expect(body.game).toMatchObject({
      id: 'riverton-vs-ironwood',
      sport: 'football',
      durationSec: 480,
      home: { name: 'Ironwood Forge', short: 'IRN' },
      away: { name: 'Riverton Otters' },
    });
    expect((body.game.home as { color: string }).color).toMatch(/^#/);
    expect(((await (await post({ query: 'cached' })).json()) as { cached: boolean }).cached).toBe(true);
  });

  it('400 on an empty or missing query', async () => {
    for (const body of [{ query: '   ' }, {}, { query: 5 }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('BAD_REQUEST');
    }
    expect(asked).toEqual([]);
  });

  it('404 with a readable message when the game cannot be found', async () => {
    importer = async () => {
      throw new EspnError('not_found', "I couldn't work out two teams from \"zzz\".");
    };
    const res = await post({ query: 'zzz' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "I couldn't work out two teams from \"zzz\".", code: 'NOT_FOUND' });
  });

  it('502 when ESPN fails', async () => {
    importer = async () => {
      throw new EspnError('upstream', 'ESPN took too long to answer. Try again in a minute.');
    };
    const res = await post({ query: 'UVA vs FSU 2025' });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('UPSTREAM');
  });
});

describe('GET /api/games', () => {
  it('lists committed games (and imported ones once registered)', async () => {
    const body = (await (await fetch(`${base}/api/games`)).json()) as { games: { id: string; title: string; sport: string }[] };
    const ids = body.games.map((g) => g.id);
    expect(ids).toContain('harbor-vs-summit');
    expect(ids).toContain('riverton-vs-ironwood');
    expect(body.games.find((g) => g.id === 'riverton-vs-ironwood')).toMatchObject({ sport: 'football', title: 'Riverton Otters at Ironwood Forge' });
  });
});
