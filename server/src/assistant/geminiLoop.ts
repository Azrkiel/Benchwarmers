import { geminiContent, geminiText, getGeminiClient, type GeminiContent, type GeminiLike, type GeminiPart } from '../ai/gemini.js';
import type { AssistantRequest, AssistantResponse } from '../shared/types.js';
import type { AssistantMcp, ToolInfo } from './mcpClient.js';
import { buildSystemPrompt, compactStructured, FINAL_INSTRUCTION, isRecord, MUTATING_TOOLS } from './context.js';
import { runOffline } from './offlineRouter.js';
import { buildResponse, callTraced, logTurn, partyCodeFrom, toolText, type TracedCall } from './trace.js';

function declarations(tools: ToolInfo[]): Record<string, unknown>[] {
  return tools.map((tool) => {
    const { $schema: _drop, ...schema } = tool.inputSchema;
    return { name: tool.name, ...(tool.description ? { description: tool.description } : {}),
      parametersJsonSchema: { ...schema, type: 'object' } };
  });
}

function history(req: AssistantRequest): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const turn of [...(req.history ?? []).slice(-6), { role: 'user' as const, text: req.text }]) {
    const text = turn.text.trim();
    if (!text || (!out.length && turn.role !== 'user')) continue;
    const role = turn.role === 'assistant' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  return out;
}

export async function runGemini(req: AssistantRequest, opts: {
  mcp: AssistantMcp;
  client?: GeminiLike;
  maxRounds?: number;
}): Promise<AssistantResponse> {
  const calls: TracedCall[] = [];
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const client = opts.client ?? getGeminiClient();
    const tools = await opts.mcp.listTools();
    const known = new Set(tools.map((t) => t.name));
    const codeTools = new Set(tools.filter((t) => isRecord(t.inputSchema.properties) && 'code' in t.inputSchema.properties).map((t) => t.name));
    const hostPrompt = await opts.mcp.getPrompt('watch_party_host', {}).catch(() => '');
    const contents = history(req);
    const maxRounds = Math.min(3, Math.max(0, opts.maxRounds ?? 3));

    const generate = async (final = false) => {
      const response = await client.generateContent({
        systemInstruction: { parts: [{ text: buildSystemPrompt(hostPrompt, req) }] },
        contents: structuredClone(contents),
        tools: [{ functionDeclarations: declarations(tools) }],
        toolConfig: { functionCallingConfig: { mode: final ? 'NONE' : 'AUTO' } },
        generationConfig: { maxOutputTokens: 1024 },
      });
      inputTokens += Number(response.usageMetadata?.promptTokenCount ?? 0);
      outputTokens += Number(response.usageMetadata?.candidatesTokenCount ?? 0) + Number(response.usageMetadata?.thoughtsTokenCount ?? 0);
      return geminiContent(response);
    };

    let finalText = '';
    for (let round = 0; round <= maxRounds; round++) {
      const final = round === maxRounds;
      if (final) contents[contents.length - 1].parts.push({ text: FINAL_INSTRUCTION });
      const content = await generate(final);
      const functions = content.parts.filter((p) => !p.thought && p.functionCall !== undefined);
      if (!functions.length || final) {
        finalText = geminiText(content);
        break;
      }
      // Preserve every part and thought signature exactly as Google returned it.
      contents.push({ ...content, role: 'model' });
      const results: GeminiPart[] = [];
      for (const part of functions) {
        const fn = part.functionCall;
        if (!isRecord(fn) || typeof fn.name !== 'string') throw new Error('Malformed Gemini function call');
        const args = isRecord(fn.args) ? { ...fn.args } : {};
        if (codeTools.has(fn.name) && (args.code === undefined || args.code === null || args.code === '')) {
          const previous = [...calls].reverse().find((c) => c.trace.ok && partyCodeFrom(c.result));
          const code = (previous && partyCodeFrom(previous.result)) ?? req.partyCode;
          if (code) args.code = code;
        }
        const call: TracedCall = known.has(fn.name)
          ? await callTraced(opts.mcp, tools, fn.name, args)
          : {
            trace: { name: fn.name, args, ok: false, summary: 'Unknown tool', ms: 0 },
            result: { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] },
          };
        calls.push(call);
        results.push({
          functionResponse: {
            ...(typeof fn.id === 'string' ? { id: fn.id } : {}),
            name: fn.name,
            response: {
              ...(call.result.structuredContent ? compactStructured(call.result.structuredContent) : {}),
              text: toolText(call.result) || '(no text)',
              ok: !call.result.isError,
            },
          },
        });
      }
      contents.push({ role: 'user', parts: results });
    }
    const last = calls[calls.length - 1];
    const reply = finalText || (last ? toolText(last.result) || 'Done.' : "Sorry, I didn't catch that.");
    logTurn('mode=gemini tools=' + calls.length + ' inputTokens=' + inputTokens + ' outputTokens=' + outputTokens + ' ms=' + (Date.now() - started));
    return buildResponse({ reply, calls, mode: 'gemini', requestPartyCode: req.partyCode });
  } catch {
    // Never echo raw transport errors, which may contain credentials.
    if (calls.some((c) => c.trace.ok && MUTATING_TOOLS.has(c.trace.name))) {
      logTurn('mode=gemini unavailable; answering from completed tool results');
      return buildResponse({ reply: toolText(calls[calls.length - 1].result) || 'Done.', calls, mode: 'gemini', requestPartyCode: req.partyCode });
    }
    logTurn('mode=gemini unavailable; falling back to offline');
    return runOffline(req, opts.mcp);
  }
}
