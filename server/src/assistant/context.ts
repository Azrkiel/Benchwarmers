import type { AssistantRequest } from '../shared/types.js';

export const FINAL_INSTRUCTION = 'Answer now in one or two short spoken sentences without calling more tools.';
/** Never re-plan a turn offline after one of these completed successfully. */
export const MUTATING_TOOLS = new Set(['setup_watch_party', 'join_watch_party', 'start_watch_party', 'draft_player', 'make_pick']);

export function buildSystemPrompt(hostPrompt: string, req: AssistantRequest): string {
  const lines: string[] = [];
  if (hostPrompt.trim()) lines.push(hostPrompt.trim(), '');
  lines.push('Household id: ' + req.household + '.');
  if (req.partyCode) lines.push('Use code ' + req.partyCode + ' for tool calls.');
  if (req.speaker) lines.push('The speaker is ' + req.speaker.memberName + ' (' + (req.speaker.source === 'voice-id' ? 'voice ID' : 'on-screen pick') + ').');
  else lines.push("If a tool needs a person's name and you don't know who is speaking, ask: Who's picking?");
  lines.push('Voice rules: reply in one to three short spoken sentences. No markdown, no lists. Never use betting language.');
  return lines.join('\n');
}

export function compactStructured(sc: Record<string, unknown>): Record<string, unknown> {
  const { state: _s, season: _se, ...rest } = sc;
  if (JSON.stringify(rest).length <= 4096) return rest;
  const small: Record<string, unknown> = {};
  for (const k of ['view', 'code']) if (k in rest) small[k] = rest[k];
  return small;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
