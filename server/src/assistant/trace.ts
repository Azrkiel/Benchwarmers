import type { AssistantResponse, ToolCallTrace, UiResourcePayload } from '../shared/types.js';
import type { AssistantMcp, ToolInfo, ToolResult } from './mcpClient.js';

export type TracedCall = { trace: ToolCallTrace; result: ToolResult; ui?: UiResourcePayload };

export function toolText(result: ToolResult): string {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim();
}

export function summarize(result: ToolResult): string {
  const text = toolText(result);
  if (!text) return '(no text)';
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

export function uiResourceUri(tool: ToolInfo | undefined): string | undefined {
  const meta = tool?._meta;
  if (!meta) return undefined;
  const nested = (meta.ui as { resourceUri?: unknown } | undefined)?.resourceUri;
  if (typeof nested === 'string') return nested;
  const flat = meta['ui/resourceUri'];
  return typeof flat === 'string' ? flat : undefined;
}

export function partyCodeFrom(result: ToolResult): string | undefined {
  const code = result.structuredContent?.code;
  return typeof code === 'string' ? code : undefined;
}

export async function callTraced(
  mcp: AssistantMcp,
  tools: ToolInfo[],
  name: string,
  args: Record<string, unknown>,
): Promise<TracedCall> {
  const start = Date.now();
  let result: ToolResult;
  try {
    result = await mcp.callTool(name, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      trace: { name, args, ok: false, summary: message, ms: Date.now() - start },
      result: { isError: true, content: [{ type: 'text', text: message }] },
    };
  }
  const ms = Date.now() - start;
  const trace: ToolCallTrace = { name, args, ok: !result.isError, summary: summarize(result), ms };
  const uri = uiResourceUri(tools.find((t) => t.name === name));
  return uri
    ? { trace, result, ui: { uri, toolName: name, toolInput: args, toolResult: result } }
    : { trace, result };
}

export function buildResponse(opts: {
  reply: string;
  calls: TracedCall[];
  mode: 'offline' | 'bedrock';
  requestPartyCode?: string;
}): AssistantResponse {
  const { calls } = opts;
  const lastUi = [...calls].reverse().find((c) => c.ui)?.ui;
  let partyCode: string | undefined;
  for (const c of calls) {
    if (!c.trace.ok) continue;
    partyCode = partyCodeFrom(c.result) ?? partyCode;
  }
  partyCode ??= opts.requestPartyCode;
  return {
    reply: opts.reply,
    toolCalls: calls.map((c) => c.trace),
    ...(lastUi ? { uiResource: lastUi } : {}),
    ...(partyCode ? { partyCode } : {}),
    mode: opts.mode,
  };
}

export function logTurn(line: string): void {
  if (process.env.VITEST || process.env.ASSISTANT_LOG === '0') return;
  console.log('[assistant] ' + line);
}
