import type { z } from 'zod';
import { extractJson } from './bedrock.js';

export type GeminiPart = Record<string, unknown> & { text?: string; thought?: boolean };
export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };
export type GeminiRequest = {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
  toolConfig?: Record<string, unknown>;
};
export type GeminiResponse = {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};
export type GeminiLike = { generateContent(request: GeminiRequest): Promise<GeminiResponse> };

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

function positive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Only our own status messages are exposed; Google's body and network errors may contain keys. */
class GeminiError extends Error {}

function retryDelay(headers: Headers, body: unknown, now: number): number {
  const raw = headers.get('retry-after');
  let delay = raw === null ? 0 : Number(raw) * 1000;
  if (!Number.isFinite(delay)) delay = Math.max(0, Date.parse(raw!) - now) || 0;
  const error = record(body) && record(body.error) ? body.error : {};
  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (!record(detail) || typeof detail.retryDelay !== 'string') continue;
      const seconds = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay)?.[1];
      if (seconds) delay = Math.max(delay, Number(seconds) * 1000);
    }
  }
  return Math.max(0, delay);
}

function invalidKey(body: unknown): boolean {
  if (!record(body) || !record(body.error) || !Array.isArray(body.error.details)) return false;
  return body.error.details.some((d) => record(d) && d.reason === 'API_KEY_INVALID');
}

export function createGeminiClient(opts: {
  apiKeys?: string[];
  modelId?: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cooldownMs?: number;
} = {}): GeminiLike {
  const model = (opts.modelId ?? process.env.GEMINI_MODEL_ID ?? DEFAULT_GEMINI_MODEL).replace(/^models\//, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) throw new GeminiError('Invalid GEMINI_MODEL_ID');
  const configured = opts.apiKeys ?? (process.env.GEMINI_API_KEYS?.trim() || process.env.GEMINI_API_KEY || '').split(/[,\s]+/);
  const keys = [...new Set(configured.map((k) => k.trim()).filter(Boolean))]
    .map((value) => ({ value, until: 0, disabled: false, failures: 0 }));
  const fetcher = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const timeoutMs = positive(opts.timeoutMs ?? process.env.GEMINI_TIMEOUT_MS, 60000);
  const cooldownMs = positive(opts.cooldownMs ?? process.env.GEMINI_KEY_COOLDOWN_MS, 60000);
  let current = 0;

  return {
    async generateContent(request) {
      if (!keys.length) throw new GeminiError('Set GEMINI_API_KEY or GEMINI_API_KEYS in the server environment');
      const deadline = now() + timeoutMs;
      // Reserve part of the total deadline for failover if a key's attempt hangs.
      const attemptTimeoutMs = Math.max(1, Math.floor(timeoutMs / Math.min(keys.length, 2)));
      const attempted = new Set<number>();
      while (attempted.size < keys.length && now() < deadline) {
        let i = -1;
        for (let offset = 0; offset < keys.length; offset++) {
          const candidate = (current + offset) % keys.length;
          const key = keys[candidate];
          if (!attempted.has(candidate) && !key.disabled && key.until <= now()) {
            i = candidate;
            break;
          }
        }
        if (i < 0) break;
        const key = keys[i];
        attempted.add(i);
        // Thinking must leave room for the short answer, especially in the content JSON calls.
        // Minimal thinking is model-specific; Gemini 3.8 Flash rejects it.
        const supportsMinimal = /^gemini-(?:3-flash-preview|3\.(?:1|5)-flash-lite|3\.6-flash)/.test(model);
        const thinkingConfig = /^gemini-[34]/.test(model) ? { thinkingLevel: supportsMinimal ? 'MINIMAL' : 'LOW' }
          : /^gemini-2\.5-flash/.test(model) ? { thinkingBudget: 0 } : undefined;
        const body: GeminiRequest = {
          ...request,
          generationConfig: { ...(thinkingConfig ? { thinkingConfig } : {}), ...request.generationConfig },
        };
        let res: Response;
        let data: unknown;
        try {
          res = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.value },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(Math.max(1, Math.min(attemptTimeoutMs, Math.ceil(deadline - now())))),
          });
          try {
            data = await res.json();
          } catch (err) {
            if (!(err instanceof SyntaxError)) throw err;
          }
        } catch {
          key.until = now() + cooldownMs;
          current = (i + 1) % keys.length;
          continue;
        }
        if (res.ok) {
          if (!record(data)) throw new GeminiError('Gemini returned an invalid response');
          key.failures = 0;
          current = i;
          return data as GeminiResponse;
        }
        const credentials = res.status === 401 || res.status === 403 || invalidKey(data);
        const transient = res.status === 429 || res.status >= 500;
        if (!credentials && !transient) throw new GeminiError('Gemini request failed (HTTP ' + res.status + ')');
        key.disabled = credentials;
        key.failures++;
        const backoff = Math.min(cooldownMs * 2 ** Math.min(key.failures - 1, 4), 300000);
        key.until = now() + Math.max(backoff, retryDelay(res.headers, data, now()));
        current = (i + 1) % keys.length;
      }
      throw new GeminiError('Gemini keys unavailable (cooldown, rejected credentials, or request timeout); using fallback');
    },
  };
}

// One shared pool for assistant and background content; a cooled key stays cooled in both paths.
let defaultClient: GeminiLike | undefined;
export function getGeminiClient(): GeminiLike {
  return defaultClient ??= createGeminiClient();
}

/** Reject safety-blocked and truncated generations, and never include internal thought text. */
export function geminiContent(response: GeminiResponse): GeminiContent {
  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')) {
    throw new GeminiError('Gemini generation was blocked or incomplete');
  }
  if (!candidate?.content || !Array.isArray(candidate.content.parts) || !candidate.content.parts.length) {
    throw new GeminiError('Gemini response has no content');
  }
  return candidate.content;
}

export function geminiText(content: GeminiContent): string {
  return content.parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
}

export async function generateGeminiJson<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  client?: GeminiLike;
}): Promise<T> {
  const client = opts.client ?? getGeminiClient();
  let prompt = opts.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.generateContent({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens, responseMimeType: 'application/json' },
    });
    const content = geminiContent(response);
    const json = extractJson(geminiText(content));
    if (json !== undefined) {
      const parsed = opts.schema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
    }
    prompt = opts.prompt + '\nYour previous reply was invalid. Reply with valid JSON matching the requested shape, no prose or markdown.';
  }
  throw new GeminiError('Gemini reply was not valid JSON after retry');
}
