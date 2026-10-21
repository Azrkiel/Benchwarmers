import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runGemini } from '../../src/assistant/geminiLoop.js';
import { createAssistantRouter } from '../../src/assistant/routes.js';
import { createGeminiClient, type GeminiResponse } from '../../src/ai/gemini.js';
import type { AssistantMcp } from '../../src/assistant/mcpClient.js';
import type { AssistantRequest } from '../../src/shared/types.js';

const req: AssistantRequest = {
  text: 'draft Big Mo', household: 'garcias', partyCode: 'DEMO',
  speaker: { memberName: 'Maya', confidence: 0.9, source: 'voice-id' },
};
const fc = (name: string, args: Record<string, unknown> = {}, id = name) => ({ functionCall: { id, name, args }, thoughtSignature: 'keep-this-signature' });
const reply = (...parts: Record<string, unknown>[]): GeminiResponse => ({
  candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});
const text = (value: string) => reply({ text: value });
function scripted(replies: (GeminiResponse | Error)[]) {
  const inputs: unknown[] = [];
  const generateContent = vi.fn(async (input) => {
    inputs.push(structuredClone(input));
    const r = replies[inputs.length - 1];
    if (r instanceof Error) throw r;
    return r;
  });
  return { generateContent, inputs };
}
function tools() {
  const listTools = vi.fn(async () => ['setup_watch_party', 'draft_player', 'get_game_status', 'get_leaderboard'].map((name) => ({
    name, description: name,
    inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { code: { type: 'string' } } },
    _meta: { ui: { resourceUri: 'ui://benchwarmers/board.html' } },
  })));
  const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => ({
    content: [{ type: 'text', text: name === 'draft_player' ? 'Maya drafted Big Mo.' : 'Here is the game.' }],
    structuredContent: { code: name === 'setup_watch_party' ? 'NEW1' : args.code, state: { large: 'omit' } },
  }));
  return { listTools, callTool, getPrompt: vi.fn(async () => 'HOST PROMPT'), close: vi.fn(async () => {}) } satisfies AssistantMcp;
}
afterEach(() => vi.unstubAllEnvs());

describe('Gemini assistant', () => {
  it('executes MCP tools, preserves thought signatures and returns traces/UI', async () => {
    const mcp = tools();
    const client = scripted([reply(fc('draft_player', { memberName: 'Maya', player: 'Big Mo' })), text('Maya drafted Big Mo.')]);
    const result = await runGemini(req, { mcp, client });
    expect(result.mode).toBe('gemini');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.uiResource?.uri).toBe('ui://benchwarmers/board.html');
    expect(mcp.callTool).toHaveBeenCalledExactlyOnceWith('draft_player', { memberName: 'Maya', player: 'Big Mo', code: 'DEMO' });
    const inputs = client.inputs as any[];
    expect(inputs[0].systemInstruction.parts[0].text).toContain('Maya (voice ID)');
    expect(inputs[0].tools[0].functionDeclarations[0].parametersJsonSchema).not.toHaveProperty('$schema');
    expect(inputs[1].contents[1].parts[0].thoughtSignature).toBe('keep-this-signature');
    expect(inputs[1].contents[2].parts[0].functionResponse.id).toBe('draft_player');
    expect(inputs[1].contents[2].parts[0].functionResponse.response).not.toHaveProperty('state');
  });

  it('propagates setup code to sequential and parallel tool calls', async () => {
    const mcp = tools();
    const client = scripted([
      reply(fc('setup_watch_party')),
      reply(fc('get_game_status'), fc('get_leaderboard')),
      text('Ready.'),
    ]);
    const result = await runGemini(req, { mcp, client });
    expect(result.partyCode).toBe('NEW1');
    expect(mcp.callTool.mock.calls.slice(1).map((c) => c[1].code)).toEqual(['NEW1', 'NEW1']);
  });

  it('caps tool rounds and disables function calling for the final answer', async () => {
    const mcp = tools();
    const client = scripted([reply(fc('get_game_status')), reply(fc('get_game_status')), reply(fc('get_game_status')), text('Done.')]);
    const result = await runGemini(req, { mcp, client });
    expect(result.toolCalls).toHaveLength(3);
    expect(client.generateContent).toHaveBeenCalledTimes(4);
    expect((client.inputs[3] as any).toolConfig.functionCallingConfig.mode).toBe('NONE');
  });

  it('does not replay a mutation after a later generation fails', async () => {
    const mcp = tools();
    const client = scripted([reply(fc('draft_player', { memberName: 'Maya', player: 'Big Mo' })), new Error('unavailable')]);
    const result = await runGemini(req, { mcp, client });
    expect(result.mode).toBe('gemini');
    expect(result.reply).toBe('Maya drafted Big Mo.');
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
  });

  it('fails over keys after a mutation and continues the same turn without repeating the tool', async () => {
    const mcp = tools();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(reply(fc('draft_player', { memberName: 'Maya', player: 'Big Mo' })))))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(text('All set.'))));
    const client = createGeminiClient({ apiKeys: ['a', 'b'], fetch });
    const result = await runGemini(req, { mcp, client });
    expect(result.reply).toBe('All set.');
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.map((c) => new Headers(c[1].headers).get('x-goog-api-key'))).toEqual(['a', 'a', 'b']);
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
  });

  it('falls back offline when no mutation happened and Gemini is unavailable', async () => {
    const mcp = tools();
    const client = scripted([new Error('unavailable')]);
    const result = await runGemini({ ...req, text: "I'm Maya, draft Big Mo" }, { mcp, client });
    expect(result.mode).toBe('offline');
    expect(mcp.callTool).toHaveBeenCalledExactlyOnceWith('draft_player', { memberName: 'Maya', player: 'Big Mo', code: 'DEMO' });
  });

  it('rejects undeclared tools without executing them and ignores internal thought text', async () => {
    const mcp = tools();
    const client = scripted([reply(fc('delete_everything')), text('Cannot do that.')]);
    const result = await runGemini(req, { mcp, client });
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(result.toolCalls[0].ok).toBe(false);
    const clean = await runGemini(req, { mcp, client: scripted([reply({ text: 'internal', thought: true }, { text: 'Hello.' })]) });
    expect(clean.reply).toBe('Hello.');
  });

  it('selects Gemini through ASSISTANT_MODE on the HTTP route', async () => {
    vi.stubEnv('ASSISTANT_MODE', 'gemini');
    const app = express();
    app.use(createAssistantRouter({ mcp: tools(), gemini: scripted([text('Hello from Gemini.')]) }));
    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const response = await fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mode: 'gemini', reply: 'Hello from Gemini.' });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
