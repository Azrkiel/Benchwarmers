import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpClient, type AssistantMcp, type ToolInfo, type ToolResult } from '../../src/assistant/mcpClient.js';
import { parseUtterance, runOffline } from '../../src/assistant/offlineRouter.js';
import type { AssistantRequest, AssistantResponse } from '../../src/shared/types.js';
import { BOARD_URI } from '../../src/mcp/server.js';
import { startTestServer, type TestServer } from './helpers.js';

const MAYA = { memberName: 'Maya', confidence: 0.9, source: 'voice-id' as const };

function req(text: string, extra: Partial<AssistantRequest> = {}): AssistantRequest {
  return { text, household: 'garcias', ...extra };
}

function tool(name: string, args: Record<string, unknown>) {
  return { kind: 'tool', tool: name, args };
}

describe('parseUtterance', () => {
  const cases: { name: string; text: string; speaker?: typeof MAYA; tool: string; args: Record<string, unknown>; code?: boolean }[] = [
    { name: 'setup', text: "set up a watch party for tonight's game with the Sunday Crew", tool: 'setup_watch_party', args: { crewName: 'Sunday Crew', when: 'tonight' } },
    { name: 'setup default crew', text: 'set up a watch party', tool: 'setup_watch_party', args: { crewName: 'Sunday Crew' } },
    { name: 'setup other crew', text: 'Set up a watch party with the Seattle Crew tomorrow', tool: 'setup_watch_party', args: { crewName: 'Seattle Crew', when: 'tomorrow' } },
    { name: 'setup weekday', text: 'set up a watch party for Sunday night with the Sunday Crew', tool: 'setup_watch_party', args: { crewName: 'Sunday Crew', when: 'Sunday night' } },
    { name: 'available center', text: "who's available at center?", tool: 'list_available_players', args: { position: 'C' }, code: true },
    { name: 'available point guard', text: 'Who is available at point guard', tool: 'list_available_players', args: { position: 'PG' }, code: true },
    { name: 'available team', text: "who's available on the Hawks?", tool: 'list_available_players', args: { team: 'Hawks' }, code: true },
    { name: 'available team+pos', text: "who's available from Summit at power forward", tool: 'list_available_players', args: { position: 'PF', team: 'Summit' }, code: true },
    { name: 'available none', text: "who's available?", tool: 'list_available_players', args: {}, code: true },
    { name: 'draft explicit', text: "I'm Maya, draft Big Mo", tool: 'draft_player', args: { memberName: 'Maya', player: 'Big Mo' }, code: true },
    { name: 'draft speaker', text: 'draft Big Mo', speaker: MAYA, tool: 'draft_player', args: { memberName: 'Maya', player: 'Big Mo' }, code: true },
    { name: 'draft for', text: 'draft number 7 for Leo', tool: 'draft_player', args: { memberName: 'Leo', player: 'number 7' }, code: true },
    { name: 'draft wants to', text: 'Leo wants to draft Splash', tool: 'draft_player', args: { memberName: 'Leo', player: 'Splash' }, code: true },
    { name: 'draft drafts', text: 'Priya drafts Quick Kai.', tool: 'draft_player', args: { memberName: 'Priya', player: 'Quick Kai' }, code: true },
    { name: 'draft lowercase', text: "i'm maya, draft big mo", tool: 'draft_player', args: { memberName: 'Maya', player: 'big mo' }, code: true },
    { name: 'draft curly', text: 'I’m Maya, draft Big Mo', tool: 'draft_player', args: { memberName: 'Maya', player: 'Big Mo' }, code: true },
    { name: 'explicit beats speaker', text: "I'm Leo, draft Big Mo", speaker: MAYA, tool: 'draft_player', args: { memberName: 'Leo', player: 'Big Mo' }, code: true },
    { name: 'pick team', text: "I'm Sam, put me down for the Hawks scoring first", tool: 'make_pick', args: { memberName: 'Sam', choice: 'Hawks' }, code: true },
    { name: 'pick to score first', text: "I'm Sam, I'll take the Foxes to score first", tool: 'make_pick', args: { memberName: 'Sam', choice: 'Foxes' }, code: true },
    { name: 'pick takes', text: 'Priya takes the over', tool: 'make_pick', args: { memberName: 'Priya', choice: 'the over' }, code: true },
    { name: 'pick says', text: 'Sam says a three.', tool: 'make_pick', args: { memberName: 'Sam', choice: 'a three' }, code: true },
    { name: 'pick I say speaker', text: 'I say the under', speaker: MAYA, tool: 'make_pick', args: { memberName: 'Maya', choice: 'the under' }, code: true },
    { name: 'pick I pick', text: "I'm Leo, I pick home", tool: 'make_pick', args: { memberName: 'Leo', choice: 'home' }, code: true },
    { name: 'roster speaker', text: "how's my roster doing?", speaker: MAYA, tool: 'get_my_roster', args: { memberName: 'Maya' }, code: true },
    { name: 'roster explicit', text: "I'm Leo, how's my roster doing?", tool: 'get_my_roster', args: { memberName: 'Leo' }, code: true },
    { name: 'leaderboard', text: "who's winning?", tool: 'get_leaderboard', args: {}, code: true },
    { name: 'leaderboard house', text: "who's winning in our house?", tool: 'get_leaderboard', args: {}, code: true },
    { name: 'leaderboard word', text: 'leaderboard', tool: 'get_leaderboard', args: {}, code: true },
    { name: 'explain why', text: 'why did that one go the other way?', tool: 'explain_last_result', args: {}, code: true },
    { name: 'explain what happened', text: 'what happened with that question', tool: 'explain_last_result', args: {}, code: true },
    { name: 'explain word', text: 'explain', tool: 'explain_last_result', args: {}, code: true },
    { name: 'season me', text: 'how am I doing this season?', speaker: MAYA, tool: 'get_season_standings', args: { memberName: 'Maya' } },
    { name: 'season me no name', text: 'how am I doing this season?', tool: 'get_season_standings', args: {} },
    { name: 'season standings', text: 'season standings', speaker: MAYA, tool: 'get_season_standings', args: {} },
    { name: 'season winning', text: "who's winning the season", speaker: MAYA, tool: 'get_season_standings', args: {} },
    { name: 'season beats leaderboard', text: 'season leaderboard', tool: 'get_season_standings', args: {} },
    { name: 'start game', text: 'start the game', tool: 'start_watch_party', args: {}, code: true },
    { name: 'start party', text: 'Start the party!', tool: 'start_watch_party', args: {}, code: true },
    { name: 'tip off', text: 'tip off', tool: 'start_watch_party', args: {}, code: true },
    { name: 'lets start', text: "let's start", tool: 'start_watch_party', args: {}, code: true },
    { name: 'curly lets start', text: 'let’s start', tool: 'start_watch_party', args: {}, code: true },
    { name: 'ready is not a name', text: "I'm ready, start the game", tool: 'start_watch_party', args: {}, code: true },
    { name: 'score', text: "what's the score?", tool: 'get_game_status', args: {}, code: true },
    { name: 'curly score', text: 'what’s the score?', tool: 'get_game_status', args: {}, code: true },
    { name: 'status', text: 'game status', tool: 'get_game_status', args: {}, code: true },
    { name: 'clock', text: "what's the clock", tool: 'get_game_status', args: {}, code: true },
    { name: 'question', text: "what's the question", tool: 'get_game_status', args: {}, code: true },
    // Football (phase 8)
    { name: 'football setup', text: 'set up a watch party for the football game with the Sunday Crew', tool: 'setup_watch_party', args: { crewName: 'Sunday Crew', gameTitle: 'football' } },
    { name: 'football setup crew after game', text: 'set up a watch party for the Otters game with the Seattle crew', tool: 'setup_watch_party', args: { crewName: 'Seattle crew', gameTitle: 'Otters' } },
    { name: 'available quarterback', text: "who's available at quarterback?", tool: 'list_available_players', args: { position: 'QB' }, code: true },
    { name: 'available QB', text: 'who is still open at QB', tool: 'list_available_players', args: { position: 'QB' }, code: true },
    { name: 'available running back', text: "who's left at running back?", tool: 'list_available_players', args: { position: 'RB' }, code: true },
    { name: 'available kicker', text: "who's available at kicker", tool: 'list_available_players', args: { position: 'K' }, code: true },
    { name: 'draft the Otters quarterback', text: 'draft the Otters quarterback', speaker: MAYA, tool: 'draft_player', args: { memberName: 'Maya', player: 'the Otters quarterback' }, code: true },
    { name: 'draft nickname explicit', text: "I'm Leo, draft Boots", tool: 'draft_player', args: { memberName: 'Leo', player: 'Boots' }, code: true },
    { name: 'put me down for yes', text: 'put me down for yes', speaker: MAYA, tool: 'make_pick', args: { memberName: 'Maya', choice: 'yes' }, code: true },
    { name: 'Leo says no', text: 'Leo says no', tool: 'make_pick', args: { memberName: 'Leo', choice: 'no' }, code: true },
    { name: 'Leo says they score', text: 'Leo says they score', tool: 'make_pick', args: { memberName: 'Leo', choice: 'they score' }, code: true },
    { name: 'Sam says no score', text: 'Sam says no score', tool: 'make_pick', args: { memberName: 'Sam', choice: 'no score' }, code: true },
    { name: 'Priya says they get stopped', text: 'Priya says they get stopped', tool: 'make_pick', args: { memberName: 'Priya', choice: 'they get stopped' }, code: true },
    { name: 'will they score', text: 'will they score?', tool: 'get_game_status', args: {}, code: true },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const base = req(c.text, c.speaker ? { speaker: c.speaker } : {});
      expect(parseUtterance(base)).toEqual(tool(c.tool, c.args));
      const withCode = parseUtterance({ ...base, partyCode: 'DEMO' });
      expect(withCode).toEqual(tool(c.tool, c.code ? { code: 'DEMO', ...c.args } : c.args));
    });
  }

  it('never sets source or propId on make_pick', () => {
    const plan = parseUtterance(req('Priya takes the over', { partyCode: 'DEMO' }));
    expect(plan.kind).toBe('tool');
    if (plan.kind === 'tool') {
      expect(plan.args).not.toHaveProperty('source');
      expect(plan.args).not.toHaveProperty('propId');
    }
  });

  for (const text of ['draft Big Mo', 'put me down for the Hawks', 'I pick the over', "how's my roster doing?"]) {
    it(`asks for a name: ${text}`, () => {
      const plan = parseUtterance(req(text, { partyCode: 'DEMO' }));
      expect(plan.kind).toBe('reply');
      if (plan.kind === 'reply') {
        expect(plan.reply).toContain("Who's picking?");
        expect(plan.reply).toContain("I'm Maya");
      }
    });
  }

  it('unknown and empty utterances give the help reply', () => {
    for (const text of ['blah blah banana', '', '   ', '?!']) {
      const plan = parseUtterance(req(text));
      expect(plan.kind).toBe('reply');
      if (plan.kind === 'reply') {
        expect(plan.reply).toContain('draft');
        expect(plan.reply).not.toMatch(/[*#`]/);
      }
    }
  });
});

describe('runOffline against the real server', () => {
  let srv: TestServer;
  let mcp: AssistantMcp;
  let tools: ToolInfo[];

  beforeAll(async () => {
    srv = await startTestServer();
    mcp = createMcpClient({ url: `${srv.base}/mcp`, token: srv.token });
    tools = await mcp.listTools();
  });
  afterAll(async () => {
    await mcp.close();
    await srv.close();
  });

  const hasUi = (name: string) => {
    const meta = tools.find((t) => t.name === name)?._meta as { ui?: { resourceUri?: string } } | undefined;
    return meta?.ui?.resourceUri === BOARD_URI;
  };

  async function run(text: string, extra: Partial<AssistantRequest> = {}): Promise<AssistantResponse> {
    return runOffline(req(text, { partyCode: 'DEMO', ...extra }), mcp);
  }

  function expectOneCall(res: AssistantResponse, name: string, args: Record<string, unknown>) {
    expect(res.mode).toBe('offline');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].name).toBe(name);
    expect(res.toolCalls[0].args).toEqual(args);
    expect(res.reply.length).toBeGreaterThan(0);
  }

  function expectUi(res: AssistantResponse, name: string, args: Record<string, unknown>) {
    if (hasUi(name)) {
      expect(res.uiResource?.uri).toBe('ui://benchwarmers/board.html');
      expect(res.uiResource?.toolName).toBe(name);
      expect(res.uiResource?.toolInput).toEqual(args);
    } else {
      expect(res.uiResource).toBeUndefined();
    }
  }

  async function rosterText(memberName: string): Promise<string> {
    const r: ToolResult = await mcp.callTool('get_my_roster', { code: 'DEMO', memberName });
    return (r.content ?? []).map((c) => c.text ?? '').join(' ');
  }

  it('the UI tool set is what the tests assume', () => {
    for (const n of ['draft_player', 'list_available_players', 'make_pick', 'get_leaderboard', 'get_season_standings']) {
      expect(hasUi(n)).toBe(true);
    }
    expect(hasUi('get_game_status')).toBe(false);
  });

  it('1 draft: "I\'m Maya, draft Big Mo" lands on Maya\'s roster', async () => {
    const args = { code: 'DEMO', memberName: 'Maya', player: 'Big Mo' };
    const res = await run("I'm Maya, draft Big Mo");
    expectOneCall(res, 'draft_player', args);
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'draft_player', args);
    expect(res.partyCode).toBe('DEMO');
    expect(await rosterText('Maya')).toMatch(/Moses Adeyemi|Big Mo/);
  });

  it('2 speaker hint: "draft Splash" lands on Maya\'s roster', async () => {
    const args = { code: 'DEMO', memberName: 'Maya', player: 'Splash' };
    const res = await run('draft Splash', { speaker: MAYA });
    expectOneCall(res, 'draft_player', args);
    expect(res.toolCalls[0].ok).toBe(true);
    const roster = await rosterText('Maya');
    expect(roster).toMatch(/Tommy Okafor|Splash/);
    expect(roster).toMatch(/Moses Adeyemi|Big Mo/);
  });

  it('3 roster', async () => {
    const res = await run("how's my roster doing?", { speaker: MAYA });
    expectOneCall(res, 'get_my_roster', { code: 'DEMO', memberName: 'Maya' });
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'get_my_roster', { code: 'DEMO', memberName: 'Maya' });
  });

  it('4 available at center', async () => {
    const args = { code: 'DEMO', position: 'C' };
    const res = await run("who's available at center?");
    expectOneCall(res, 'list_available_players', args);
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'list_available_players', args);
  });

  it('5 leaderboard', async () => {
    const res = await run("who's winning in our house?");
    expectOneCall(res, 'get_leaderboard', { code: 'DEMO' });
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'get_leaderboard', { code: 'DEMO' });
  });

  it('6 start the game', async () => {
    const res = await run('start the game');
    expectOneCall(res, 'start_watch_party', { code: 'DEMO' });
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'start_watch_party', { code: 'DEMO' });
  });

  it('7 score (non-UI tool has no uiResource)', async () => {
    const res = await run("what's the score?");
    expectOneCall(res, 'get_game_status', { code: 'DEMO' });
    expect(res.toolCalls[0].ok).toBe(true);
    expect(res.uiResource).toBeUndefined();
  });

  it('8 make_pick: "I\'m Sam, put me down for the Hawks scoring first"', async () => {
    const args = { code: 'DEMO', memberName: 'Sam', choice: 'Hawks' };
    const res = await run("I'm Sam, put me down for the Hawks scoring first");
    expectOneCall(res, 'make_pick', args);
    expectUi(res, 'make_pick', args);
    expect(res.toolCalls[0].ok).toBe(true);
    expect(res.reply).toContain("Sam");
  });

  it('9 make_pick: "Priya takes the over"', async () => {
    const args = { code: 'DEMO', memberName: 'Priya', choice: 'the over' };
    const res = await run('Priya takes the over');
    expectOneCall(res, 'make_pick', args);
    expectUi(res, 'make_pick', args);
    // The open question is 'who scores first', so "the over" is not one of its options: args are right, the tool says so.
    expect(res.toolCalls[0].ok).toBe(false);
    expect(res.reply).toContain('not one of the choices');
  });

  it('10 explain', async () => {
    const res = await run('why did that one go the other way?');
    expectOneCall(res, 'explain_last_result', { code: 'DEMO' });
    expect(res.uiResource).toBeUndefined();
  });

  it('11 season standings (no code field)', async () => {
    const args = { memberName: 'Maya' };
    const res = await run('how am I doing this season?', { speaker: MAYA });
    expectOneCall(res, 'get_season_standings', args);
    expect(res.toolCalls[0].ok).toBe(true);
    expectUi(res, 'get_season_standings', args);
  });

  it('12 setup creates a new party', async () => {
    const args = { crewName: 'Sunday Crew', when: 'tonight' };
    const res = await runOffline(req("set up a watch party for tonight's game with the Sunday Crew", { partyCode: 'DEMO' }), mcp);
    expectOneCall(res, 'setup_watch_party', args);
    expect(res.toolCalls[0].ok).toBe(true);
    expect(res.partyCode).toMatch(/^[A-Z0-9]{4}$/i);
    expect(res.partyCode).not.toBe('DEMO');
  });

  it('missing speaker: "draft Big Mo" asks who is picking, no tool call', async () => {
    const res = await run('draft Big Mo');
    expect(res.mode).toBe('offline');
    expect(res.toolCalls).toEqual([]);
    expect(res.reply).toContain("Who's picking?");
    expect(res.uiResource).toBeUndefined();
  });

  it('unknown utterance gives the help reply with no tool call', async () => {
    const res = await run('banana');
    expect(res.toolCalls).toEqual([]);
    expect(res.mode).toBe('offline');
    expect(res.reply.length).toBeGreaterThan(0);
  });

  it('does not throw when the server is unreachable', async () => {
    const dead = createMcpClient({ url: 'http://127.0.0.1:1/mcp', token: 'x' });
    const res = await runOffline(req('start the game', { partyCode: 'DEMO' }), dead);
    expect(res.toolCalls).toEqual([]);
    expect(res.reply).toContain("can't reach the game");
    await dead.close();
  });
});

describe('football party, offline conversation (real server, fake clock)', () => {
  const T0 = 1_000_000;
  let t = T0;
  let srv: TestServer;
  let mcp: AssistantMcp;

  beforeAll(async () => {
    srv = await startTestServer({ now: () => t, speed: 4 });
    mcp = createMcpClient({ url: `${srv.base}/mcp`, token: srv.token });
  });
  afterAll(async () => {
    await mcp.close();
    await srv.close();
  });

  const say = (code: string | undefined, text: string, speaker?: typeof MAYA): Promise<AssistantResponse> =>
    runOffline(req(text, { ...(code ? { partyCode: code } : {}), ...(speaker ? { speaker } : {}) }), mcp);

  it('sets up the football party, drafts, starts and answers a drive question mid-drive', async () => {
    const setup = await say(undefined, 'set up a watch party for the football game with the Sunday Crew');
    expect(setup.toolCalls.map((c) => [c.name, c.args])).toEqual([['setup_watch_party', { crewName: 'Sunday Crew', gameTitle: 'football' }]]);
    expect(setup.toolCalls[0].ok).toBe(true);
    expect(setup.reply).toContain('Riverton Otters at Ironwood Forge');
    const code = setup.partyCode!;
    expect(code).toMatch(/^[A-Z0-9]{4}$/i);

    const qb = await say(code, "I'm Maya, draft the Otters quarterback");
    expect(qb.toolCalls[0].ok).toBe(true);
    expect(qb.reply).toContain('quarterback');
    const kicker = await say(code, "I'm Leo, draft Boots");
    expect(kicker.toolCalls[0].ok).toBe(true);
    expect(kicker.reply).toContain('kicker');

    const left = await say(code, "who's available at quarterback?");
    expect(left.toolCalls[0].ok).toBe(true);
    expect(left.reply).not.toContain('Colt Mason');
    expect(left.reply).toContain('quarterback');

    const started = await say(code, 'start the party');
    expect(started.toolCalls[0].ok).toBe(true);
    expect(started.reply).toMatch(/^Kickoff!/);

    t += 6_250; // 25 game seconds in: drive 1 (Otters, own 25) is under way and its question is open
    const status = await say(code, "will they score?");
    expect(status.toolCalls[0].name).toBe('get_game_status');
    expect(status.toolCalls[0].ok).toBe(true);
    expect(status.reply).toBe(
      'Forge 0, Otters 0, Q1 11:53. Otters ball at their own 25, 1st quarter. Latest: Otters take over at their own 25. Kickoff is in the air. ' +
        'Open question: Will the Otters score on this drive? Drives like this score 36% of the time. Locks in about 2 seconds.',
    );

    const leo = await say(code, 'Leo says they score');
    expect(leo.toolCalls[0].ok).toBe(true);
    expect(leo.reply).toBe('Got it, Leo: Yes. Locks in about 2 seconds.');
    const sam = await say(code, 'Sam says no score');
    expect(sam.toolCalls[0].ok).toBe(true);
    expect(sam.reply).toBe('Got it, Sam: No. Locks in about 2 seconds.');

    t += 2_000; // game second 33: the question has locked
    const late = await say(code, 'Priya says yes');
    expect(late.toolCalls[0].ok).toBe(false);
    expect(late.reply).toMatch(/locked/i);

    t += 2_000; // game second 41: the drive ends in a touchdown and the question resolves
    const why = await say(code, 'why did that one go the other way?');
    expect(why.toolCalls[0].ok).toBe(true);
    expect(why.reply).toContain('Will the Otters score on this drive?');
    expect(why.reply).toContain('The answer was Yes.');
    expect(why.reply).toContain('Got it right: Leo.');
  });
});
