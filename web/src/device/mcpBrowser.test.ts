import { afterEach, expect, it, vi } from 'vitest';

const { transports, callTool } = vi.hoisted(() => ({
  transports: [] as { url: URL; options: { requestInit?: RequestInit } }[],
  callTool: vi.fn(async () => ({ content: [] })),
}));

vi.mock('@modelcontextprotocol/client', () => ({
  Client: class {
    connect = vi.fn(async () => undefined);
    callTool = callTool;
    close = vi.fn(async () => undefined);
  },
  StreamableHTTPClientTransport: class {
    constructor(url: URL, options: { requestInit?: RequestInit }) { transports.push({ url, options }); }
  },
}));

import { createBrowserMcp } from './mcpBrowser';

afterEach(() => { transports.length = 0; vi.unstubAllEnvs(); });

it('uses the same-origin browser host without a bundled bearer token', async () => {
  vi.stubEnv('VITE_MCP_TOKEN', 'legacy-build-secret');
  const client = createBrowserMcp();
  await client.callTool('get_leaderboard', { code: 'DEMO' });
  expect(transports[0].url.toString()).toBe(new URL('/api/mcp-widget', window.location.origin).toString());
  expect(new Headers(transports[0].options.requestInit?.headers).has('Authorization')).toBe(false);
  await client.close();
});

it('allows an explicitly configured MCP endpoint and token', async () => {
  const client = createBrowserMcp({ url: 'https://host.example/mcp', token: 'explicit-token' });
  await client.callTool('get_leaderboard', { code: 'DEMO' });
  expect(transports[0].url.toString()).toBe('https://host.example/mcp');
  expect(new Headers(transports[0].options.requestInit?.headers).get('Authorization')).toBe('Bearer explicit-token');
  await client.close();
});
