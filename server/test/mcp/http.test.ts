import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';
import { mountMcp } from '../../src/mcp/http.js';
import { BOARD_URI } from '../../src/mcp/server.js';
import { Store } from '../../src/game/store.js';

const TOKEN = 'test-token';
const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-test', version: '1.0.0' } },
};

let dir: string;
let store: Store;
let savedEnv: { MCP_TOKEN?: string; ALLOWED_HOSTS?: string };
let servers: http.Server[] = [];

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Parse a Streamable HTTP response body that may be JSON or a single SSE message. */
async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line?.slice(5).trim() ?? 'null') as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function rawPost(base: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });
}

/** Raw node:http request so a custom Host header can be sent (fetch forbids overriding it). */
function rawHttp(base: string, opts: { method: string; host?: string; headers?: Record<string, string>; body?: unknown }) {
  const url = new URL(base);
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: '/mcp',
        method: opts.method,
        headers: {
          ...(opts.host ? { host: opts.host } : {}),
          accept: 'application/json, text/event-stream',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(() => {
  savedEnv = { MCP_TOKEN: process.env.MCP_TOKEN, ALLOWED_HOSTS: process.env.ALLOWED_HOSTS };
  delete process.env.ALLOWED_HOSTS;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcp-http-'));
  store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => 1_000_000, speed: 4 });
});

afterAll(async () => {
  for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
  if (savedEnv.MCP_TOKEN === undefined) delete process.env.MCP_TOKEN;
  else process.env.MCP_TOKEN = savedEnv.MCP_TOKEN;
  if (savedEnv.ALLOWED_HOSTS === undefined) delete process.env.ALLOWED_HOSTS;
  else process.env.ALLOWED_HOSTS = savedEnv.ALLOWED_HOSTS;
  fs.rmSync(dir, { recursive: true, force: true });
});

let base: string;
beforeAll(async () => {
  const app = express();
  mountMcp(app, { store, token: TOKEN });
  base = await listen(app);
});

describe('auth', () => {
  it('rejects a missing bearer token with 401 JSON and no WWW-Authenticate', async () => {
    const res = await rawPost(base, {}, INIT);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBeNull();
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Missing or invalid bearer token', code: 'UNAUTHORIZED' });
  });

  it('rejects a wrong bearer token with 401 and no WWW-Authenticate', async () => {
    const res = await rawPost(base, { authorization: 'Bearer wrong-token' }, INIT);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBeNull();
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('rejects a non-bearer scheme', async () => {
    const res = await rawPost(base, { authorization: `Basic ${TOKEN}` }, INIT);
    expect(res.status).toBe(401);
  });

  it('applies auth to GET and DELETE too (401 without token)', async () => {
    const get = await fetch(`${base}/mcp`, { method: 'GET' });
    expect(get.status).toBe(401);
    const del = await fetch(`${base}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(401);
  });
});

describe('methods', () => {
  it('GET /mcp with token returns 405 JSON-RPC error with Allow: POST', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'GET', headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream' } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(await res.json()).toEqual({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  });

  it('DELETE /mcp with token returns 405 JSON-RPC error', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect((await res.json()) as { error: { code: number } }).toMatchObject({ error: { code: -32000 } });
  });

  it('returns a parse error for invalid JSON', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
  });
});

describe('protocol', () => {
  it('negotiates protocol version 2025-11-25 on a raw initialize', async () => {
    const res = await rawPost(base, { authorization: `Bearer ${TOKEN}` }, INIT);
    expect(res.status).toBe(200);
    const body = await readRpc(res);
    expect((body.result as { protocolVersion: string }).protocolVersion).toBe('2025-11-25');
  });

  it('connects an MCP client and lists the tools', async () => {
    const client = new Client({ name: 'http-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()?.name).toBe('benchwarmers');
      expect(transport.protocolVersion).toBe('2025-11-25');
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          'draft_player',
          'explain_last_result',
          'get_game_status',
          'get_leaderboard',
          'get_my_roster',
          'get_season_standings',
          'join_watch_party',
          'list_available_players',
          'make_pick',
          'setup_watch_party',
          'start_watch_party',
        ].sort(),
      );
    } finally {
      await client.close();
    }
  });
});

describe('host header', () => {
  it('accepts an arbitrary Host (tunnel host) when ALLOWED_HOSTS is unset', async () => {
    const res = await rawHttp(base, {
      method: 'POST',
      host: 'abc.trycloudflare.com',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: INIT,
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('2025-11-25');
  });

  it('rejects a foreign Host when allowedHosts is set, and accepts localhost', async () => {
    const app = express();
    mountMcp(app, { store, token: TOKEN, allowedHosts: ['localhost'] });
    const url = await listen(app);
    const bad = await rawHttp(url, { method: 'POST', host: 'abc.trycloudflare.com', headers: { authorization: `Bearer ${TOKEN}` }, body: INIT });
    expect(bad.status).toBe(403);
    const good = await rawHttp(url, { method: 'POST', host: 'localhost', headers: { authorization: `Bearer ${TOKEN}` }, body: INIT });
    expect(good.status).toBe(200);
  });
});

describe('prompts, rules and UI resource', () => {
  it('lists and gets the watch_party_host prompt', async () => {
    const client = new Client({ name: 'prompt-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
    try {
      const { prompts } = await client.listPrompts();
      expect(prompts.map((p) => p.name)).toContain('watch_party_host');
      const prompt = await client.getPrompt({ name: 'watch_party_host', arguments: { crewName: 'Sunday Crew' } });
      expect(prompt.messages.length).toBeGreaterThan(0);
      const text = JSON.stringify(prompt.messages);
      expect(text).toContain('setup_watch_party');
      expect(text).toContain('Sunday Crew');
      expect(text.toLowerCase()).toContain('wager');
    } finally {
      await client.close();
    }
  });

  it('reads benchwarmers://rules as markdown with the scoring table', async () => {
    const client = new Client({ name: 'rules-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
    try {
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain('benchwarmers://rules');
      const out = await client.readResource({ uri: 'benchwarmers://rules' });
      const c = out.contents[0] as { mimeType?: string; text?: string };
      expect(c.mimeType).toBe('text/markdown');
      expect(c.text).toContain('No real money');
      expect(c.text).toContain('| 3-pointer | 3 |');
      expect(c.text).toContain('| Rebound | 1.2 |');
      expect(c.text).toContain('| Turnover | -1 |');
    } finally {
      await client.close();
    }
  });

  it('reads the board UI resource with the MCP app mime type', async () => {
    const client = new Client({ name: 'ui-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
    try {
      const out = await client.readResource({ uri: BOARD_URI });
      const c = out.contents[0] as { uri: string; mimeType?: string; text?: string };
      expect(c.mimeType).toBe(RESOURCE_MIME_TYPE);
      expect(c.mimeType).toBe('text/html;profile=mcp-app');
      expect(c.text?.toLowerCase().startsWith('<!doctype html')).toBe(true);
    } finally {
      await client.close();
    }
  });
});

describe('mount through createApp', () => {
  it('serves /mcp from the real app with MCP_TOKEN and keeps /healthz working', async () => {
    const saved = process.env.MCP_TOKEN;
    process.env.MCP_TOKEN = 'app-token';
    try {
      const app = createApp({ store });
      const url = await listen(app);
      const unauth = await rawPost(url, {}, INIT);
      expect(unauth.status).toBe(401);
      const ok = await rawPost(url, { authorization: 'Bearer app-token' }, INIT);
      expect(ok.status).toBe(200);
      const health = await fetch(`${url}/healthz`);
      expect(health.status).toBe(200);
    } finally {
      if (saved === undefined) delete process.env.MCP_TOKEN;
      else process.env.MCP_TOKEN = saved;
    }
  });
});
