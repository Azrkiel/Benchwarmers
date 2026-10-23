import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import { RoomStore } from '../../src/room/store.js';

let server: http.Server;
let base: string;
let store: RoomStore;
let dir: string;
let now: number;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-playback-api-'));
  now = 1000;
  store = new RoomStore({ dataFile: path.join(dir, 'rooms.json'), now: () => now });
  const app = createApp({ store: new Store({ persist: false, now: () => now }), roomStore: store });
  server = await new Promise<http.Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
});
afterEach(async () => {
  server?.closeAllConnections();
  if(server) await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});
const post = (suffix: string, body: unknown) => fetch(base + suffix, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('registered playback lease API', () => {
  it('grants, renews, isolates rooms, releases only the holder, and permits only that room host to take over', async () => {
    const a = store.create({ gameId: 'harbor-vs-summit' });
    const b = store.create();
    const seat = store.join(a.view.room.code, { name: 'Fan' });
    const prefix = `/${a.view.room.code.toLowerCase()}/playback`;
    expect(await (await fetch(base + prefix)).json()).toEqual({ lease: null });
    const claim = await post(`${prefix}/claim`, { deviceId: 'screen-a-0001', label: 'Living room' });
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({ granted: true, mine: true, lease: { label: 'Living room' } });
    const alias=`/%20${a.view.room.code.toLowerCase()}%20/playback`;
    expect((await post(`${alias}/claim`, { deviceId:'screen-b-0002' })).status).toBe(409);
    expect((await post(`${prefix}/claim`, { deviceId: 'screen-a-0001' })).status).toBe(200);
    for(const hostToken of [undefined, 'wrong', seat.participantToken, b.hostToken]) {
      expect((await post(`${prefix}/claim`, { deviceId: 'screen-b-0002', force: true, hostToken })).status).toBe(409);
    }
    expect((await post(`/${b.view.room.code}/playback/claim`, { deviceId: 'screen-b-0002' })).status).toBe(200);
    const takeover = await post(`${prefix}/claim`, { deviceId: 'screen-b-0002', label: 'Kitchen', force: true, hostToken: a.hostToken });
    expect(takeover.status).toBe(200);
    await post(`${prefix}/release`, { deviceId: 'screen-a-0001' });
    const publicLease = await (await fetch(base + prefix)).json();
    expect(publicLease).toMatchObject({ lease: { label: 'Kitchen' } });
    const serialized = JSON.stringify(publicLease);
    for(const secret of ['screen-b-0002', a.hostToken, seat.participantToken]) expect(serialized).not.toContain(secret);
    await post(`${prefix}/release`, { deviceId: 'screen-b-0002' });
    expect(await (await fetch(base + prefix)).json()).toEqual({ lease: null });
  });

  it('rejects nonexistent rooms and malformed requests without creating phantom leases', async () => {
    expect((await fetch(`${base}/NOPE/playback`)).status).toBe(404);
    expect((await post('/NOPE/playback/claim', { deviceId: 'screen-a-0001' })).status).toBe(404);
    expect((await post('/NOPE/playback/release', { deviceId: 'screen-a-0001' })).status).toBe(404);
    const { view } = store.create(); const prefix=`/${view.room.code}/playback`;
    expect((await post(`${prefix}/claim`, { deviceId: 'short' })).status).toBe(400);
    expect((await post(`${prefix}/claim`, { deviceId: 'screen-a-0001', force: 'yes' })).status).toBe(400);
    expect((await post(`${prefix}/release`, {})).status).toBe(400);
    expect(await (await fetch(base + prefix)).json()).toEqual({ lease: null });
  });

  it('checks room/host existence without ticking or persisting the replay', async () => {
    const created=store.create({gameId:'harbor-vs-summit',speed:4});const code=created.view.room.code;
    store.host(code,{hostToken:created.hostToken,action:'start'});
    const before=fs.readFileSync(path.join(dir,'rooms.json'),'utf8');
    now+=100000;
    expect(store.isHost(code.toLowerCase(),created.hostToken)).toBe(true);
    expect(store.isHost(code,'')).toBe(false);
    expect((await post(`/${code}/playback/claim`,{deviceId:'screen-a-0001'})).status).toBe(200);
    expect(fs.readFileSync(path.join(dir,'rooms.json'),'utf8')).toBe(before);
  });
});
