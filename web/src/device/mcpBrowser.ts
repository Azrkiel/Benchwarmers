import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export type CallToolResultLike = {
  content?: { type: string; text?: string; [k: string]: unknown }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ReadResourceResultLike = {
  contents: { uri: string; mimeType?: string; text?: string; blob?: string; [k: string]: unknown }[];
  [k: string]: unknown;
};

export type DeviceMcp = {
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResultLike>;
  readResource(uri: string): Promise<ReadResourceResultLike>;
  close(): Promise<void>;
};

export function createBrowserMcp(opts: { url?: string; token?: string } = {}): DeviceMcp {
  const url = opts.url ?? new URL('/mcp', window.location.origin).toString();
  // Demo-only: this ships the bearer token in the browser bundle (VITE_MCP_TOKEN).
  // A real host keeps the token server-side and proxies MCP calls itself.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const token = opts.token ?? env?.VITE_MCP_TOKEN ?? 'dev-token-change-me';
  let connecting: Promise<Client> | undefined;

  function connect(): Promise<Client> {
    if (!connecting) {
      const attempt = (async () => {
        const client = new Client({ name: 'benchwarmers-device', version: '0.1.0' });
        const transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        });
        try {
          await client.connect(transport);
        } catch (err) {
          await client.close().catch(() => undefined);
          throw err;
        }
        return client;
      })();
      connecting = attempt;
      // Retry on the next call after a failed connect.
      attempt.catch(() => {
        if (connecting === attempt) connecting = undefined;
      });
    }
    return connecting;
  }

  return {
    async callTool(name, args) {
      const client = await connect();
      return (await client.callTool({ name, arguments: args })) as unknown as CallToolResultLike;
    },
    async readResource(uri) {
      const client = await connect();
      return (await client.readResource({ uri })) as unknown as ReadResourceResultLike;
    },
    async close() {
      const pending = connecting;
      connecting = undefined;
      if (!pending) return;
      const client = await pending.catch(() => undefined);
      await client?.close().catch(() => undefined);
    },
  };
}

let singleton: DeviceMcp | undefined;
export function getDeviceMcp(): DeviceMcp {
  singleton ??= createBrowserMcp();
  return singleton;
}
