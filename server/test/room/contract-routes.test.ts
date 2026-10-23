import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { createRoomRouter } from '../../src/room/routes.js';
import type { RoomSnapshot } from '../../src/room/types.js';

let server: http.Server;
let base: string;
let dir: string;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-room-api-'));
  const store = new RoomStore({ dataFile: path.join(dir, 'rooms.json'), now: () => 1000 });
  const app = express();
  app.use('/api/rooms', createRoomRouter(store));
  server = await new Promise<http.Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
});
afterEach(async () => {
  vi.restoreAllMocks(); server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});
const post = (suffix: string, body: unknown) => fetch(base + suffix, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('additive room REST contract', () => {
  it('supports explicit football selection and rejects unknown IDs without a side effect', async () => {
    const bad = await post('', { gameId: 'unknown' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'GAME_NOT_SUPPORTED' });
    expect(await (await fetch(base)).json()).toEqual({ rooms: [] });
    const good = await post('', { gameId: 'morning-wood-vs-swiss-cheese' });
    expect(good.status).toBe(201);
    const body = await good.json() as ReturnType<RoomStore['create']>;
    expect(body.view).toMatchObject({ version: 1, serverNow: 1000, rulesVersion: 'football-v1', game: { sport: 'football' } });
  });

  it('returns 503 and leaves a lineup unaccepted when persistence fails', async () => {
    const room = await (await post('', {})).json() as ReturnType<RoomStore['create']>;
    const code = room.view.room.code;
    const seat = await (await post(`/${code}/join`, { name: 'Fan' })).json() as ReturnType<RoomStore['join']>;
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    const failed = await post(`/${code}/auto-lineup`, { participantToken: seat.participantToken });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ code: 'ROOM_SAVE_FAILED' });
    const get = () => fetch(`${base}/${code}`, { headers: { authorization: `Bearer ${seat.participantToken}` } }).then(res => res.json() as Promise<RoomSnapshot>);
    const before = await get();
    expect(before.version).toBe(seat.view.version);
    expect(before.me?.lineup).toBeUndefined();
    const retried = await post(`/${code}/auto-lineup`, { participantToken: seat.participantToken });
    expect(retried.status).toBe(200);
    expect(((await retried.json()) as RoomSnapshot).me?.lineup?.flexIds).toHaveLength(4);
  });
});
