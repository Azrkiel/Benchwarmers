import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { expect, it, vi } from 'vitest';
import { createGeminiClient } from '../../src/ai/gemini.js';
import { createAssistantRouter } from '../../src/assistant/routes.js';
import { createMcpClient } from '../../src/assistant/mcpClient.js';
import { Store } from '../../src/game/store.js';
import { mountMcp } from '../../src/mcp/http.js';

it('HTTP assistant -> Gemini key failover -> real MCP draft -> persisted game state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-gemini-checkpoint-'));
  const store = new Store({ dataFile: path.join(dir, 'store.json') });
  const response = (parts: Record<string, unknown>[]) =>
    new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }));
  const googleFetch = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }))
    .mockResolvedValueOnce(response([{
      functionCall: { id: 'draft-1', name: 'draft_player', args: { memberName: 'Maya', player: 'Big Mo' } },
      thoughtSignature: 'signature-preserved',
    }]))
    .mockResolvedValueOnce(response([{ text: 'Maya drafted Big Mo.' }]));
  const gemini = createGeminiClient({ apiKeys: ['mock-teammate-a', 'mock-teammate-b'], fetch: googleFetch });
  const token = 'test-token';
  const app = express();
  mountMcp(app, { store, token });
  // Resolve the local port lazily through a real MCP client, just as production does.
  let mcp: ReturnType<typeof createMcpClient>;
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  mcp = createMcpClient({ url: base + '/mcp', token });
  app.use(createAssistantRouter({ mode: 'gemini', mcp, gemini }));
  try {
    const result = await fetch(base + '/api/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "I'm Maya, draft Big Mo", household: 'garcias', partyCode: 'DEMO' }),
    });
    expect(result.status).toBe(200);
    const body = await result.json() as { mode: string; reply: string; toolCalls: { name: string; ok: boolean }[] };
    expect(body).toMatchObject({ mode: 'gemini', reply: 'Maya drafted Big Mo.' });
    expect(body.toolCalls).toHaveLength(1);
    expect(body.toolCalls[0]).toMatchObject({ name: 'draft_player', ok: true });
    expect(store.getState('DEMO').draftBoard.filter((p) => p.ownerMemberId === 'maya')).toHaveLength(1);
    const restored = new Store({ dataFile: path.join(dir, 'store.json') });
    expect(restored.getState('DEMO').draftBoard.filter((p) => p.ownerMemberId === 'maya')).toHaveLength(1);
    expect(googleFetch.mock.calls.map((c) => new Headers(c[1].headers).get('x-goog-api-key')))
      .toEqual(['mock-teammate-a', 'mock-teammate-b', 'mock-teammate-b']);
    const lastRequest = JSON.parse(googleFetch.mock.calls[2][1].body);
    expect(lastRequest.contents[1].parts[0].thoughtSignature).toBe('signature-preserved');
  } finally {
    await mcp.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
