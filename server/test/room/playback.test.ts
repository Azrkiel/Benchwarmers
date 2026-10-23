import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlaybackRouter, LEASE_MS, PlaybackLeases } from '../../src/room/playback.js';

describe('playback leases', () => {
  it('gives a free lease to the first screen, lets it renew, and refuses a second screen', () => {
    let now = 1000;
    const leases = new PlaybackLeases(() => now);
    expect(leases.claim('ROOM', 'screen-a-0001', 'Living room')).toMatchObject({ granted: true });
    expect(leases.claim('ROOM', 'screen-b-0002', 'Kitchen')).toMatchObject({ granted: false, reason: 'HELD', lease: { label: 'Living room' } });
    now += LEASE_MS - 1;
    expect(leases.claim('ROOM', 'screen-a-0001', 'Living room').lease!.expiresAt).toBe(now + LEASE_MS);
  });

  it('expires so a second screen can take over, and a host can take over explicitly', () => {
    let now = 1000;
    const leases = new PlaybackLeases(() => now);
    leases.claim('ROOM', 'screen-a-0001', 'A');
    now += LEASE_MS;
    expect(leases.current('ROOM')).toBeNull();
    expect(leases.claim('ROOM', 'screen-b-0002', 'B').granted).toBe(true);
    expect(leases.claim('ROOM', 'screen-a-0001', 'A', { force: true }).granted).toBe(false);
    expect(leases.claim('ROOM', 'screen-a-0001', 'A', { force: true, host: true }).granted).toBe(true);
    leases.release('ROOM', 'screen-b-0002');
    expect(leases.current('ROOM')?.deviceId).toBe('screen-a-0001');
    leases.release('ROOM', 'screen-a-0001');
    expect(leases.current('ROOM')).toBeNull();
  });
});

describe('playback router', () => {
  let server: http.Server | undefined;
  afterEach(async () => { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; });
  async function start() {
    const app = express();
    app.use('/api/rooms/:code/playback', createPlaybackRouter(new PlaybackLeases(), (_code, token) => token === 'host-secret'));
    server = await new Promise<http.Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms/abcd/playback`;
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { base, post };
  }

  it('claims, reports 409 when held, honors host takeover and never echoes device ids', async () => {
    const { base, post } = await start();
    expect((await post('/claim', { deviceId: 'screen-a-0001', label: 'Living room' })).status).toBe(200);
    const held = await post('/claim', { deviceId: 'screen-b-0002', label: 'Kitchen' });
    expect(held.status).toBe(409);
    expect(await held.json()).toMatchObject({ code: 'PLAYBACK_HELD', lease: { label: 'Living room' } });
    expect((await post('/claim', { deviceId: 'screen-b-0002', force: true, hostToken: 'wrong' })).status).toBe(409);
    expect((await post('/claim', { deviceId: 'screen-b-0002', label: 'Kitchen', force: true, hostToken: 'host-secret' })).status).toBe(200);
    const current = await (await fetch(base)).json();
    expect(current).toMatchObject({ lease: { label: 'Kitchen' } });
    expect(JSON.stringify(current)).not.toContain('screen-b');
    expect((await post('/claim', { deviceId: 'x' })).status).toBe(400);
  });
});
