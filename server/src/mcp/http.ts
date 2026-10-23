// Stateless Streamable HTTP endpoint at /mcp. Mounted into the existing Express app (no createMcpExpressApp:
// its localhost default turns on DNS-rebinding checks that would block tunnel hosts).
import crypto from 'node:crypto';
import express from 'express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { hostHeaderValidation } from '@modelcontextprotocol/express';
import type { Store } from '../game/store.js';
import { createServer } from './server.js';
import type { RoomStore } from '../room/store.js';

export type MountMcpOptions = { store: Store; roomStore?: RoomStore; token?: string; allowedHosts?: string[] };

const DEFAULT_TOKEN = 'dev-token-change-me';

function allowedHostsFromEnv(): string[] | undefined {
  const raw = process.env.ALLOWED_HOSTS?.trim();
  if (!raw) return undefined;
  const hosts = raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hosts.length ? hosts : undefined;
}

/** Constant-time bearer check. Hashing first makes the buffers equal length. */
function bearerMatches(header: string | undefined, token: string): boolean {
  const m = header?.match(/^bearer\s+(.+)$/i);
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1].trim()).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

const jsonRpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * Always send /mcp responses with chunked framing (never Content-Length).
 * Avast Web Shield (wsc_proxy) intercepts loopback HTTP on paths ending in "/mcp" and rewrites
 * Content-Length responses into "transfer-encoding: chunked" WITHOUT chunk framing, which breaks
 * every client (HPE_INVALID_CHUNK_SIZE, or a hang on empty 202s). Responses that are already chunked
 * pass through intact. Chunked encoding is valid HTTP/1.1, so this is harmless elsewhere.
 * See docs/FRICTION_LOG.md.
 */
const forceChunked: express.RequestHandler = (_req, res, next) => {
  res.removeHeader('Content-Length'); // marks the length as removed, so Node falls back to chunked
  const setHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) =>
    name.toLowerCase() === 'content-length' ? res : setHeader(name, value)) as typeof res.setHeader;
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
  res.writeHead = ((...args: unknown[]) => {
    const i = typeof args[1] === 'string' ? 2 : 1;
    const headers = args[i];
    if (Array.isArray(headers)) {
      const kept: unknown[] = [];
      for (let k = 0; k < headers.length; k += 2) {
        if (String(headers[k]).toLowerCase() !== 'content-length') kept.push(headers[k], headers[k + 1]);
      }
      args[i] = kept;
    } else if (headers && typeof headers === 'object') {
      args[i] = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-length'));
    }
    return writeHead(...args);
  }) as typeof res.writeHead;
  next();
};

export function mountMcp(app: express.Express, opts: MountMcpOptions): void {
  const { store } = opts;
  const token = opts.token ?? process.env.MCP_TOKEN ?? DEFAULT_TOKEN;
  const allowedHosts = opts.allowedHosts ?? allowedHostsFromEnv();

  const middleware: express.RequestHandler[] = [forceChunked];
  if (allowedHosts?.length) middleware.push(hostHeaderValidation(allowedHosts) as express.RequestHandler);
  middleware.push((req, res, next) => {
    if (bearerMatches(req.headers.authorization, token)) return next();
    res.status(401).json({ error: 'Missing or invalid bearer token', code: 'UNAUTHORIZED' });
  });
  const jsonBody = express.json({ limit: '1mb' });
  middleware.push((req, res, next) => {
    jsonBody(req, res, (err?: unknown) => {
      if (err) {
        res.status(400).json(jsonRpcError(-32700, 'Parse error'));
        return;
      }
      next();
    });
  });

  const handler: express.RequestHandler = async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json(jsonRpcError(-32000, 'Method not allowed.'));
      return;
    }
    try {
      const server = createServer(store, opts.roomStore);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed', err);
      if (!res.headersSent) res.status(500).json(jsonRpcError(-32603, 'Internal server error'));
    }
  };

  app.all('/mcp', ...middleware, handler);

  // Our public demo host forwards into the same authenticated MCP handler in-process.
  // The browser never receives the server bearer token; room credentials still apply.
  app.all('/api/mcp-widget', (req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      let sameOrigin = false;
      try {
        const url = new URL(origin);
        // Fly terminates TLS before forwarding to Express over HTTP.
        const protocol = req.get('x-forwarded-proto') ?? req.protocol;
        sameOrigin = (protocol === 'http' || protocol === 'https') && url.origin === `${protocol}://${req.get('host')}`;
      } catch { /* Opaque or malformed origins cannot use the browser host. */ }
      if (!sameOrigin) {
        res.status(403).json({ error: 'Browser MCP host requires the same origin', code: 'FORBIDDEN' });
        return;
      }
    }
    req.headers.authorization = `Bearer ${token}`;
    next();
  }, ...middleware, handler);
}
