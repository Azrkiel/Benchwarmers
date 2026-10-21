import type { AssistantRequest, AssistantResponse } from '../shared/types.js';
import { matchPosition } from '../mcp/match.js';
import type { AssistantMcp } from './mcpClient.js';
import { buildResponse, callTraced, logTurn, toolText } from './trace.js';

export type OfflinePlan =
  | { kind: 'tool'; tool: string; args: Record<string, unknown> }
  | { kind: 'reply'; reply: string };

const HELP_REPLY =
  'I can set up a watch party, draft players, take picks, or tell you the score, the leaderboard or the season standings. Try: draft Big Mo.';
const ASK_NAME_REPLY = "Who's picking? Say your name first, like: I'm Maya, draft Big Mo.";

const STOPWORDS = new Set([
  'who', 'what', 'when', 'where', 'why', 'how', 'he', 'she', 'we', 'they', 'you', 'it', 'i', 'me', 'my', 'everyone', 'everybody',
  'someone', 'anyone', 'ready', 'done', 'here', 'the', 'a', 'an', 'in', 'on', 'at', 'not', 'just', 'going', 'gonna', 'sure', 'so',
  'ok', 'okay', 'yes', 'no', 'now', 'back', 'up', 'out', 'there', 'good', 'fine', 'late', 'next', 'that', 'this', 'one', 'and',
  'but', 'then', 'also', 'still', 'really', 'very', 'too', 'playing', 'drafting', 'picking', 'over', 'under', 'all',
  'both', 'ahead', 'winning', 'losing', 'first', 'last', 'again', 'tonight', 'today', 'with', 'for', 'to', 'of', 'is', 'was',
]);

const TEAM_WORD = /\b(harbor|hawks?|summit|foxes|fox)\b/i;
// Football words that name the game ("the football game", "the Otters game") for setup_watch_party.
const FOOTBALL_GAME_WORD = /\b(football|gridiron|nfl|otters?|forge|riverton|ironwood)\b/i;
const TIME_WORD = /\b(tonight|today|tomorrow|(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s+night)?)\b/i;

function cleanText(s: string): string {
  return s.replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
}

function stripEnds(s: string): string {
  return s.replace(/^[\s,.;:!?"-]+/, '').replace(/[\s,.;:!?"-]+$/, '').trim();
}

function capitalize(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function asName(w: string | undefined): string | undefined {
  if (!w) return undefined;
  const lower = w.toLowerCase();
  if (!/^[a-z]{2,}$/.test(lower) || STOPWORDS.has(lower)) return undefined;
  return capitalize(w);
}

const VERBS = 'takes|picks|says|wants|drafts';

function explicitName(text: string): string | undefined {
  const patterns: RegExp[] = [
    /\b(?:i'm|im|i am|this is|it's)\s+([A-Za-z]+)/i,
    /(?:^|[,.;!?]\s*)([A-Za-z]+)\s+here\b/i,
    new RegExp(`(?:^|[,.;!?]\\s*)([A-Za-z]+)\\s+(?:${VERBS})\\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    const name = asName(m?.[1]);
    if (name) return name;
  }
  return undefined;
}

function tool(req: AssistantRequest, name: string, args: Record<string, unknown> = {}): OfflinePlan {
  return { kind: 'tool', tool: name, args: req.partyCode ? { code: req.partyCode, ...args } : args };
}

function needsMember(req: AssistantRequest, name: string | undefined, toolName: string, args: Record<string, unknown>): OfflinePlan {
  if (!name) return { kind: 'reply', reply: ASK_NAME_REPLY };
  return tool(req, toolName, { memberName: name, ...args });
}

function parseSetup(text: string): OfflinePlan {
  const m = /\bwith\s+(?:the\s+)?([^,.;!?]+)/i.exec(text);
  // "with the Sunday Crew for the football game": the crew name ends before "for".
  let crew = m ? m[1].replace(/\s+for\s+.*$/i, '').trim() : '';
  let rest = m ? text.replace(m[0], ' ') : text;
  // A trailing time phrase belongs to `when`, not the crew name.
  const trailing = new RegExp(`\\s+${TIME_WORD.source}$`, 'i').exec(crew);
  if (trailing) {
    crew = crew.slice(0, trailing.index).trim();
    rest += ` ${trailing[1]}`;
  }
  const when = TIME_WORD.exec(rest)?.[1];
  const args: Record<string, unknown> = { crewName: crew || 'Sunday Crew' };
  const gameWord = FOOTBALL_GAME_WORD.exec(text)?.[1];
  if (gameWord) args.gameTitle = gameWord;
  if (when) args.when = when;
  return { kind: 'tool', tool: 'setup_watch_party', args };
}

function parseAvailable(req: AssistantRequest, text: string): OfflinePlan {
  const args: Record<string, unknown> = {};
  // Bare "back" is left out (common in speech); "running back" is the spoken form.
  const posWord = /\b(point guards?|shooting guards?|small forwards?|power forwards?|centers?|centres?|pg|sg|sf|pf|quarterbacks?|qb|running backs?|halfbacks?|rb|wide receivers?|receivers?|wr|tight ends?|te|kickers?|k)\b/i.exec(text)?.[1];
  if (posWord) {
    const pos = matchPosition(posWord.toLowerCase().replace('centre', 'center'));
    if (pos.ok) args.position = pos.value;
  }
  const team = TEAM_WORD.exec(text)?.[1];
  if (team) args.team = team;
  return tool(req, 'list_available_players', args);
}

function parseDraft(req: AssistantRequest, text: string, explicit: string | undefined): OfflinePlan {
  const m = /\bdrafts?\b\s*(.*)$/i.exec(text);
  let player = stripEnds(m?.[1] ?? '');
  let forName: string | undefined;
  const f = /\s+for\s+([A-Za-z]+)$/i.exec(player);
  if (f) {
    forName = asName(f[1]);
    if (forName) player = stripEnds(player.slice(0, f.index));
  }
  player = player.replace(/^(?:please|for me)\s+/i, '').trim();
  const name = forName ?? explicit ?? req.speaker?.memberName;
  if (!name) return { kind: 'reply', reply: ASK_NAME_REPLY };
  if (!player) return { kind: 'reply', reply: `Who should ${name} draft? Try: draft Big Mo.` };
  return tool(req, 'draft_player', { memberName: name, player });
}

function cleanChoice(raw: string): string {
  let c = stripEnds(raw);
  c = c.replace(/\s+(?:scoring first|to score first|score first|to score)$/i, '');
  c = stripEnds(c);
  const t = /^the\s+(.+)$/i.exec(c);
  if (t && TEAM_WORD.test(t[1])) c = t[1];
  return c;
}

function parsePick(req: AssistantRequest, text: string, explicit: string | undefined): OfflinePlan | undefined {
  const self =
    /\b(?:put me down for|put me down as|i'll take|i will take|i pick|i say|i choose|i'm going with|im going with|i'll go with)\s+(.+)$/i.exec(text);
  const named = /(?:^|[,.;!?]\s*)([A-Za-z]+)\s+(?:takes|picks|says|wants)\s+(.+)$/i.exec(text);
  let choiceRaw: string | undefined;
  let name = explicit;
  if (self) choiceRaw = self[1];
  else if (named && asName(named[1])) {
    choiceRaw = named[2];
    name = asName(named[1]);
  }
  if (choiceRaw === undefined) return undefined;
  const choice = cleanChoice(choiceRaw);
  if (!choice) return undefined;
  return needsMember(req, name ?? req.speaker?.memberName, 'make_pick', { choice });
}

export function parseUtterance(req: AssistantRequest): OfflinePlan {
  const text = cleanText(req.text ?? '');
  if (!text) return { kind: 'reply', reply: HELP_REPLY };
  const l = text.toLowerCase();
  const explicit = explicitName(text);
  const known = explicit ?? req.speaker?.memberName;

  if (/\bseason\b|\bstandings\b/.test(l)) {
    const aboutMe = /\b(i|me|my|myself)\b/.test(l);
    const args: Record<string, unknown> = {};
    if (known && (aboutMe || explicit)) args.memberName = known;
    return { kind: 'tool', tool: 'get_season_standings', args };
  }
  if (/\bset ?up\b|\bcreate\b|\bhost\b/.test(l) && /\b(party|game|watch)\b/.test(l)) return parseSetup(text);
  if (/\bavailable\b|\bwho'?s (?:still )?(?:left|open)\b|\bwho is (?:still )?(?:left|open)\b|\bbest\b.*\bleft\b/.test(l)) {
    return parseAvailable(req, text);
  }
  if (/\bdrafts?\b/.test(l)) return parseDraft(req, text, explicit);
  const pick = parsePick(req, text, explicit);
  if (pick) return pick;
  if (/\b(start|begin|kick ?off|tip[- ]?off)\b/.test(l)) return tool(req, 'start_watch_party');
  if (/\bexplain\b|\bwhy did\b|\bwhat happened\b|\bwhy was\b/.test(l)) return tool(req, 'explain_last_result');
  if (/\b(score|status|clock|time left|quarter|period|question)\b/.test(l)) return tool(req, 'get_game_status');
  if (/\bleaderboard\b|\bwinning\b|\bwho'?s ahead\b|\branking/.test(l)) return tool(req, 'get_leaderboard');
  if (/\broster\b|\bmy (?:team|players|picks)\b/.test(l)) return needsMember(req, known, 'get_my_roster', {});
  return { kind: 'reply', reply: HELP_REPLY };
}

export async function runOffline(req: AssistantRequest, mcp: AssistantMcp): Promise<AssistantResponse> {
  const start = Date.now();
  const plan = parseUtterance(req);
  if (plan.kind === 'reply') {
    logTurn(`mode=offline tool=none ok=true ms=${Date.now() - start}`);
    return buildResponse({ reply: plan.reply, calls: [], mode: 'offline', requestPartyCode: req.partyCode });
  }
  try {
    const tools = await mcp.listTools();
    const call = await callTraced(mcp, tools, plan.tool, plan.args);
    const text = toolText(call.result);
    const reply = text || (call.trace.ok ? 'Done.' : "Sorry, that didn't work.");
    logTurn(`mode=offline tool=${plan.tool} ok=${call.trace.ok} ms=${Date.now() - start}`);
    return buildResponse({ reply, calls: [call], mode: 'offline', requestPartyCode: req.partyCode });
  } catch {
    logTurn(`mode=offline tool=${plan.tool} ok=false ms=${Date.now() - start}`);
    return buildResponse({
      reply: "I can't reach the game right now. Try again in a moment.",
      calls: [],
      mode: 'offline',
      requestPartyCode: req.partyCode,
    });
  }
}
