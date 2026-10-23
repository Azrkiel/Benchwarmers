import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import { RoomStore } from '../../src/room/store.js';
import type { RoomSnapshot } from '../../src/room/types.js';

it('plays basketball through the real app HTTP path, rolls back a failed pick and survives restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basketball-http-'));
  const dataFile = path.join(dir, 'rooms.json');
  let now = 1000, base = '';
  let server: http.Server | undefined;
  const start = async () => {
    const app = createApp({ store: new Store({ persist: false, now: () => now }), roomStore: new RoomStore({ dataFile, now: () => now }) });
    server = await new Promise<http.Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const stop = async () => { server?.closeAllConnections(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; };
  const request = async <T=RoomSnapshot>(suffix: string, body?: unknown, expected = 200):Promise<T> => {
    const response = await fetch(base + suffix, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); expect(response.status).toBe(expected); return result as T;
  };
  try {
    await start();
    expect((await request<{ok:boolean}>('/healthz')).ok).toBe(true);
    await request('/api/parties/DEMO/state');
    const created = await request<ReturnType<RoomStore['create']>>('/api/rooms', { gameId: 'harbor-vs-summit', speed: 4 }, 201);
    expect(created.view.game.sport).toBe('basketball');
    const prefix = `/api/rooms/${created.view.room.code}`;
    const seat = await request<ReturnType<RoomStore['join']>>(`${prefix}/join`, { name: 'HTTP Fan' }, 201);
    await request(`${prefix}/auto-lineup`, { participantToken: seat.participantToken });
    await request(`${prefix}/host`, { hostToken: created.hostToken, action: 'start' });
    now += 100000;
    const open = await request(prefix);
    const pick = { participantToken: seat.participantToken, requestId:'http-pick', questionId: open.question!.id, optionId: 'harbor' };
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect((await request<{code:string}>(`${prefix}/picks`, pick, 503)).code).toBe('ROOM_SAVE_FAILED');
    vi.restoreAllMocks();
    expect((await request(prefix)).version).toBe(open.version);
    const accepted=await request(`${prefix}/picks`, pick);
    const lookup=await fetch(base+`${prefix}/receipts/http-pick`,{headers:{authorization:`Bearer ${seat.participantToken}`}});
    expect(lookup.status).toBe(200);expect(await lookup.json()).toEqual(accepted.receipt);
    now += 1000;
    const before = await request(prefix);
    await stop(); now += 60000; await start();
    let view = await request(prefix);
    expect(view.question!.remainingMs).toBe(before.question!.remainingMs);
    expect(view.version).toBeGreaterThan(before.version);
    now += view.question!.remainingMs;
    view = await request(prefix);
    expect(view.question!.status).toBe('locked');
    await request(`${prefix}/picks`, {...pick,requestId:'new-late-pick'}, 409);
    expect((await request(`${prefix}/picks`,pick)).receipt).toEqual(accepted.receipt);
    for (let i = 0; i < 100 && view.room.phase !== 'final'; i++) { now += 100000; view = await request(prefix); }
    expect(view.room.phase).toBe('final');
    expect([view.game.home.score, view.game.away.score]).toEqual([57, 56]);
    expect(view.standings[0].predictionPoints).toBeGreaterThan(0);
    expect(view.season.standings[0].nightsPlayed).toBe(1);
    const final = view;
    await stop(); await start(); view = await request(prefix);
    expect(view.season.standings).toEqual(final.season.standings);
    for (const snapshot of [created.view, open, before, final]) {
      const json = JSON.stringify(snapshot);
      expect(json).not.toContain(created.hostToken);
      expect(json).not.toContain(seat.participantToken);
      expect(json).not.toContain('appliedRevisions');
      expect(json).not.toContain('finalScore');
    }
  } finally { vi.restoreAllMocks(); await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
