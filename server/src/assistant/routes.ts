import express from 'express';
import { z } from 'zod';
import type { ApiError, AssistantRequest, AssistantResponse } from '../shared/types.js';
import { runGemini } from './geminiLoop.js';
import type { GeminiLike } from '../ai/gemini.js';
import { createMcpClient, type AssistantMcp } from './mcpClient.js';
import { runOffline } from './offlineRouter.js';
import { logTurn } from './trace.js';

export type AssistantRouterOptions = {
  token?: string;
  mode?: AssistantResponse['mode'];
  mcp?: AssistantMcp;
  gemini?: GeminiLike;
};

export const assistantRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  household: z.string().min(1).max(64),
  partyCode: z.string().min(1).max(16).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }))
    .max(50)
    .optional(),
  speaker: z
    .object({
      memberName: z.string().min(1).max(64),
      confidence: z.number().min(0).max(1),
      source: z.enum(['voice-id', 'screen']),
    })
    .optional(),
}) as z.ZodType<AssistantRequest>;

function badRequest(res: express.Response, error: string): void {
  const body: ApiError = { error, code: 'BAD_REQUEST' };
  res.status(400).json(body);
}

export function createAssistantRouter(opts: AssistantRouterOptions = {}): express.Router {
  const router = express.Router();
  const token = opts.token ?? process.env.MCP_TOKEN ?? 'dev-token-change-me';
  const clients = new Map<number, AssistantMcp>();

  function mcpFor(port: number): AssistantMcp {
    if (opts.mcp) return opts.mcp;
    let c = clients.get(port);
    if (!c) {
      c = createMcpClient({ url: `http://127.0.0.1:${port}/mcp`, token });
      clients.set(port, c);
    }
    return c;
  }

  router.post('/api/assistant', express.json({ limit: '100kb' }));

  router.post('/api/assistant', async (req, res) => {
    const parsed = assistantRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.join('.') || '(body)';
      badRequest(res, `Invalid assistant request: ${where}: ${issue?.message ?? 'invalid'}`);
      return;
    }
    const body = parsed.data;
    const configured = process.env.ASSISTANT_MODE?.toLowerCase();
    const mode = opts.mode ?? (configured === 'gemini' ? configured : 'offline');
    const start = Date.now();
    try {
      const mcp = mcpFor(req.socket.localPort ?? 0);
      const response: AssistantResponse =
        mode === 'gemini'
          ? await runGemini(body, { mcp, client: opts.gemini })
          : await runOffline(body, mcp);
      logTurn(`route mode=${mode} result=${response.mode} tools=${response.toolCalls.length} ms=${Date.now() - start}`);
      res.json(response);
    } catch (err) {
      console.error('[assistant] turn failed', err);
      const e: ApiError = { error: 'Something went wrong.', code: 'INTERNAL' };
      res.status(500).json(e);
    }
  });

  router.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path !== '/api/assistant') return next(err);
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') return badRequest(res, 'That request body was not valid JSON.');
    if (type === 'entity.too.large') return badRequest(res, 'That request body is too large.');
    return next(err);
  });

  return router;
}
