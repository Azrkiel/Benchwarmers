import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import { RoomStore } from '../../src/room/store.js';
import { ROOM_BOARD_URI } from '../../src/room/mcp.js';
import { renderRoomBoard, roomViewOf } from '../../src/mcp/widget/src/roomBoard.ts';

describe('room board render', () => {
  const store = new RoomStore({ persist: false });
  const created = store.create({ name: '<b>Friday</b>' });
  const code = created.view.room.code;
  const seat = store.join(code, { name: 'Maya <script>' });

  it('keeps only public room state and ignores household results', () => {
    const view = roomViewOf({ ...store.view(code, seat.participantToken) } as Record<string, unknown>)!;
    expect(view.room.code).toBe(code);
    expect((view as { me?: unknown }).me).toBeUndefined();
    expect(roomViewOf({ view: store.view(code), reply: 'x' } as Record<string, unknown>)?.room.code).toBe(code);
    expect(roomViewOf({ view: 'tonight', code: 'DEMO', state: {} })).toBeUndefined();
  });

  it('escapes names, shows no possession marker when unknown and lists standings', () => {
    const html = renderRoomBoard(roomViewOf(store.view(code) as unknown as Record<string, unknown>)!);
    expect(html).toContain('&lt;b&gt;Friday&lt;/b&gt;');
    expect(html).toContain('Maya &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('has the ball');
    expect(html).toContain(`Join with code ${code}`);
    expect(html).not.toContain(seat.participantToken);
  });
});

describe('room board over MCP', () => {
  let server: http.Server | undefined; let client: Client | undefined;
  afterEach(async () => { await client?.close(); server?.closeAllConnections(); if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); });
  it('links room_status and room_ask to the room board resource', async () => {
    const app = createApp({ store: new Store({ persist: false }), roomStore: new RoomStore({ persist: false }) });
    server = await new Promise<http.Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    client = new Client({ name: 'room-board-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${process.env.MCP_TOKEN ?? 'dev-token-change-me'}` } } }));
    const tools = (await client.listTools()).tools;
    for (const name of ['room_status', 'room_ask']) expect(tools.find((t) => t.name === name)?._meta).toMatchObject({ ui: { resourceUri: ROOM_BOARD_URI } });
    expect(tools.find((t) => t.name === 'get_leaderboard')?._meta).not.toMatchObject({ ui: { resourceUri: ROOM_BOARD_URI } });
    const resource = await client.readResource({ uri: ROOM_BOARD_URI });
    expect(resource.contents[0]).toMatchObject({ uri: ROOM_BOARD_URI, mimeType: 'text/html;profile=mcp-app' });
  });
});
