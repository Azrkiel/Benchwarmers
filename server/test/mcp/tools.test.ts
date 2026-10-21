import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/game/store.js';
import { createServer } from '../../src/mcp/server.js';
import { BONUS_COPY } from '../../src/shared/types.js';

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

describe('phase 8 pick bonus lines', () => {
  const BANNED = /(bet|bets|betting|payout|wager|wagers)|odds boost/i;

  /** Maya alone calls Hawks (correct); Leo and Sam pick Foxes. Then fb-1 resolves. */
  async function loneCallScenario(): Promise<string> {
    const code = await setupParty();
    await call('start_watch_party', { code });
    advance(5);
    await call('make_pick', { code, memberName: 'Maya', choice: 'Hawks' });
    await call('make_pick', { code, memberName: 'Leo', choice: 'Foxes' });
    await call('make_pick', { code, memberName: 'Sam', choice: 'Foxes' });
    advance(60 / SPEED + 1);
    return code;
  }

  it('explain_last_result names the lone call and its points', async () => {
    const code = await loneCallScenario();
    const score = store.getState(code).standings.find((s) => s.memberId === 'maya')!.lastPickScore!;
    expect(score.bonuses).toContain('lone_call');
    const res = await call('explain_last_result', { code });
    const text = textOf(res);
    expect(text).toContain(`Maya's ${BONUS_COPY.lone_call.toLowerCase()} earned ${score.points} points.`);
    expect(res.structuredContent!.bonus).toMatchObject({ memberName: 'Maya', points: score.points });
    expect(text).not.toMatch(BANNED);
  });

  it('get_leaderboard and get_my_roster mention the bonus; others do not name it', async () => {
    const code = await loneCallScenario();
    const score = store.getState(code).standings.find((s) => s.memberId === 'maya')!.lastPickScore!;
    const board = textOf(await call('get_leaderboard', { code }));
    expect(board).toContain(`Maya's ${BONUS_COPY[score.bonuses[0]!].toLowerCase()} earned`);
    expect(board).not.toMatch(BANNED);
    const mine = textOf(await call('get_my_roster', { code, memberName: 'Maya' }));
    expect(mine).toContain(`Your last ${BONUS_COPY[score.bonuses[0]!].toLowerCase()} earned ${score.points} points.`);
    expect(mine).not.toMatch(BANNED);
    const leo = textOf(await call('get_my_roster', { code, memberName: 'Leo' }));
    expect(leo).not.toContain('Your last');
  });

  it('adds no bonus line when nobody earned a bonus', async () => {
    const code = await setupParty();
    await call('start_watch_party', { code });
    advance(60 / SPEED + 1);
    const text = textOf(await call('explain_last_result', { code }));
    expect(text).not.toContain('earned');
    expect(text).not.toMatch(BANNED);
    const sc = (await call('explain_last_result', { code })).structuredContent!;
    expect(sc.bonus).toBeUndefined();
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

describe('football party (phase 8) voice tools', () => {
  async function footballParty(): Promise<string> {
    const res = await call('setup_watch_party', { crewName: 'Sunday Crew', gameTitle: 'football' });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.game).toEqual({ id: 'riverton-vs-ironwood', title: 'Riverton Otters at Ironwood Forge' });
    return res.structuredContent!.code as string;
  }

  it('start speaks kickoff, not tip-off', async () => {
    const code = await footballParty();
    const res = await call('start_watch_party', { code });
    expect(res.isError).not.toBe(true);
    expect(textOf(res).startsWith('Kickoff!')).toBe(true);
    expect(textOf(res)).not.toContain('Tip-off');
  });

  it('get_game_status speaks the drive and the historical odds of the open drive question', async () => {
    const code = await footballParty();
    await call('start_watch_party', { code });
    advance(12.5); // 50 game seconds: drive 2 (Forge, own 30) is under way; its touchdown question is open
    const res = await call('get_game_status', { code });
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toBe(
      'Forge 0, Otters 7, Q1 8:45. Forge ball at their own 30, 1st quarter. Latest: Forge take over at their own 30. ' +
        'Open question: Will the Forge get a touchdown on this drive? Drives like this get a touchdown 26% of the time. Locks in about 7 seconds.',
    );
    expect(res.structuredContent!.drive).toEqual({ team: 'home', yardline100: 70, quarter: 1 });
    expect(res.structuredContent!.activeProp.odds).toEqual({ percentYes: 26, outcome: 'td', sampleSize: 9782 });
  });

  it('get_game_status names the opponent side when the ball is past midfield for the other team', async () => {
    const code = await footballParty();
    await call('start_watch_party', { code });
    advance(37.5); // game second 150: Forge take over at the Otters' 41 (Q2); the touchdown question for it is open
    const res = await call('get_game_status', { code });
    expect(textOf(res)).toContain("Forge ball at the Otters' 41, 2nd quarter.");
    expect(textOf(res)).toContain('Drives like this get a touchdown 33% of the time.');
    expect(res.structuredContent!.drive).toEqual({ team: 'home', yardline100: 41, quarter: 2 });
  });

  it('make_pick takes the drive words: "they get stopped" is No, "they score" is Yes', async () => {
    const code = await footballParty();
    await call('start_watch_party', { code });
    advance(5); // game second 20: the first drive question (ff-1) is open
    const yes = await call('make_pick', { code, memberName: 'Maya', choice: 'they score' });
    expect(yes.isError).not.toBe(true);
    expect(textOf(yes)).toBe('Got it, Maya: Yes. Locks in about 3 seconds.');
    const no = await call('make_pick', { code, memberName: 'Leo', choice: 'they get stopped' });
    expect(textOf(no)).toBe('Got it, Leo: No. Locks in about 3 seconds.');
    const noScore = await call('make_pick', { code, memberName: 'Sam', choice: 'no score' });
    expect(textOf(noScore)).toBe('Got it, Sam: No. Locks in about 3 seconds.');
  });

  it('list_available_players filters by football position and names football positions when it misses', async () => {
    const code = await footballParty();
    const qbs = await call('list_available_players', { code, position: 'quarterback' });
    expect(qbs.isError).not.toBe(true);
    const players = qbs.structuredContent!.players as { position: string }[];
    expect(players.length).toBe(2);
    expect(players.every((p) => p.position === 'QB')).toBe(true);
    expect(textOf(qbs)).toContain('quarterback');

    const miss = await call('list_available_players', { code, position: 'goalie' });
    expect(miss.isError).toBe(true);
    expect(textOf(miss)).toBe("I don't know the position goalie. Try quarterback, running back, wide receiver, tight end or kicker.");
  });
});
