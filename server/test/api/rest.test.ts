import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as indexModule from '../../src/index.js';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';

let dir: string;
let t: number;
let server: http.Server;
let base: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-api-'));
  t = 1_000_000;
  const store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => t, speed: 4 });
  const app = createApp({ store });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (p: string) => fetch(base + p);
const post = (p: string, body?: unknown) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['code', 'error']);
  expect(typeof body.error).toBe('string');
  expect(typeof body.code).toBe('string');
  expect(body.code).toBe(code);
  return body;
}

describe('index module', () => {
  it('exports createApp/main and does not listen on import', () => {
    expect(typeof indexModule.createApp).toBe('function');
    expect(typeof indexModule.main).toBe('function');
  });
});

describe('healthz', () => {
  it('returns ok', async () => {
    const res = await get('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string; time: number };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('benchwarmers');
    expect(typeof body.time).toBe('number');
  });
});

describe('state', () => {
  it('returns full state, 204 for matching since, 200 otherwise', async () => {
    const res = await get('/api/parties/DEMO/state');
    expect(res.status).toBe(200);
    const st = (await res.json()) as {
      version: number;
      party: { status: string };
      draftBoard: unknown[];
      standings: unknown[];
      props: unknown[];
    };
    expect(st.party.status).toBe('drafting');
    expect(st.draftBoard).toHaveLength(16);
    expect(st.standings).toHaveLength(4);
    expect(st.props).toHaveLength(8);

    const same = await get(`/api/parties/DEMO/state?since=${st.version}`);
    expect(same.status).toBe(204);
    expect(await same.text()).toBe('');

    const other = await get(`/api/parties/DEMO/state?since=${st.version + 1}`);
    expect(other.status).toBe(200);
    expect(((await other.json()) as { version: number }).version).toBe(st.version);
  });

  it('404s for unknown code', async () => {
    await expectError(await get('/api/parties/ZZZZ/state'), 404, 'NOT_FOUND');
  });
});

describe('parties', () => {
  it('creates a party', async () => {
    const res = await post('/api/parties', { crewId: 'sunday-crew' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string; party: { code: string; status: string } };
    expect(body.code).toMatch(/^[A-Z]{4}$/);
    expect(body.party.code).toBe(body.code);
    expect(body.party.status).toBe('drafting');
  });

  it('rejects unknown crew and missing crewId', async () => {
    await expectError(await post('/api/parties', { crewId: 'nope' }), 404, 'NOT_FOUND');
    await expectError(await post('/api/parties', {}), 400, 'BAD_REQUEST');
    await expectError(await post('/api/parties'), 400, 'BAD_REQUEST');
  });

  it('joins a household', async () => {
    const res = await post('/api/parties/DEMO/join', { householdId: 'garcias' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { party: { code: string } }).party.code).toBe('DEMO');
    await expectError(await post('/api/parties/DEMO/join', { householdId: 'nobody' }), 404, 'NOT_FOUND');
    await expectError(await post('/api/parties/DEMO/join', {}), 400, 'BAD_REQUEST');
  });

  it('drafts and reports PLAYER_TAKEN with alternatives', async () => {
    const ok = await post('/api/parties/DEMO/draft', { memberId: 'maya', playerId: 'har-c-34' });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { draftPick: { playerId: string; memberId: string } };
    expect(body.draftPick.playerId).toBe('har-c-34');

    const taken = await expectError(
      await post('/api/parties/DEMO/draft', { memberId: 'leo', playerId: 'har-c-34' }),
      409,
      'PLAYER_TAKEN',
    );
    expect(String(taken.error).length).toBeGreaterThan(10);
    await expectError(await post('/api/parties/DEMO/draft', { memberId: 'leo' }), 400, 'BAD_REQUEST');
  });

  it('picks during drafting (fb-1), then BAD_OPTION and PICKS_LOCKED', async () => {
    const ok = await post('/api/parties/DEMO/picks', { memberId: 'sam', optionId: 'home' });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { pick: { propId: string; source: string } };
    expect(body.pick.propId).toBe('fb-1');
    expect(body.pick.source).toBe('screen');

    const voice = await post('/api/parties/DEMO/picks', { memberId: 'sam', optionId: 'away', source: 'voice' });
    expect(((await voice.json()) as { pick: { source: string } }).pick.source).toBe('voice');

    await expectError(await post('/api/parties/DEMO/picks', { memberId: 'sam', optionId: 'zzz' }), 400, 'BAD_OPTION');
    await expectError(
      await post('/api/parties/DEMO/picks', { memberId: 'sam', optionId: 'home', source: 'carrier-pigeon' }),
      400,
      'BAD_REQUEST',
    );
    await expectError(await post('/api/parties/DEMO/picks', { optionId: 'home' }), 400, 'BAD_REQUEST');

    expect((await post('/api/parties/DEMO/start')).status).toBe(200);
    t += (45 / 4) * 1000;
    await expectError(await post('/api/parties/DEMO/picks', { memberId: 'sam', optionId: 'home' }), 409, 'PICKS_LOCKED');
  });

  it('starts once, then BAD_STATUS', async () => {
    const res = await post('/api/parties/DEMO/start');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { party: { status: string } }).party.status).toBe('live');
    await expectError(await post('/api/parties/DEMO/start'), 409, 'BAD_STATUS');
  });

  it('resets DEMO', async () => {
    const before = (await (await get('/api/parties/DEMO/state')).json()) as { version: number };
    await post('/api/parties/DEMO/start');
    const res = await post('/api/parties/DEMO/reset');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { party: { status: string; version: number } };
    expect(body.party.status).toBe('drafting');
    expect(body.party.version).toBeGreaterThan(before.version);
    await expectError(await post('/api/parties/ZZZZ/reset'), 404, 'NOT_FOUND');
  });
});

describe('crews', () => {
  it('returns the season', async () => {
    const res = await get('/api/crews/sunday-crew/season');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { crew: { id: string }; rows: unknown[] };
    expect(body.crew.id).toBe('sunday-crew');
    expect(body.rows).toHaveLength(4);
    await expectError(await get('/api/crews/nope/season'), 404, 'NOT_FOUND');
  });

  it('returns the current party code', async () => {
    const res = await get('/api/crews/sunday-crew/current');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'DEMO' });
    const err = await expectError(await get('/api/crews/nope/current'), 404, 'NOT_FOUND');
    expect(err.error).toBe('No watch party yet for this crew.');
  });
});

describe('errors', () => {
  it('400s on malformed JSON', async () => {
    const res = await fetch(base + '/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"crewId": ',
    });
    await expectError(res, 400, 'BAD_REQUEST');
  });

  it('404s on unknown api route', async () => {
    await expectError(await get('/api/nope'), 404, 'NOT_FOUND');
  });
});
