import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

export type ToolResult = {
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export interface AssistantMcp {
  /** tools/list, cached after the first successful call. */
  listTools(): Promise<ToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Text of all prompt messages joined by newline; cached per name+args. */
  getPrompt(name: string, args?: Record<string, string>): Promise<string>;
  close(): Promise<void>;
}

export function createMcpClient(opts: { url: string; token: string; clientName?: string }): AssistantMcp {
  let connecting: Promise<Client> | undefined;
  let toolsCache: ToolInfo[] | undefined;
  const promptCache = new Map<string, string>();

  function connect(): Promise<Client> {
    if (!connecting) {
      const attempt = (async () => {
        const client = new Client({ name: opts.clientName ?? 'benchwarmers-assistant', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
          requestInit: { headers: { Authorization: `Bearer ${opts.token}` } },
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
      attempt.catch(() => {
        if (connecting === attempt) connecting = undefined;
      });
    }
    return connecting;
  }

  return {
    async listTools() {
      if (toolsCache) return toolsCache;
      const client = await connect();
      const all: ToolInfo[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        all.push(...(page.tools as unknown as ToolInfo[]));
        cursor = page.nextCursor || undefined;
      } while (cursor);
      toolsCache = all;
      return all;
    },

    async callTool(name, args) {
      const client = await connect();
      return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
    },

    async getPrompt(name, args) {
      const key = `${name}\u0000${JSON.stringify(args ?? {})}`;
      const hit = promptCache.get(key);
      if (hit !== undefined) return hit;
      const client = await connect();
      const res = await client.getPrompt({ name, ...(args ? { arguments: args } : {}) });
      const text = res.messages
        .map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .filter((t) => t.length > 0)
        .join('\n');
      promptCache.set(key, text);
      return text;
    },

    async close() {
      const pending = connecting;
      connecting = undefined;
      toolsCache = undefined;
      promptCache.clear();
      if (!pending) return;
      try {
        const client = await pending;
        await client.close();
      } catch {
        /* never connected */
      }
    },
  };
}
