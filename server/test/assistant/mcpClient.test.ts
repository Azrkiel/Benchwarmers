import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMcpClient, type AssistantMcp, type ToolResult } from '../../src/assistant/mcpClient.js';
import { buildResponse, callTraced, partyCodeFrom, summarize, uiResourceUri, type TracedCall } from '../../src/assistant/trace.js';
import { BOARD_URI } from '../../src/mcp/server.js';
import { startTestServer, type TestServer } from './helpers.js';

const TOOLS = [
  'setup_watch_party', 'join_watch_party', 'start_watch_party', 'get_game_status', 'explain_last_result',
  'get_my_roster', 'list_available_players', 'draft_player', 'make_pick', 'get_leaderboard', 'get_season_standings',
];

let srv: TestServer;
let clients: AssistantMcp[] = [];

function mk(token?: string): AssistantMcp {
  const c = createMcpClient({ url: `${srv.base}/mcp`, token: token ?? srv.token });
  clients.push(c);
  return c;
}

beforeAll(async () => {
  srv = await startTestServer();
});
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  clients = [];
});
afterAll(async () => {
  await srv.close();
});

describe('createMcpClient', () => {
  it('lists all tools, cached by reference', async () => {
    const mcp = mk();
    const tools = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort());
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
    expect(await mcp.listTools()).toBe(tools);
  });

  it('getPrompt returns joined text', async () => {
    const text = await mk().getPrompt('watch_party_host', { crewName: 'Sunday Crew' });
    expect(text).toContain('setup_watch_party');
    expect(text).toContain('Sunday Crew');
  });

  it('concurrent first calls share one connection', async () => {
    const mcp = mk();
    const [a, b] = await Promise.all([mcp.listTools(), mcp.listTools()]);
    expect(a.length).toBe(11);
    expect(b.length).toBe(11);
  });

  it('wrong token rejects listTools and does not throw from callTraced', async () => {
    await expect(mk('wrong').listTools()).rejects.toThrow();
    const traced = await callTraced(mk('wrong'), [], 'get_game_status', { code: 'DEMO' });
    expect(traced.trace.ok).toBe(false);
    expect(traced.result.isError).toBe(true);
    expect(traced.trace.summary.length).toBeGreaterThan(0);
    expect(traced.ui).toBeUndefined();
  });
});

describe('callTraced', () => {
  it('get_game_status: ok, no ui', async () => {
    const mcp = mk();
    const tools = await mcp.listTools();
    const t = await callTraced(mcp, tools, 'get_game_status', { code: 'DEMO' });
    expect(t.trace.ok).toBe(true);
    expect(t.trace.ms).toBeGreaterThanOrEqual(0);
    expect(t.trace.summary.length).toBeGreaterThan(0);
    expect(t.ui).toBeUndefined();
  });

  it('draft_player: ui resource and party code', async () => {
    const mcp = mk();
    const tools = await mcp.listTools();
    expect(uiResourceUri(tools.find((x) => x.name === 'draft_player'))).toBe(BOARD_URI);
    const args = { code: 'DEMO', memberName: 'Maya', player: 'Big Mo' };
    const t = await callTraced(mcp, tools, 'draft_player', args);
    expect(t.trace.ok).toBe(true);
    expect(t.ui?.uri).toBe(BOARD_URI);
    expect(t.ui?.toolName).toBe('draft_player');
    expect(t.ui?.toolInput).toEqual(args);
    expect(partyCodeFrom(t.result)).toBe('DEMO');
  });

  it('failing tool gives ok:false with the tool error text', async () => {
    const mcp = mk();
    const tools = await mcp.listTools();
    const t = await callTraced(mcp, tools, 'draft_player', { code: 'DEMO', memberName: 'Nobody', player: 'Big Mo' });
    expect(t.trace.ok).toBe(false);
    expect(t.result.isError).toBe(true);
    expect(t.trace.summary).toBe(summarize(t.result));
    expect(t.trace.summary).not.toBe('(no text)');
  });
});

describe('trace helpers', () => {
  it('summarize truncates and handles empty', () => {
    expect(summarize({ content: [] })).toBe('(no text)');
    const s = summarize({ content: [{ type: 'text', text: 'x'.repeat(300) }] });
    expect(s.length).toBe(160);
    expect(s.endsWith('…')).toBe(true);
  });

  it('uiResourceUri accepts nested and flat keys', () => {
    expect(uiResourceUri(undefined)).toBeUndefined();
    expect(uiResourceUri({ name: 'a', inputSchema: {}, _meta: { ui: { resourceUri: 'ui://a' } } })).toBe('ui://a');
    expect(uiResourceUri({ name: 'a', inputSchema: {}, _meta: { 'ui/resourceUri': 'ui://b' } })).toBe('ui://b');
  });

  it('buildResponse picks last ui and last successful party code', () => {
    const mkCall = (name: string, ok: boolean, code?: string, uri?: string): TracedCall => {
      const result: ToolResult = {
        isError: !ok,
        content: [{ type: 'text', text: name }],
        ...(code ? { structuredContent: { code } } : {}),
      };
      return {
        trace: { name, args: {}, ok, summary: name, ms: 1 },
        result,
        ...(uri ? { ui: { uri, toolName: name, toolInput: {}, toolResult: result } } : {}),
      };
    };
    const calls = [
      mkCall('a', true, 'AAAA', 'ui://1'),
      mkCall('b', true, 'BBBB', 'ui://2'),
      mkCall('c', false, 'CCCC'),
      mkCall('d', true),
    ];
    const r = buildResponse({ reply: 'hi', calls, mode: 'offline', requestPartyCode: 'REQ1' });
    expect(r.toolCalls.map((t) => t.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.uiResource?.uri).toBe('ui://2');
    expect(r.partyCode).toBe('BBBB');
    expect(r.mode).toBe('offline');

    const none = buildResponse({ reply: 'x', calls: [], mode: 'gemini' });
    expect('uiResource' in none).toBe(false);
    expect('partyCode' in none).toBe(false);
    expect(buildResponse({ reply: 'x', calls: [], mode: 'gemini', requestPartyCode: 'REQ1' }).partyCode).toBe('REQ1');
  });
});
