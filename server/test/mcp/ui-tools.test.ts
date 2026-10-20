import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/game/store.js';
import { BOARD_URI, createServer } from '../../src/mcp/server.js';

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, any>;
};

const UI_TOOLS = ['list_available_players', 'draft_player', 'make_pick', 'get_leaderboard', 'get_season_standings'];
const PLAIN_TOOLS = ['setup_watch_party', 'join_watch_party', 'get_my_roster', 'start_watch_party', 'get_game_status', 'explain_last_result'];

let dir: string;
let t: number;
let store: Store;
let server: McpServer;
let client: Client;

const T0 = 1_000_000;
const SPEED = 4;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcp-ui-'));
  t = T0;
  store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => t, speed: SPEED });
  server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'ui-tools-test', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const start = performance.now();
  const res = (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
  const ms = performance.now() - start;
  expect(ms, `${name} took ${ms.toFixed(1)} ms`).toBeLessThan(500);
  return res;
}

const textOf = (res: ToolResult) => res.content.map((c) => c.text ?? '').join(' ');
const advance = (realSeconds: number) => {
  t += realSeconds * 1000;
};

async function setupParty(): Promise<string> {
  const res = await call('setup_watch_party', { crewName: 'Sunday Crew' });
  expect(res.isError).not.toBe(true);
  return res.structuredContent!.code as string;
}

async function draft(code: string, memberName: string, player: string): Promise<ToolResult> {
  return call('draft_player', { code, memberName, player });
}

/** Party started with fb-1 open (game time 0). */
async function startedParty(): Promise<string> {
  const code = await setupParty();
  const res = await call('start_watch_party', { code });
  expect(res.isError).not.toBe(true);
  return code;
}

describe('tools/list', () => {
  it('lists exactly the 11 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([...UI_TOOLS, ...PLAIN_TOOLS].sort());
  });

  it('links the 5 UI tools to the board and the others to nothing', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const meta = (tool._meta ?? {}) as { ui?: { resourceUri?: string } };
      if (UI_TOOLS.includes(tool.name)) expect(meta.ui?.resourceUri, tool.name).toBe(BOARD_URI);
      else expect(meta.ui?.resourceUri, tool.name).toBeUndefined();
    }
  });

  it('describes draft_player with fuzzy matching and example utterances', async () => {
    const { tools } = await client.listTools();
    const d = tools.find((x) => x.name === 'draft_player')!.description!;
    expect(d).toMatch(/fuzzy/i);
    expect(d).toContain('Big Mo');
    expect(d).toContain('number 7');
    expect(d).toContain("Harbor's point guard");
  });
});

describe('list_available_players', () => {
  it('returns the draft view with the full state and players sorted by projection', async () => {
    const code = await setupParty();
    const res = await call('list_available_players', { code });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('draft');
    expect(sc.code).toBe(code);
    expect(sc.state.party.code).toBe(code);
    expect(sc.players).toHaveLength(16);
    expect(sc.players[0]).toMatchObject({ id: 'har-c-34', name: 'Moses Adeyemi', nickname: 'Big Mo', number: 34, position: 'C', team: 'HAR' });
    const projections = sc.players.map((p: { projection: number }) => p.projection);
    expect([...projections].sort((a, b) => b - a)).toEqual(projections);
    const text = textOf(res);
    expect(text.startsWith('Top available: Big Mo, Harbor center.')).toBe(true);
    expect(text).not.toMatch(/\*|#|har-c-34/);
  });

  it('defaults to the crew current party', async () => {
    const code = await setupParty();
    const res = await call('list_available_players', {});
    expect(res.structuredContent!.code).toBe(code);
  });

  it('filters by team', async () => {
    await setupParty();
    for (const team of ['Foxes', 'SUM', 'Summit']) {
      const res = await call('list_available_players', { team });
      expect(res.isError, team).not.toBe(true);
      expect(res.structuredContent!.players).toHaveLength(8);
      expect(res.structuredContent!.players.every((p: { team: string }) => p.team === 'SUM')).toBe(true);
    }
    const harbor = await call('list_available_players', { team: 'Harbor' });
    expect(harbor.structuredContent!.players).toHaveLength(8);
    expect(harbor.structuredContent!.players.every((p: { team: string }) => p.team === 'HAR')).toBe(true);
  });

  it('filters by position', async () => {
    await setupParty();
    for (const position of ['C', 'center', 'centers']) {
      const res = await call('list_available_players', { position });
      expect(res.isError, position).not.toBe(true);
      expect(res.structuredContent!.players.map((p: { id: string }) => p.id)).toEqual(['har-c-34', 'sum-c-50', 'har-c-44']);
    }
    const pg = await call('list_available_players', { position: 'point guard', team: 'Harbor' });
    expect(pg.structuredContent!.players.map((p: { id: string }) => p.id)).toEqual(['har-pg-1', 'har-pg-5']);
  });

  it('leaves out drafted players and says so when none match', async () => {
    const code = await setupParty();
    await draft(code, 'Maya', 'Big Mo');
    const res = await call('list_available_players', { code });
    expect(res.structuredContent!.players).toHaveLength(15);
    expect(res.structuredContent!.players.some((p: { id: string }) => p.id === 'har-c-34')).toBe(false);
    expect(res.structuredContent!.state.draftBoard.find((e: any) => e.player.id === 'har-c-34').ownerName).toBe('Maya');
    for (const p of ['Tower', 'The Wall']) await draft(code, 'Sam', p);
    const none = await call('list_available_players', { code, position: 'center' });
    expect(none.isError).not.toBe(true);
    expect(none.structuredContent!.players).toEqual([]);
    expect(textOf(none)).toMatch(/no one|nobody|left/i);
  });

  it('is an error for an unknown team or position', async () => {
    await setupParty();
    const a = await call('list_available_players', { team: 'the Lakers' });
    expect(a.isError).toBe(true);
    const b = await call('list_available_players', { position: 'goalie' });
    expect(b.isError).toBe(true);
  });
});

describe('draft_player', () => {
  it('drafts by nickname and reports progress', async () => {
    const code = await setupParty();
    const res = await draft(code, 'Maya', 'Big Mo');
    expect(res.isError).not.toBe(true);
    expect(textOf(res)).toBe("Maya drafted Big Mo, Harbor's center. That's 1 of 3.");
    const sc = res.structuredContent!;
    expect(sc.view).toBe('draft');
    expect(sc.code).toBe(code);
    expect(sc.drafted).toEqual({ memberId: 'maya', memberName: 'Maya', playerId: 'har-c-34', playerName: 'Big Mo', round: 1 });
    expect(sc.state.draftBoard.find((e: any) => e.player.id === 'har-c-34').ownerMemberId).toBe('maya');
  });

  it('drafts by jersey number', async () => {
    const code = await setupParty();
    const res = await draft(code, 'Sam', 'number 7');
    expect(res.structuredContent!.drafted.playerId).toBe('har-sg-7');
    expect(textOf(res)).toContain('Splash');
  });

  it("drafts by position and team (Harbor's point guard)", async () => {
    const code = await setupParty();
    const res = await draft(code, 'Sam', "Harbor's point guard");
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.drafted.playerId).toBe('har-pg-1');
    expect(textOf(res)).toContain("Harbor's point guard");
  });

  it('says the roster is full on the third pick, then errors on a fourth', async () => {
    const code = await setupParty();
    await draft(code, 'Maya', 'Big Mo');
    await draft(code, 'Maya', 'Splash');
    const third = await draft(code, 'Maya', 'Tower');
    expect(textOf(third)).toContain("Maya's roster is full.");
    expect(third.structuredContent!.drafted.round).toBe(3);
    const fourth = await draft(code, 'Maya', 'Rafa');
    expect(fourth.isError).toBe(true);
    expect(textOf(fourth)).toMatch(/three players/i);
  });

  it('returns an error with exactly 2 alternatives when the player is taken', async () => {
    const code = await setupParty();
    await draft(code, 'Maya', 'Big Mo');
    const res = await draft(code, 'Sam', 'Big Mo');
    expect(res.isError).toBe(true);
    expect(res.structuredContent!.errorCode).toBe('PLAYER_TAKEN');
    const alts = res.structuredContent!.alternatives as { id: string; name: string; nickname?: string }[];
    expect(alts).toHaveLength(2);
    expect(textOf(res)).toContain("Maya's");
    for (const a of alts) expect(textOf(res)).toContain(a.nickname ?? a.name);
  });

  it('is an error for an unknown member or player', async () => {
    const code = await setupParty();
    const a = await draft(code, 'Zelda', 'Big Mo');
    expect(a.isError).toBe(true);
    const b = await draft(code, 'Maya', 'Michael Jordan');
    expect(b.isError).toBe(true);
    expect(textOf(b)).toMatch(/couldn't find a player/i);
  });

  it('is an error once the game has started', async () => {
    const code = await startedParty();
    const res = await draft(code, 'Maya', 'Big Mo');
    expect(res.isError).toBe(true);
  });
});

describe('make_pick', () => {
  it('matches "Hawks" on fb-1 and returns the tonight view', async () => {
    const code = await startedParty();
    const res = await call('make_pick', { code, memberName: 'Sam', choice: 'Hawks' });
    expect(res.isError, textOf(res)).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('tonight');
    expect(sc.code).toBe(code);
    expect(sc.state.party.code).toBe(code);
    expect(sc.pick).toEqual({ memberId: 'sam', memberName: 'Sam', propId: 'fb-1', optionId: 'home', label: 'Hawks' });
    expect(textOf(res)).toMatch(/^Got it, Sam: Hawks\. Locks in about \d+ seconds\.$/);
    expect(sc.state.picks.find((p: any) => p.memberId === 'sam').optionId).toBe('home');
  });

  it('matches "the over" on the totalPointsOver prop once fb-3 is open', async () => {
    const code = await startedParty();
    advance(32); // game 128 s: fb-3 open (120-160)
    const res = await call('make_pick', { code, memberName: 'Maya', choice: 'the over' });
    expect(res.isError, textOf(res)).not.toBe(true);
    expect(res.structuredContent!.pick).toMatchObject({ propId: 'fb-3', optionId: 'over' });
  });

  it('records source: voice by default and screen when passed', async () => {
    const code = await startedParty();
    await call('make_pick', { code, memberName: 'Sam', choice: 'Hawks' });
    const res = await call('make_pick', { code, memberName: 'Maya', choice: 'Foxes', source: 'screen', propId: 'fb-1' });
    expect(res.isError, textOf(res)).not.toBe(true);
    const picks = res.structuredContent!.state.picks as { memberId: string; source: string }[];
    expect(picks.find((p) => p.memberId === 'sam')!.source).toBe('voice');
    expect(picks.find((p) => p.memberId === 'maya')!.source).toBe('screen');
  });

  it('is an error listing the options when the choice does not match', async () => {
    const code = await startedParty();
    const res = await call('make_pick', { code, memberName: 'Sam', choice: 'banana' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Hawks');
    expect(textOf(res)).toContain('Foxes');
    expect(res.structuredContent!.options).toEqual(expect.arrayContaining(['Hawks', 'Foxes']));
  });

  it('is a friendly "Picks are locked" error when no question is open', async () => {
    const code = await startedParty();
    advance(12); // game 48 s: between fb-1 locking (40) and fb-2 opening (60)
    const res = await call('make_pick', { code, memberName: 'Sam', choice: 'Hawks' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/^Picks are locked\. The next question opens in about \d+ seconds\.$/);
    expect(res.structuredContent!.errorCode).toBe('PICKS_LOCKED');
  });

  it('is an error for an unknown propId', async () => {
    const code = await startedParty();
    const res = await call('make_pick', { code, memberName: 'Sam', choice: 'Hawks', propId: 'nope' });
    expect(res.isError).toBe(true);
  });
});

describe('get_leaderboard', () => {
  it('returns the tonight view with a standings row per member', async () => {
    const code = await startedParty();
    const res = await call('get_leaderboard', { code });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('tonight');
    expect(sc.state.party.code).toBe(code);
    expect(sc.standings).toHaveLength(4);
    for (const row of sc.standings) {
      expect(row.total).toBe(row.draftPoints + row.pickPoints);
      expect(Object.keys(row).sort()).toEqual(['draftPoints', 'household', 'name', 'pickPoints', 'rank', 'streak', 'total']);
    }
  });

  it('speaks the top three without pronouns once points exist', async () => {
    const code = await setupParty();
    await draft(code, 'Maya', 'Big Mo');
    await draft(code, 'Sam', 'Quick Kai');
    await call('start_watch_party', { code });
    advance(60); // game 240 s
    const res = await call('get_leaderboard', { code });
    const text = textOf(res);
    expect(text).toMatch(/leads with [\d.]+ points?: [\d.]+ draft, [\d.]+ from picks\./);
    expect(text).toMatch(/is second with [\d.]+\./);
    expect(text).not.toMatch(/\b(her|his|their)\b/);
  });
});

describe('get_season_standings', () => {
  it('returns the season view for the default crew', async () => {
    const res = await call('get_season_standings', {});
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('season');
    expect(sc.state).toBeUndefined();
    expect(sc.season.crew.id).toBe('sunday-crew');
    expect(sc.season.rows).toHaveLength(4);
    expect(sc.member).toBeUndefined();
    expect(textOf(res)).toMatch(/leads the season with [\d.]+ points?\./);
  });

  it('reports one member', async () => {
    const res = await call('get_season_standings', { memberName: 'Maya' });
    expect(res.isError, textOf(res)).not.toBe(true);
    const sc = res.structuredContent!;
    expect(sc.view).toBe('season');
    const row = sc.season.rows.find((r: any) => r.memberId === 'maya');
    expect(sc.member).toMatchObject({ memberId: 'maya', name: 'Maya', rank: row.rank, points: Math.round((row.points + row.fantasyPoints) * 10) / 10 });
    expect(textOf(res)).toMatch(
      new RegExp(`^Maya, you're ${row.rank}(st|nd|rd|th) this season with ${Math.round((row.points + row.fantasyPoints) * 10) / 10} points?\\. Best streak ${row.bestStreak}, ${row.nightsWon} nights? won\\.$`),
    );
  });

  it('accepts a crew by city ("the Seattle crew")', async () => {
    const res = await call('get_season_standings', { crewName: 'the Seattle crew', memberName: 'Sam' });
    expect(res.isError, textOf(res)).not.toBe(true);
    expect(res.structuredContent!.season.crew.id).toBe('sunday-crew');
    expect(res.structuredContent!.member.name).toBe('Sam');
  });

  it('is an error for an unknown crew or member', async () => {
    expect((await call('get_season_standings', { crewName: 'the Denver crew' })).isError).toBe(true);
    expect((await call('get_season_standings', { memberName: 'Zelda' })).isError).toBe(true);
  });
});
