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
  const url = opts.url ?? new URL('/api/mcp-widget', window.location.origin).toString();
  let connecting: Promise<Client> | undefined;

  function connect(): Promise<Client> {
    if (!connecting) {
      const attempt = (async () => {
        const client = new Client({ name: 'benchwarmers-device', version: '0.1.0' });
        const transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: opts.token ? { headers: { Authorization: `Bearer ${opts.token}` } } : undefined,
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
