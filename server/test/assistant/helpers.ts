import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../src/game/store.js';
import { createApp } from '../../src/index.js';

export type TestServer = {
  base: string;
  port: number;
  store: Store;
  token: string;
  close(): Promise<void>;
};

/** Real Benchwarmers server on an ephemeral loopback port with a temp-dir store (seeded: party DEMO). */
export async function startTestServer(opts: { token?: string } = {}): Promise<TestServer> {
  const token = opts.token ?? 'test-token';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-assistant-'));
  const store = new Store({ dataFile: path.join(dir, 'store.json') });
  const savedToken = process.env.MCP_TOKEN;
  process.env.MCP_TOKEN = token;
  const app = createApp({ store });
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    store,
    token,
    async close() {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (savedToken === undefined) delete process.env.MCP_TOKEN;
      else process.env.MCP_TOKEN = savedToken;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
