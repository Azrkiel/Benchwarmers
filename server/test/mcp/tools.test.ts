import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/game/store.js';
import { createServer } from '../../src/mcp/server.js';

// Tool behaviour is exercised over an in-process transport: the HTTP path is covered by http.test.ts.

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, any>;
};

let dir: string;
let t: number;
let store: Store;
let server: McpServer;
let client: Client;

const T0 = 1_000_000;
const SPEED = 4;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcp-tools-'));
  t = T0;
  store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => t, speed: SPEED });
  server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'tools-test', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Call a tool and assert the round trip stays under the 500 ms voice budget. */
async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const start = performance.now();
  const res = (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
  const ms = performance.now() - start;
  expect(ms, `${name} took ${ms.toFixed(1)} ms`).toBeLessThan(500);
  return res;
}

const textOf = (res: ToolResult) => res.content.map((c) => c.text ?? '').join(' ');

/** Advance the fake clock by real seconds. */
const advance = (realSeconds: number) => {
  t += realSeconds * 1000;
};

async function setupParty(): Promise<string> {
  const res = await call('setup_watch_party', { crewName: 'the Seattle crew' });
  expect(res.isError).not.toBe(true);
  return res.structuredContent!.code as string;
}

describe('setup_watch_party', () => {
  it('creates a party for the Seattle crew and invites both households', async () => {
    const res = await call('setup_watch_party', { crewName: 'the Seattle crew' });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.code).toMatch(/^[A-Z]{4}$/);
    const ids = (sc.households as { id: string }[]).map((h) => h.id).sort();
    expect(ids).toEqual(['garcias', 'sams-place']);
    expect(textOf(res)).toContain(sc.code);
    expect(sc.firstProp?.question).toBe('Who scores first?');
    expect(sc.game).toEqual({ id: 'harbor-vs-summit', title: 'Harbor Hawks vs. Summit Foxes' });
    expect(store.getParty(sc.code)?.status).toBe('drafting');
  });

  it('passes gameTitle and when through', async () => {
    const res = await call('setup_watch_party', { crewName: 'Sunday Crew', gameTitle: 'Harbor Hawks vs. Summit Foxes', when: 'Sunday night' });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.when).toBe('Sunday night');
    expect(textOf(res)).toContain('Sunday night');
  });

  it('returns a friendly error for an unknown crew', async () => {
    const res = await call('setup_watch_party', { crewName: 'the Denver crew' });
    expect(res.isError).toBe(true);
    const text = textOf(res);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/undefined|TypeError|Error:/);
    expect(res.structuredContent?.code).toBeUndefined();
    expect(res.structuredContent?.errorCode).toBe('NOT_FOUND');
  });
});

describe('join_watch_party', () => {
  it('adds a household to the party and reports the count', async () => {
    const code = await setupParty();
    const res = await call('join_watch_party', { code, householdName: 'the Garcias' });
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toContain(`households are in party ${code}`);
    expect(res.structuredContent!.householdIds).toEqual(expect.arrayContaining(['garcias']));
    expect(res.structuredContent!.code).toBe(code);
  });

  it('is an error for an unknown household', async () => {
    const code = await setupParty();
    const res = await call('join_watch_party', { code, householdName: "Bob's place" });
    expect(res.isError).toBe(true);
    expect(textOf(res).length).toBeGreaterThan(5);
  });

  it('is an error for an unknown party code', async () => {
    const res = await call('join_watch_party', { code: 'ZZZZ', householdName: 'the Garcias' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('ZZZZ');
  });
});

describe('get_game_status', () => {
  it('says the party is still drafting before start', async () => {
    const code = await setupParty();
    const res = await call('get_game_status', { code });
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toContain("We're still drafting");
    expect(res.structuredContent!.status).toBe('drafting');
    expect(res.structuredContent!.score.home.score).toBe(0);
  });

  it('reports score, clock and the open question once live', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    advance(5); // 20 game seconds: the first question is still open
    const res = await call('get_game_status', { code });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.status).toBe('live');
    expect(textOf(res)).toContain('Open question: Who scores first?');
    expect(res.structuredContent!.activeProp.secondsToLock).toBeGreaterThan(0);
    expect(Array.isArray(res.structuredContent!.lastPlays)).toBe(true);
  });

  it('reports the final score once the game is over', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    advance(480 / SPEED + 5);
    const res = await call('get_game_status', { code });
    expect(res.structuredContent!.status).toBe('final');
    expect(textOf(res).startsWith('Final:')).toBe(true);
  });
});

describe('start_watch_party', () => {
  it('auto-fills empty roster slots and returns the first question', async () => {
    const code = await setupParty();
    const res = await call('start_watch_party', { code });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.status).toBe('live');
    expect(sc.autoFilled).toHaveLength(12);
    expect(sc.autoFilled.map((a: { memberName: string }) => a.memberName).sort()).toEqual(
      ['Leo', 'Leo', 'Leo', 'Maya', 'Maya', 'Maya', 'Priya', 'Priya', 'Priya', 'Sam', 'Sam', 'Sam'].sort(),
    );
    expect(sc.activeProp.question).toBe('Who scores first?');
    expect(textOf(res)).toContain('Tip-off');
    expect(textOf(res)).toContain('Who scores first?');
  });

  it('is an error when the game is already underway', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    const again = await call('start_watch_party', { code });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain('already underway');
  });
});

describe('get_my_roster', () => {
  it("lists Maya's auto-filled players with points and rank", async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    const res = await call('get_my_roster', { code, memberName: 'maya' });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.member).toMatchObject({ id: 'maya', name: 'Maya', household: "The Garcias" });
    expect(sc.players).toHaveLength(3);
    expect(sc.players[0]).toHaveProperty('points');
    expect(sc.rank).toBeGreaterThanOrEqual(1);
    expect(textOf(res)).toContain('Maya, you have');
  });

  it('suggests names when the member is unknown', async () => {
    const code = await setupParty();
    const res = await call('get_my_roster', { code, memberName: 'Bob' });
    expect(res.isError).toBe(true);
    const text = textOf(res) + JSON.stringify(res.structuredContent ?? {});
    expect(text).toContain('Maya');
  });

  it('uses the crew default party when code is omitted', async () => {
    await setupParty();
    const res = await call('get_my_roster', { memberName: 'Sam' });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.member.name).toBe('Sam');
    expect(res.structuredContent!.players).toEqual([]);
    expect(textOf(res)).toContain("You haven't drafted anyone yet.");
  });
});

describe('explain_last_result', () => {
  it('says nothing is settled before any question resolves', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    const res = await call('explain_last_result', { code });
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toBe('No question has been settled yet.');
  });

  it('names the correct answer after the first question resolves', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    // fb-1 resolves at game second 60 = 15 real seconds at speed 4. Add a margin.
    advance(60 / SPEED + 1);
    const res = await call('explain_last_result', { code });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.prop.question).toBe('Who scores first?');
    // First team score in game seconds 40..60 is Jet Reyes for the Hawks (home).
    expect(res.structuredContent!.correctOption).toEqual({ id: 'home', label: 'Hawks' });
    expect(textOf(res)).toContain('The answer was Hawks.');
    expect(res.structuredContent!.winners).toEqual([]);
  });
});

describe('default party code', () => {
  it('uses the newest party for the Sunday Crew when code is omitted', async () => {
    const code = await setupParty();
    const status = await call('get_game_status');
    expect(status.isError).not.toBe(true);
    expect(status.structuredContent!.code).toBe(code);
    const started = await call('start_watch_party');
    expect(started.isError).not.toBe(true);
    expect(started.structuredContent!.code).toBe(code);
    expect(store.getParty(code)?.status).toBe('live');
  });

  it('falls back to the seeded DEMO party when code is omitted', async () => {
    const res = await call('get_game_status');
    // The seed creates the DEMO party for the Sunday Crew, so a default party always exists.
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.code).toBe('DEMO');
  });
});
