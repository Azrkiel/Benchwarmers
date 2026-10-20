import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, runBedrock, toToolConfig } from '../../src/assistant/bedrockLoop.js';
import { createMcpClient, type AssistantMcp } from '../../src/assistant/mcpClient.js';
import type { AssistantRequest } from '../../src/shared/types.js';
import { startTestServer, type TestServer } from './helpers.js';

let srv: TestServer;
let mcp: AssistantMcp;

beforeEach(async () => {
  srv = await startTestServer();
  mcp = createMcpClient({ url: `${srv.base}/mcp`, token: srv.token });
});
afterEach(async () => {
  await mcp.close();
  await srv.close();
});

const MAYA = { memberName: 'Maya', confidence: 0.9, source: 'voice-id' as const };
const req = (text: string, extra: Partial<AssistantRequest> = {}): AssistantRequest => ({
  text,
  household: 'garcias',
  partyCode: 'DEMO',
  ...extra,
});

type Reply = { content: Record<string, unknown>[]; stopReason?: string; usage?: Record<string, number> } | Error;
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ toolUse: { toolUseId: id, name, input } });
const tu = (...blocks: Record<string, unknown>[]): Reply => ({ content: blocks, stopReason: 'tool_use', usage: { inputTokens: 10, outputTokens: 5 } });
const txt = (t: string): Reply => ({ content: [{ text: t }], stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } });

function scripted(replies: Reply[] | ((n: number) => Reply)) {
  const inputs: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    inputs.push(cmd.input);
    const r = typeof replies === 'function' ? replies(inputs.length - 1) : replies[inputs.length - 1];
    if (r instanceof Error) throw r;
    return { output: { message: { role: 'assistant', content: r.content } }, stopReason: r.stopReason, usage: r.usage };
  });
  return { send, inputs };
}

const toolResultsOf = (input: any) =>
  input.messages.filter((m: any) => m.role === 'user').flatMap((m: any) => m.content.filter((b: any) => b.toolResult).map((b: any) => b.toolResult));

describe('toToolConfig', () => {
  it('maps all tools, strips $schema, ensures object type', async () => {
    const tools = await mcp.listTools();
    const cfg = toToolConfig(tools);
    expect(cfg.tools).toHaveLength(11);
    for (const t of cfg.tools) {
      expect(t.toolSpec.inputSchema.json).not.toHaveProperty('$schema');
      expect(t.toolSpec.inputSchema.json.type).toBe('object');
    }
    const draft = cfg.tools.find((t) => t.toolSpec.name === 'draft_player')!;
    const props = draft.toolSpec.inputSchema.json.properties as Record<string, unknown>;
    expect(props).toHaveProperty('memberName');
    expect(props).toHaveProperty('player');
  });
});

describe('buildSystemPrompt', () => {
  it('includes host prompt, household, code and speaker', () => {
    const s = buildSystemPrompt('HOST PROMPT TEXT', req('x', { speaker: MAYA }));
    expect(s).toContain('HOST PROMPT TEXT');
    expect(s).toContain('garcias');
    expect(s).toContain('Use code DEMO for tool calls.');
    expect(s).toContain('The speaker is Maya (voice ID).');
    expect(s).not.toContain("Who's picking?");
  });
  it('asks who is picking without a speaker', () => {
    expect(buildSystemPrompt('H', req('x'))).toContain("Who's picking?");
  });
});

describe('runBedrock loop', () => {
  it('runs a tool round then returns the final text', async () => {
    const { send, inputs } = scripted([tu(toolUse('t1', 'draft_player', { memberName: 'Maya', player: 'Big Mo' })), txt('Maya drafted Big Mo.')]);
    const res = await runBedrock(req('draft Big Mo', { speaker: MAYA }), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.mode).toBe('bedrock');
    expect(res.reply).toBe('Maya drafted Big Mo.');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].args.code).toBe('DEMO');
    expect(res.toolCalls[0].ok).toBe(true);
    expect(res.uiResource?.uri).toBe('ui://benchwarmers/board.html');
    expect(res.partyCode).toBe('DEMO');
    expect(send).toHaveBeenCalledTimes(2);
    const trs = toolResultsOf(inputs[1]);
    expect(trs).toHaveLength(1);
    expect(trs[0].toolUseId).toBe('t1');
    expect(trs[0].status).toBe('success');
    for (const i of inputs) {
      expect(i.toolConfig.tools.length).toBe(11);
      expect(i.modelId).toBe('test-model');
    }
    const hostPrompt = await mcp.getPrompt('watch_party_host', {});
    expect(hostPrompt.length).toBeGreaterThan(0);
    expect(inputs[0].system[0].text).toContain(hostPrompt);
  });

  it('executes two toolUse blocks in order with one user result message', async () => {
    const { send, inputs } = scripted([
      tu(toolUse('a', 'get_game_status', {}), toolUse('b', 'get_leaderboard', {})),
      txt('Here you go.'),
    ]);
    const res = await runBedrock(req('status and leaderboard'), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.toolCalls.map((c) => c.name)).toEqual(['get_game_status', 'get_leaderboard']);
    const last = inputs[1].messages[inputs[1].messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content.map((b: any) => b.toolResult.toolUseId)).toEqual(['a', 'b']);
  });

  it('uses the code returned by setup for later calls', async () => {
    const { send } = scripted([
      tu(toolUse('s', 'setup_watch_party', { crewName: 'Sunday Crew' })),
      tu(toolUse('g', 'get_game_status', {})),
      txt('All set.'),
    ]);
    const res = await runBedrock(req('set up'), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.toolCalls).toHaveLength(2);
    const newCode = res.toolCalls[1].args.code;
    expect(typeof newCode).toBe('string');
    expect(newCode).not.toBe('DEMO');
    expect(res.partyCode).toBe(newCode);
  });

  it('feeds tool errors back as error results and continues', async () => {
    const { send, inputs } = scripted([tu(toolUse('x', 'draft_player', { memberName: 'Nobody', player: 'Big Mo' })), txt('I could not find Nobody.')]);
    const res = await runBedrock(req('draft'), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.toolCalls[0].ok).toBe(false);
    expect(toolResultsOf(inputs[1])[0].status).toBe('error');
    expect(res.reply).toBe('I could not find Nobody.');
    expect(res.mode).toBe('bedrock');
  });

  it('caps at 3 tool rounds then forces a final answer', async () => {
    const { send, inputs } = scripted((n) => tu(toolUse(`t${n}`, 'get_game_status', {})));
    const res = await runBedrock(req('status'), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.toolCalls).toHaveLength(3);
    expect(send).toHaveBeenCalledTimes(4);
    const last = inputs[3].messages[inputs[3].messages.length - 1];
    expect(last.role).toBe('user');
    expect(JSON.stringify(last.content)).toContain('Answer now');
    expect(inputs[3].toolConfig).toBeDefined();
    expect(res.reply.length).toBeGreaterThan(0);
    expect(res.mode).toBe('bedrock');
  });
});

describe('fallback to offline', () => {
  it('falls back when Bedrock throws', async () => {
    const send = vi.fn(async () => {
      throw new Error('AccessDeniedException');
    });
    const res = await runBedrock(req("I'm Maya, draft Big Mo"), { mcp, client: { send }, modelId: 'test-model' });
    expect(res.mode).toBe('offline');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].name).toBe('draft_player');
    expect(res.toolCalls[0].ok).toBe(true);
  });

  it('falls back when the second call fails after a tool round', async () => {
    const { send } = scripted([tu(toolUse('t1', 'get_game_status', {})), new Error('ThrottlingException')]);
    const res = await runBedrock(req("I'm Maya, draft Big Mo"), { mcp, client: { send }, modelId: 'test-model' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(res.mode).toBe('offline');
    expect(res.toolCalls.map((c) => c.name)).toEqual(['draft_player']);
  });

  it('falls back without calling send when modelId is missing', async () => {
    const send = vi.fn();
    const res = await runBedrock(req("I'm Maya, draft Big Mo"), { mcp, client: { send }, modelId: '' });
    expect(res.mode).toBe('offline');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('history mapping', () => {
  it('starts with a user turn and alternates roles', async () => {
    const { send, inputs } = scripted([txt('ok')]);
    await runBedrock(
      req('c', {
        history: [
          { role: 'assistant', text: 'Hi' },
          { role: 'user', text: 'a' },
          { role: 'user', text: 'b' },
        ],
      }),
      { mcp, client: { send }, modelId: 'test-model' },
    );
    const msgs = inputs[0].messages;
    expect(msgs[0].role).toBe('user');
    for (let i = 1; i < msgs.length; i++) expect(msgs[i].role).not.toBe(msgs[i - 1].role);
    expect(JSON.stringify(msgs)).not.toContain('Hi');
    expect(JSON.stringify(msgs)).toContain('"c"');
  });
});
