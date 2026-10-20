import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';

// Checkpoint 2: a full draft + first pick'em question over real HTTP, every call under the 500 ms voice budget.

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, any>;
};

const TOKEN = 'checkpoint-token';
const T0 = 5_000_000;
const SPEED = 4;

let dir: string;
let t: number;
let savedToken: string | undefined;
let httpServer: http.Server;
let client: Client;
let transport: StreamableHTTPClientTransport;
const timings: { name: string; ms: number }[] = [];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcp-checkpoint-'));
  t = T0;
  const store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => t, speed: SPEED });
  savedToken = process.env.MCP_TOKEN;
  process.env.MCP_TOKEN = TOKEN;
  const app = createApp({ store });
  if (savedToken === undefined) delete process.env.MCP_TOKEN;
  else process.env.MCP_TOKEN = savedToken;

  httpServer = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  client = new Client({ name: 'checkpoint-test', version: '1.0.0' });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Call a tool over HTTP, record the round trip and assert it stays under 500 ms. */
async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const start = performance.now();
  const res = (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
  const ms = performance.now() - start;
  timings.push({ name, ms });
  expect(ms, `${name} took ${ms.toFixed(1)} ms`).toBeLessThan(500);
  return res;
}

const textOf = (res: ToolResult) => res.content.map((c) => c.text ?? '').join(' ');
const advance = (realSeconds: number) => {
  t += realSeconds * 1000;
};

describe('Checkpoint 2: draft and first pick over HTTP', () => {
  let code: string;

  it('negotiates the 2025-11-25 protocol version and lists 11 tools', async () => {
    expect(transport.protocolVersion).toBe('2025-11-25');
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(11);
  });

  it('sets up the Sunday Crew party', async () => {
    const res = await call('setup_watch_party', { crewName: 'Sunday Crew' });
    expect(res.isError).not.toBe(true);
    code = res.structuredContent!.code as string;
    expect(code).toMatch(/^[A-Z]{4}$/);
  });

  it('drafts three players each by voice-style names', async () => {
    for (const player of ['Big Mo', 'Splash', 'Tower']) {
      const res = await call('draft_player', { memberName: 'Maya', player });
      expect(res.isError, textOf(res)).not.toBe(true);
      expect(res.structuredContent!.view).toBe('draft');
      expect(res.structuredContent!.code).toBe(code);
    }

    // Sam goes for a player Maya already has: friendly error with exactly 2 alternatives.
    const conflict = await call('draft_player', { memberName: 'Sam', player: 'Big Mo' });
    expect(conflict.isError).toBe(true);
    const alts = conflict.structuredContent!.alternatives as { id: string; name: string; nickname?: string }[];
    expect(alts).toHaveLength(2);
    for (const a of alts) expect(textOf(conflict)).toContain(a.nickname ?? a.name);
    expect(textOf(conflict)).toContain("Maya's");

    for (const player of ["Harbor's point guard", 'number 10', 'Quick Kai']) {
      const res = await call('draft_player', { memberName: 'Sam', player });
      expect(res.isError, textOf(res)).not.toBe(true);
    }
    const roster = await call('get_my_roster', { memberName: 'Sam' });
    expect(roster.structuredContent!.players).toHaveLength(3);
  });

  it('starts the party and takes picks on the open question', async () => {
    const start = await call('start_watch_party', {});
    expect(start.isError).not.toBe(true);
    expect(start.structuredContent!.activeProp.id).toBe('fb-1');

    const sam = await call('make_pick', { memberName: 'Sam', choice: 'Hawks' });
    expect(sam.isError, textOf(sam)).not.toBe(true);
    expect(sam.structuredContent!.pick).toMatchObject({ propId: 'fb-1', optionId: 'home' });
    const maya = await call('make_pick', { memberName: 'Maya', choice: 'Foxes' });
    expect(maya.isError, textOf(maya)).not.toBe(true);
    expect(maya.structuredContent!.pick).toMatchObject({ propId: 'fb-1', optionId: 'away' });
  });

  it('settles fb-1 and the leaderboard splits draft and pick points', async () => {
    advance(16); // game 64 s, past fb-1 resolvesAt (60)
    const explain = await call('explain_last_result', {});
    expect(explain.structuredContent!.prop.id).toBe('fb-1');
    const correct = explain.structuredContent!.correctOption as { id: string } | null;
    expect(correct).not.toBeNull();
    const winner = correct!.id === 'home' ? 'Sam' : 'Maya';

    const res = await call('get_leaderboard', {});
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('tonight');
    expect(sc.code).toBe(code);
    const rows = sc.standings as { name: string; draftPoints: number; pickPoints: number; total: number }[];
    const sam = rows.find((r) => r.name === 'Sam')!;
    const maya = rows.find((r) => r.name === 'Maya')!;
    expect(sam).toBeDefined();
    expect(maya).toBeDefined();
    for (const r of rows) expect(r.total).toBeCloseTo(r.draftPoints + r.pickPoints, 6);
    expect([sam, maya].filter((r) => r.pickPoints > 0)).toHaveLength(1);
    expect(rows.find((r) => r.name === winner)!.pickPoints).toBeGreaterThan(0);
    expect(textOf(res)).toMatch(/leads with/);
  });

  it('kept every call under the 500 ms budget', () => {
    expect(timings.length).toBeGreaterThanOrEqual(14);
    const worst = timings.reduce((a, b) => (b.ms > a.ms ? b : a));
    expect(worst.ms, `slowest: ${worst.name}`).toBeLessThan(500);
  });
});
