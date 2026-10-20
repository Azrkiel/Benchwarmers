import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { BedrockLike } from '../ai/bedrock.js';
import type { AssistantRequest, AssistantResponse } from '../shared/types.js';
import type { AssistantMcp, ToolInfo } from './mcpClient.js';
import { runOffline } from './offlineRouter.js';
import { buildResponse, callTraced, logTurn, partyCodeFrom, toolText, type TracedCall } from './trace.js';

export type BedrockLoopOptions = {
  mcp: AssistantMcp;
  /** Injectable; default is a lazily created BedrockRuntimeClient. */
  client?: BedrockLike;
  /** Default process.env.BEDROCK_MODEL_ID. */
  modelId?: string;
  /** Max tool rounds before forcing a final answer. Default 3. */
  maxRounds?: number;
};

type ToolSpec = { toolSpec: { name: string; description?: string; inputSchema: { json: Record<string, unknown> } } };
type ContentBlock = Record<string, unknown>;
type Message = { role: 'user' | 'assistant'; content: ContentBlock[] };

const FINAL_INSTRUCTION = 'Answer now in one or two short spoken sentences without calling more tools.';
const MAX_STRUCTURED_BYTES = 4096;

let defaultClient: BedrockLike | undefined;
function getDefaultClient(): BedrockLike {
  defaultClient ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return defaultClient;
}

export function toToolConfig(tools: ToolInfo[]): { tools: ToolSpec[] } {
  return {
    tools: tools.map((t) => {
      const { $schema: _drop, ...rest } = (t.inputSchema ?? {}) as Record<string, unknown>;
      void _drop;
      return {
        toolSpec: {
          name: t.name,
          ...(t.description ? { description: t.description } : {}),
          inputSchema: { json: { ...rest, type: 'object' } },
        },
      };
    }),
  };
}

export function buildSystemPrompt(hostPrompt: string, req: AssistantRequest): string {
  const lines: string[] = [];
  if (hostPrompt.trim()) lines.push(hostPrompt.trim(), '');
  lines.push(`Household id: ${req.household}.`);
  if (req.partyCode) lines.push(`Use code ${req.partyCode} for tool calls.`);
  if (req.speaker) lines.push(`The speaker is ${req.speaker.memberName} (${req.speaker.source === 'voice-id' ? 'voice ID' : 'on-screen pick'}).`);
  else lines.push("If a tool needs a person's name and you don't know who is speaking, ask: Who's picking?");
  lines.push('Voice rules: reply in one to three short spoken sentences. No markdown, no lists. Never use betting language.');
  return lines.join('\n');
}

function buildMessages(req: AssistantRequest): Message[] {
  const out: Message[] = [];
  const push = (role: 'user' | 'assistant', text: string) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push({ text });
    else out.push({ role, content: [{ text }] });
  };
  for (const turn of (req.history ?? []).slice(-6)) {
    const text = (turn.text ?? '').trim();
    if (!text) continue;
    if (out.length === 0 && turn.role !== 'user') continue;
    push(turn.role, text);
  }
  push('user', req.text);
  return out;
}

function compactStructured(sc: Record<string, unknown>): Record<string, unknown> {
  const { state: _s, season: _se, ...rest } = sc;
  void _s;
  void _se;
  if (JSON.stringify(rest).length <= MAX_STRUCTURED_BYTES) return rest;
  const small: Record<string, unknown> = {};
  for (const k of ['view', 'code']) if (k in rest) small[k] = rest[k];
  return small;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class MalformedResponse extends Error {}

export async function runBedrock(req: AssistantRequest, opts: BedrockLoopOptions): Promise<AssistantResponse> {
  const started = Date.now();
  const maxRounds = opts.maxRounds ?? 3;
  const modelId = opts.modelId ?? process.env.BEDROCK_MODEL_ID;
  const calls: TracedCall[] = [];
  let converseCalls = 0;
  let inTok = 0;
  let outTok = 0;
  let rounds = 0;

  try {
    if (!modelId) throw new Error('BEDROCK_MODEL_ID not set');
    const tools = await opts.mcp.listTools();
    const hostPrompt = await opts.mcp.getPrompt('watch_party_host', {}).catch(() => '');
    const system = buildSystemPrompt(hostPrompt, req);
    const toolConfig = toToolConfig(tools);
    const client = opts.client ?? getDefaultClient();
    const messages = buildMessages(req);
    const codeTools = new Set(
      tools.filter((t) => isRecord(t.inputSchema?.properties) && 'code' in (t.inputSchema.properties as object)).map((t) => t.name),
    );

    const converse = async (msgs: Message[]) => {
      const cmd = new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: msgs as never,
        toolConfig: toolConfig as never,
        inferenceConfig: { maxTokens: 400, temperature: 0.3 },
      });
      converseCalls++;
      const res = await client.send(cmd);
      inTok += Number(res?.usage?.inputTokens ?? 0);
      outTok += Number(res?.usage?.outputTokens ?? 0);
      const content: unknown = res?.output?.message?.content;
      if (!Array.isArray(content)) throw new MalformedResponse('Bedrock response has no message content');
      const blocks = content as ContentBlock[];
      const toolUses = blocks.filter((b) => isRecord(b) && isRecord(b.toolUse)).map((b) => b.toolUse as Record<string, unknown>);
      if (res?.stopReason === 'tool_use' && toolUses.length === 0) throw new MalformedResponse('stopReason tool_use without toolUse');
      const text = blocks
        .map((b) => (isRecord(b) && typeof b.text === 'string' ? b.text : ''))
        .join('')
        .trim();
      return { blocks, toolUses, text };
    };

    let finalText = '';
    let done = false;
    while (rounds < maxRounds) {
      const r = await converse(messages.slice());
      if (r.toolUses.length === 0) {
        finalText = r.text;
        done = true;
        break;
      }
      messages.push({ role: 'assistant', content: r.blocks });
      const results: ContentBlock[] = [];
      for (const tu of r.toolUses) {
        if (typeof tu.toolUseId !== 'string' || typeof tu.name !== 'string') throw new MalformedResponse('malformed toolUse block');
        const input: Record<string, unknown> = isRecord(tu.input) ? { ...tu.input } : {};
        if (codeTools.has(tu.name) && (input.code === undefined || input.code === null || input.code === '')) {
          const known = [...calls].reverse().find((c) => c.trace.ok && partyCodeFrom(c.result))?.result;
          const code = (known && partyCodeFrom(known)) ?? req.partyCode;
          if (code) input.code = code;
        }
        const call = await callTraced(opts.mcp, tools, tu.name, input);
        calls.push(call);
        const sc = call.result.structuredContent;
        results.push({
          toolResult: {
            toolUseId: tu.toolUseId,
            content: [{ text: toolText(call.result) || '(no text)' }, ...(sc ? [{ json: compactStructured(sc) }] : [])],
            status: call.result.isError ? 'error' : 'success',
          },
        });
      }
      messages.push({ role: 'user', content: results });
      rounds++;
    }
    if (!done) {
      const last = messages[messages.length - 1];
      const forced = [...messages.slice(0, -1), { role: last.role, content: [...last.content, { text: FINAL_INSTRUCTION }] }];
      finalText = (await converse(forced)).text; // any toolUse in this reply is ignored
    }

    const lastCall = calls[calls.length - 1];
    const reply = finalText || (lastCall ? toolText(lastCall.result) || 'Done.' : "Sorry, I didn't catch that.");
    const response = buildResponse({ reply, calls, mode: 'bedrock', requestPartyCode: req.partyCode });
    logTurn(
      `mode=bedrock rounds=${rounds} tools=[${calls.map((c) => c.trace.name).join(',')}] converseCalls=${converseCalls} inputTokens=${inTok} outputTokens=${outTok} ms=${Date.now() - started}`,
    );
    return response;
  } catch (err) {
    // Tool calls already made this turn are discarded: the offline router re-plans from the raw
    // utterance and its response only carries its own calls.
    logTurn(
      `mode=bedrock error=${err instanceof Error ? err.message : String(err)} rounds=${rounds} converseCalls=${converseCalls} ms=${Date.now() - started}; falling back to offline`,
    );
    return runOffline(req, opts.mcp);
  }
}
