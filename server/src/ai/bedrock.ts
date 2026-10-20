import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BedrockLike = { send(cmd: unknown): Promise<any> };

export interface AiUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalLatencyMs: number;
  errors: number;
}

const usage: AiUsage = { calls: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0, errors: 0 };

export function getAiUsage(): AiUsage {
  return { ...usage };
}

export function resetAiUsage(): void {
  usage.calls = 0;
  usage.inputTokens = 0;
  usage.outputTokens = 0;
  usage.totalLatencyMs = 0;
  usage.errors = 0;
}

let defaultClient: BedrockLike | undefined;
function getDefaultClient(): BedrockLike {
  defaultClient ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return defaultClient;
}

function log(line: string): void {
  if (process.env.AI_LOG === '0' || process.env.VITEST) return;
  console.log(line);
}

/** Extract the first balanced, parseable JSON object or array from text (tolerates fences/prose). */
export function extractJson(text: string): string | undefined {
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i]!;
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') stack.push('}');
      else if (c === '[') stack.push(']');
      else if (c === '}' || c === ']') {
        if (stack.pop() !== c) break;
        if (stack.length === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
  }
  return undefined;
}

export interface ConverseJsonOptions<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  client?: BedrockLike;
}

async function sendOnce(client: BedrockLike, system: string, prompt: string, maxTokens: number): Promise<string> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  const cmd = new ConverseCommand({
    modelId,
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens, temperature: 0.7 },
  });
  const started = Date.now();
  try {
    const res = await client.send(cmd);
    const latency = Date.now() - started;
    const inTok = Number(res?.usage?.inputTokens ?? 0);
    const outTok = Number(res?.usage?.outputTokens ?? 0);
    usage.calls++;
    usage.inputTokens += inTok;
    usage.outputTokens += outTok;
    usage.totalLatencyMs += latency;
    log(`[bedrock] model=${modelId} latencyMs=${latency} inputTokens=${inTok} outputTokens=${outTok}`);
    const parts: unknown[] = res?.output?.message?.content ?? [];
    return parts
      .map((p) => (p && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join('');
  } catch (err) {
    const latency = Date.now() - started;
    usage.calls++;
    usage.errors++;
    usage.totalLatencyMs += latency;
    log(`[bedrock] model=${modelId} latencyMs=${latency} error=${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseReply<T>(reply: string, schema: z.ZodType<T>): Parsed<T> {
  const json = extractJson(reply);
  if (json === undefined) return { ok: false, error: 'no JSON object or array found in reply' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, error: `schema validation failed: ${parsed.error.message}` };
  return { ok: true, value: parsed.data };
}

export async function converseJson<T>(opts: ConverseJsonOptions<T>): Promise<T> {
  const client = opts.client ?? getDefaultClient();
  const first = parseReply(await sendOnce(client, opts.system, opts.prompt, opts.maxTokens), opts.schema);
  if (first.ok) return first.value;

  const retryPrompt =
    `${opts.prompt}\n\nYour previous reply was invalid: ${first.error}\n` +
    'Reply with valid JSON only, no prose and no markdown fences.';
  const second = parseReply(await sendOnce(client, opts.system, retryPrompt, opts.maxTokens), opts.schema);
  if (second.ok) return second.value;
  throw new Error(`Bedrock reply was not valid after retry: ${second.error}`);
}
