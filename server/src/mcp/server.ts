// MCP server factory: tools, prompt, resources. One fresh McpServer per HTTP request (stateless).
import fs from 'node:fs/promises';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { GameError, playerLabel } from '../game/engine.js';
import { GAMES } from '../game/games.js';
import type { Store } from '../game/store.js';
import type { PartyStateResponse, WatchParty } from '../shared/types.js';
import { ROSTER_SIZE } from '../shared/types.js';
import { matchCrew, matchGame, matchHousehold, matchMember, type MatchResult } from './match.js';
import { rulesMarkdown } from './rules.js';

export const BOARD_URI = 'ui://benchwarmers/board.html';
export const DEFAULT_CREW_ID = 'sunday-crew';
export const RULES_URI = 'benchwarmers://rules';

const WIDGET_URL = new URL('./widget/dist/benchwarmers.html', import.meta.url);
const WIDGET_FALLBACK = '<!doctype html><html><body><p>Widget not built. Run npm run build:widget -w server.</p></body></html>';
const GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.';

// ---------- result helpers ----------

/** A user-facing failure. wrap() turns it into a friendly tool error. */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string = 'BAD_REQUEST',
    readonly options?: string[],
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export function ok(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

export function fail(message: string, extra?: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message, ...extra },
  };
}

/** Run a tool body; convert known errors to friendly tool errors. Never throws. */
export async function wrap(fn: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GameError) {
      return fail(err.message, { errorCode: err.code, ...(err.alternatives ? { alternatives: err.alternatives } : {}) });
    }
    if (err instanceof ToolError) {
      return fail(err.message, { errorCode: err.code, ...(err.options ? { options: err.options } : {}) });
    }
    console.error('[mcp] tool failed', err);
    return fail(GENERIC_ERROR, { errorCode: 'INTERNAL' });
  }
}

/** Unwrap a match result or throw a ToolError with its message and options. */
export function unwrapMatch<T>(r: MatchResult<T>): T {
  if (r.ok) return r.value;
  throw new ToolError(r.message, r.code, r.options);
}

// ---------- lookups ----------

/** Party code from input (uppercased, must exist) or the Sunday Crew's current party. */
export function resolveCode(store: Store, code?: string): string {
  const given = code?.trim();
  if (given) {
    const c = given.toUpperCase();
    if (!store.getParty(c)) throw new ToolError(`I couldn't find a watch party with code ${c}.`, 'NOT_FOUND');
    return c;
  }
  const current = store.getCurrentPartyCode(DEFAULT_CREW_ID);
  if (!current) throw new ToolError("There's no watch party yet. Say: set up a watch party with the Sunday Crew.", 'NOT_FOUND');
  return current;
}

export type MemberRef = { memberId: string; name: string; household: string; householdId: string };

export function resolveMember(store: Store, code: string, memberName: string): MemberRef {
  const members = store.partyMembers(code).map((m) => ({
    memberId: m.memberId,
    name: m.name,
    household: m.household,
    householdId: m.householdId,
  }));
  return unwrapMatch(matchMember(memberName, members));
}

const joinNames = (names: string[]): string => {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** Short team name for speech: "Harbor Hawks" -> "Hawks". */
const nickOf = (name: string): string => name.split(' ').pop() ?? name;

const secondsOf = (real: number | undefined): number => Math.max(1, Math.round(real ?? 0));

// ---------- views ----------

function householdViews(state: PartyStateResponse) {
  return state.households.map((h) => ({
    id: h.id,
    name: h.name,
    city: h.city,
    members: h.members.map((m) => m.name),
  }));
}

function activePropView(state: PartyStateResponse) {
  const p = state.activeProp;
  if (!p) return undefined;
  return {
    id: p.id,
    question: p.question,
    options: p.options.map((o) => o.label),
    secondsToLock: secondsOf(p.realSecondsToLock),
  };
}

// ---------- server ----------

export function createServer(store: Store): McpServer {
  const server = new McpServer(
    { name: 'benchwarmers', version: '0.1.0' },
    {
      instructions:
        'Benchwarmers runs a one-night fantasy draft and live pick-em for a watch party. ' +
        'Tools: setup_watch_party (start a party for a crew), join_watch_party (add a household), ' +
        'start_watch_party (tip off, fill empty slots), get_game_status (score, clock, open question), ' +
        "explain_last_result (last settled question), get_my_roster (a person's players and points). " +
        "The party code is optional; it defaults to the Sunday Crew's current party. Free to play, no real money.",
    },
  );

  const codeField = z
    .string()
    .optional()
    .describe("4-letter party code. Optional: defaults to the crew's current watch party.");

  server.registerTool(
    'setup_watch_party',
    {
      title: 'Set up a watch party',
      description:
        'Use when someone wants to start, host or set up a watch party, or invite a crew to a game. ' +
        'Examples: "Set up a watch party for Sunday\'s game with the Seattle crew", "Start a party with the Sunday Crew". ' +
        'Creates the party, invites the crew households and returns the party code.',
      inputSchema: z.object({
        crewName: z.string().describe('Crew name or a household city, e.g. "Sunday Crew" or "the Seattle crew".'),
        gameTitle: z.string().optional().describe('Game to watch, e.g. "Harbor Hawks vs. Summit Foxes". Optional.'),
        when: z.string().optional().describe('When the game is, e.g. "Sunday night". Optional.'),
      }),
    },
    async ({ crewName, gameTitle, when }) =>
      wrap(() => {
        const crew = unwrapMatch(matchCrew(crewName, store.listCrews(), store.listHouseholds()));
        const game = unwrapMatch(matchGame(gameTitle, Object.values(GAMES)));
        const party = store.createParty({ crewId: crew.id, gameId: game.id });
        const state = store.getState(party.code);
        const households = householdViews(state);
        const first = state.props[0];
        const firstProp = first ? { id: first.id, question: first.question, options: first.options.map((o) => o.label) } : undefined;
        const nextSteps = [`Draft ${ROSTER_SIZE} players each. Say: draft Big Mo.`, 'Say: start the party when everyone is ready.'];
        const invited = households.map((h) => `${h.name} in ${h.city}`);
        const people = households.flatMap((h) => h.members);
        const parts = [
          `Your watch party for ${game.title}${when ? ` for ${when}` : ''} is set. The code is ${party.code}.`,
          `I invited ${joinNames(invited)}: ${joinNames(people)}.`,
          `Everyone drafts ${ROSTER_SIZE} players, then I'll open the first question${firstProp ? `: ${firstProp.question}` : '.'}`,
          "Say 'draft Big Mo' to start, or 'start the party' when everyone's ready.",
        ];
        return ok(parts.join(' '), {
          code: party.code,
          partyId: party.id,
          crew: { id: crew.id, name: crew.name },
          game: { id: game.id, title: game.title },
          ...(when ? { when } : {}),
          households,
          ...(firstProp ? { firstProp } : {}),
          nextSteps,
        });
      }),
  );

  server.registerTool(
    'join_watch_party',
    {
      title: 'Join a household to a party',
      description:
        'Use when a household wants to join an existing watch party. ' +
        'Examples: "Add Sam\'s Place to the party", "The Garcias are joining the watch party".',
      inputSchema: z.object({
        code: codeField,
        householdName: z.string().describe('Household name or city, e.g. "The Garcias" or "Sam\'s Place".'),
      }),
    },
    async ({ code, householdName }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const household = unwrapMatch(matchHousehold(householdName, store.listHouseholds()));
        const party: WatchParty = store.joinParty(partyCode, household.id);
        const n = party.householdIds.length;
        const verb = household.name.startsWith('The ') ? 'are' : 'is';
        return ok(`${household.name} ${verb} in. ${n} households are in party ${partyCode}.`, {
          code: partyCode,
          household: { id: household.id, name: household.name, city: household.city },
          householdIds: [...party.householdIds],
        });
      }),
  );

  server.registerTool(
    'start_watch_party',
    {
      title: 'Start the watch party',
      description:
        'Use when everyone is ready and the game should tip off. Closes the draft, fills empty roster slots from the bench, ' +
        'and opens the first question. Examples: "Start the party", "Tip off", "We\'re ready, start the game".',
      inputSchema: z.object({ code: codeField }),
    },
    async ({ code }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        store.start(partyCode);
        const state = store.getState(partyCode);
        const autoFilled = state.draftBoard
          .filter((e) => e.auto && e.ownerName)
          .map((e) => ({ memberName: e.ownerName as string, playerName: playerLabel(e.player) }));
        const n = autoFilled.length;
        const active = activePropView(state);
        const parts = [n === 0 ? 'Tip-off! Everyone had a full roster.' : `Tip-off! The bench filled in ${n} ${n === 1 ? 'player' : 'players'}.`];
        if (active) parts.push(`First up: ${active.question} You have about ${active.secondsToLock} seconds.`);
        return ok(parts.join(' '), {
          code: partyCode,
          status: state.party.status,
          autoFilled,
          ...(active ? { activeProp: active } : {}),
        });
      }),
  );

  server.registerTool(
    'get_game_status',
    {
      title: 'Get the game status',
      description:
        'Use when someone asks for the score, the clock, what just happened, or the open question. ' +
        'Examples: "What\'s the score?", "How are the Hawks doing?", "What\'s the question right now?".',
      inputSchema: z.object({ code: codeField }),
    },
    async ({ code }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const state = store.getState(partyCode);
        const { home, away } = state.game;
        const score = {
          home: { name: home.name, short: home.short, score: home.score },
          away: { name: away.name, short: away.short, score: away.score },
        };
        const lastPlays = state.recentEvents.slice(0, 3).map((e) => e.text);
        const active = activePropView(state);
        const scoreLine = `${nickOf(home.name)} ${home.score}, ${nickOf(away.name)} ${away.score}`;
        const content = {
          code: partyCode,
          status: state.party.status,
          score,
          clock: state.game.clock,
          period: state.game.period,
          lastPlays,
          ...(active ? { activeProp: active } : {}),
        };

        if (state.party.status === 'scheduled' || state.party.status === 'drafting') {
          return ok("We're still drafting. Say start the party when everyone has three players.", content);
        }
        if (state.party.status === 'final') {
          return ok(`Final: ${scoreLine}.`, content);
        }
        const parts = [`${scoreLine}, ${state.game.clock}.`];
        if (lastPlays[0]) parts.push(`Latest: ${lastPlays[0]}`);
        if (active) parts.push(`Open question: ${active.question} Locks in about ${active.secondsToLock} seconds.`);
        return ok(parts.join(' '), content);
      }),
  );

  server.registerTool(
    'explain_last_result',
    {
      title: 'Explain the last result',
      description:
        'Use when someone asks what the last answer was, why it went that way, or who got the last question right. ' +
        'Examples: "What was the last answer?", "Who got that one right?", "Why did that happen?".',
      inputSchema: z.object({ code: codeField }),
    },
    async ({ code }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const state = store.getState(partyCode);
        const prop = state.lastResolvedProp;
        if (!prop) {
          return ok('No question has been settled yet.', { code: partyCode, prop: null, correctOption: null, winners: [] });
        }
        const correct = prop.options.find((o) => o.id === prop.correctOptionId);
        const winners = state.picks.filter((p) => p.propId === prop.id && p.correct === true).map((p) => p.memberName);
        const parts: string[] = [prop.question];
        parts.push(correct ? `The answer was ${correct.label}.` : 'That question was voided.');
        if (prop.explanation) parts.push(prop.explanation);
        if (state.picks.some((p) => p.propId === prop.id)) {
          parts.push(winners.length ? `Got it right: ${joinNames(winners)}.` : 'Nobody got that one right.');
        }
        return ok(parts.join(' '), {
          code: partyCode,
          prop: { id: prop.id, question: prop.question },
          correctOption: correct ? { id: correct.id, label: correct.label } : null,
          ...(prop.explanation ? { explanation: prop.explanation } : {}),
          winners,
        });
      }),
  );

  server.registerTool(
    'get_my_roster',
    {
      title: 'Get my roster',
      description:
        "Use when someone asks about their own players, points or rank tonight. " +
        'Examples: "How are my players doing?", "What do I have, Maya?", "What\'s my score?".',
      inputSchema: z.object({
        code: codeField,
        memberName: z.string().describe('Who is asking, e.g. "Maya". Use the first name the speaker gives.'),
      }),
    },
    async ({ code, memberName }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const member = resolveMember(store, partyCode, memberName);
        const state = store.getState(partyCode);
        const row = state.standings.find((s) => s.memberId === member.memberId);
        const players = (row?.roster ?? []).map((fr) => {
          const entry = state.draftBoard.find((e) => e.player.id === fr.playerId);
          const player = entry?.player;
          return {
            id: fr.playerId,
            name: player ? playerLabel(player) : fr.playerId,
            nickname: player?.nickname,
            position: player?.position,
            team: entry?.teamShort,
            points: fr.points,
            statLine: fr.statLine,
          };
        });
        const draftPoints = row?.draftPoints ?? 0;
        const rank = row?.rank ?? 0;
        const content = {
          code: partyCode,
          member: { id: member.memberId, name: member.name, household: member.household },
          players,
          draftPoints,
          pickPoints: row?.pickPoints ?? 0,
          total: row?.total ?? 0,
          rank,
        };
        if (players.length === 0) {
          return ok("You haven't drafted anyone yet. Try: draft Big Mo.", content);
        }
        const list = joinNames(players.map((p) => `${p.name} with ${p.points} points`));
        return ok(`${member.name}, you have ${list}. That's ${draftPoints} draft points, rank ${rank} tonight.`, content);
      }),
  );

  server.registerPrompt(
    'watch_party_host',
    {
      title: 'Watch party host',
      description: 'How to run a Benchwarmers watch party with the voice tools.',
      argsSchema: { crewName: z.string().optional().describe('Crew to host, e.g. "Sunday Crew".') },
    },
    async ({ crewName }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `You are the host for a Benchwarmers watch party${crewName ? ` for the ${crewName}` : ''}. Run it end to end with these tools.`,
              '1. Set up: call setup_watch_party with the crew name (and game or day if said). Read the code and who is invited.',
              `2. Draft: each person drafts ${ROSTER_SIZE} players. Say "draft Big Mo" style names; call get_my_roster to read someone's players.`,
              '3. Start: when everyone has three players, call start_watch_party. Empty slots are filled by the bench.',
              '4. Picks: each question opens by voice. Read the question and the seconds left. Ask "Which household are you in?" when a name is ambiguous.',
              '5. Status: call get_game_status when asked for the score, clock or open question.',
              '6. Results: call explain_last_result after each question settles. Say who got it right.',
              '7. Season: after the final whistle, summarise the night and the season standings.',
              'Voice style: short spoken sentences, no markdown, no lists read aloud. Never use betting or wager language. This is free to play, with no real money.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerResource(
    'rules',
    RULES_URI,
    { title: 'Benchwarmers rules', description: 'Draft, scoring, picks and season rules.', mimeType: 'text/markdown' },
    async () => ({ contents: [{ uri: RULES_URI, mimeType: 'text/markdown', text: rulesMarkdown() }] }),
  );

  registerAppResource(
    server,
    BOARD_URI,
    BOARD_URI,
    { mimeType: RESOURCE_MIME_TYPE, description: 'Benchwarmers draft board and leaderboard widget.' },
    async () => {
      let html: string;
      try {
        html = await fs.readFile(WIDGET_URL, 'utf8');
      } catch {
        html = WIDGET_FALLBACK;
      }
      return { contents: [{ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    },
  );

  return server;
}
