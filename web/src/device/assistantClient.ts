import type { AssistantRequest, AssistantResponse, ChatTurn, SpeakerHint, ToolCallTrace } from '@shared/types';

/** Most recent turns sent as history with each request. */
export const HISTORY_TURNS = 6;

const DEFAULT_CREW = 'sunday-crew';
const FALLBACK_CODE = 'DEMO';

export type DeviceTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  speaker?: SpeakerHint;
  toolCalls?: ToolCallTrace[];
  /** Any mode string the server reports (offline, gemini, ...). */
  mode?: AssistantResponse['mode'];
  error?: boolean;
};

export function buildRequest(args: {
  text: string;
  household: string;
  partyCode?: string;
  turns: DeviceTurn[];
  speaker?: SpeakerHint;
}): AssistantRequest {
  const history: ChatTurn[] = args.turns
    .filter((t) => !t.error)
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: t.text }));

  const req: AssistantRequest = { text: args.text.trim(), household: args.household };
  if (args.partyCode !== undefined) req.partyCode = args.partyCode;
  if (history.length > 0) req.history = history;
  if (args.speaker !== undefined) req.speaker = args.speaker;
  return req;
}

/** Current party code for a crew. Never throws; falls back to 'DEMO'. */
export async function resolvePartyCode(crewId = DEFAULT_CREW, fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const res = await fetchImpl(`/api/crews/${encodeURIComponent(crewId)}/current`);
    if (!res.ok) return FALLBACK_CODE;
    const body: unknown = await res.json();
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    return typeof code === 'string' && code.trim() !== '' ? code : FALLBACK_CODE;
  } catch {
    return FALLBACK_CODE;
  }
}

/** `structuredContent` of a raw MCP CallToolResult, if it is a plain object. */
export function structuredFrom(toolResult: unknown): Record<string, unknown> | undefined {
  if (typeof toolResult !== 'object' || toolResult === null) return undefined;
  const structured: unknown = (toolResult as { structuredContent?: unknown }).structuredContent;
  if (typeof structured !== 'object' || structured === null || Array.isArray(structured)) return undefined;
  return structured as Record<string, unknown>;
}
