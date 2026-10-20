import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantRouter } from '../../src/assistant/routes.js';
import { mountMcp } from '../../src/mcp/http.js';
import { Store } from '../../src/game/store.js';
import { startTestServer, type TestServer } from './helpers.js';

let srv: TestServer;
const saved: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
  if (!(k in saved)) saved[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

beforeEach(async () => {
  setEnv('ASSISTANT_MODE', undefined);
  srv = await startTestServer();
});
afterEach(async () => {
  await srv.close();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(saved)) delete saved[k];
});

const post = (base: string, body: unknown, raw = false) =>
  fetch(`${base}/api/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });

describe('POST /api/assistant offline', () => {
  it('drafts with a spoken name', async () => {
    const r = await post(srv.base, { text: "I'm Maya, draft Big Mo", household: 'garcias', partyCode: 'DEMO' });
    expect(r.status).toBe(200);
    const j = (await r.json() as any);
    expect(j.mode).toBe('offline');
    expect(j.toolCalls[0].name).toBe('draft_player');
    expect(j.toolCalls[0].args).toEqual({ code: 'DEMO', memberName: 'Maya', player: 'Big Mo' });
    expect(j.toolCalls[0].ok).toBe(true);
    expect(j.uiResource.uri).toBe('ui://benchwarmers/board.html');
    expect(j.partyCode).toBe('DEMO');
    expect(j.reply.length).toBeGreaterThan(0);
  });

  it('uses the speaker hint', async () => {
    const r = await post(srv.base, {
      text: 'draft Splash',
      household: 'garcias',
      partyCode: 'DEMO',
      speaker: { memberName: 'Leo', confidence: 0.92, source: 'voice-id' },
    });
    expect(r.status).toBe(200);
    const j = (await r.json() as any);
    expect(j.toolCalls[0].name).toBe('draft_player');
    expect(j.toolCalls[0].args.memberName).toBe('Leo');
    expect(j.toolCalls[0].ok).toBe(true);
  });

  it('asks who is picking without a speaker', async () => {
    const r = await post(srv.base, { text: 'draft Big Mo', household: 'garcias', partyCode: 'DEMO' });
    expect(r.status).toBe(200);
    const j = (await r.json() as any);
    expect(j.toolCalls).toEqual([]);
    expect(j.reply).toContain("Who's picking?");
  });

  it('replies with help for unknown utterances', async () => {
    const r = await post(srv.base, { text: 'blorp zorp', household: 'garcias', partyCode: 'DEMO' });
    expect(r.status).toBe(200);
    const j = (await r.json() as any);
    expect(j.toolCalls).toEqual([]);
    expect(j.reply.length).toBeGreaterThan(0);
  });
});

describe('POST /api/assistant validation', () => {
  const ok = { text: 'score', household: 'garcias' };
  const cases: [string, unknown][] = [
    ['missing text', { household: 'garcias' }],
    ['empty text', { ...ok, text: '   ' }],
    ['missing household', { text: 'score' }],
    ['wrong types', { ...ok, text: 5 }],
    ['confidence out of range', { ...ok, speaker: { memberName: 'Leo', confidence: 2, source: 'voice-id' } }],
    ['bad history role', { ...ok, history: [{ role: 'system', text: 'x' }] }],
  ];
  for (const [name, body] of cases) {
    it(`400 on ${name}`, async () => {
      const r = await post(srv.base, body);
      expect(r.status).toBe(400);
      const j = (await r.json() as any);
      expect(j.code).toBe('BAD_REQUEST');
      expect(j.error).toContain('Invalid assistant request:');
    });
  }
  it('400 on invalid JSON', async () => {
    const r = await post(srv.base, '{not json', true);
    expect(r.status).toBe(400);
    expect(((await r.json() as any)).code).toBe('BAD_REQUEST');
  });
});

describe('bedrock mode', () => {
  it('falls back to offline with no model id', async () => {
    setEnv('ASSISTANT_MODE', 'bedrock');
    setEnv('BEDROCK_MODEL_ID', undefined);
    const r = await post(srv.base, { text: "I'm Maya, draft Big Mo", household: 'garcias', partyCode: 'DEMO' });
    expect(r.status).toBe(200);
    const j = (await r.json() as any);
    expect(j.mode).toBe('offline');
    expect(j.toolCalls[0].name).toBe('draft_player');
  });

  it('drives the loop through the ephemeral port with an injected mock', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-assistant-routes-'));
    const store = new Store({ dataFile: path.join(dir, 'store.json') });
    const token = 'tok-routes';
    const app = express();
    mountMcp(app, { store, token });
    const replies = [
      { content: [{ toolUse: { toolUseId: 't1', name: 'get_leaderboard', input: {} } }], stopReason: 'tool_use' },
      { content: [{ text: 'Nobody has scored yet.' }], stopReason: 'end_turn' },
    ];
    let n = 0;
    const send = vi.fn(async () => {
      const r = replies[n++];
      return {
        output: { message: { role: 'assistant', content: r.content } },
        stopReason: r.stopReason,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });
    app.use(createAssistantRouter({ token, mode: 'bedrock', bedrock: { send }, modelId: 'test-model' }));
    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const r = await post(base, { text: 'who is ahead', household: 'garcias', partyCode: 'DEMO' });
      expect(r.status).toBe(200);
      const j = (await r.json() as any);
      expect(j.mode).toBe('bedrock');
      expect(j.reply).toBe('Nobody has scored yet.');
      expect(j.toolCalls).toHaveLength(1);
      expect(j.toolCalls[0].name).toBe('get_leaderboard');
      expect(j.toolCalls[0].ok).toBe(true);
      expect(j.toolCalls[0].args.code).toBe('DEMO');
      expect(j.uiResource).toBeTruthy();
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
