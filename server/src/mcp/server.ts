// MCP server factory: tools, prompt, resources. One fresh McpServer per HTTP request (stateless).
import fs from 'node:fs/promises';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { GameError, gameClock, playerLabel } from '../game/engine.js';
import { GAMES } from '../game/games.js';
import type { Store } from '../game/store.js';
import type { Game, GameEvent, PartyStateResponse, Prop, WatchParty } from '../shared/types.js';
import { BONUS_COPY, ROSTER_SIZE, type PickScore } from '../shared/types.js';
import { projectionOf } from '../game/projections.js';
import type { Position } from '../shared/types.js';
import {
  matchCrew,
  matchGame,
  matchHousehold,
  matchMember,
  matchPlayer,
  matchPosition,
  matchPropOption,
  matchTeam,
  type MatchResult,
} from './match.js';
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

// ---------- speech helpers for the UI tools ----------

const POSITION_NAMES: Record<Position, string> = {
  PG: 'point guard',
  SG: 'shooting guard',
  SF: 'small forward',
  PF: 'power forward',
  C: 'center',
  QB: 'quarterback',
  RB: 'running back',
  WR: 'wide receiver',
  TE: 'tight end',
  K: 'kicker',
};

/** "Harbor Hawks" -> "Harbor" for the side. */
const teamWord = (state: PartyStateResponse, side: 'home' | 'away'): string => state.game[side].name.split(' ')[0];

/** Speakable number: at most one decimal. */
const num = (n: number): string => String(Math.round(n * 10) / 10);

const pts = (n: number): string => `${num(n)} ${num(n) === '1' ? 'point' : 'points'}`;

/** Spoken form of a bonus: "Lone call" -> "lone call". Only "Against the room" needs a rewrite. */
const bonusPhrase = (b: PickScore['bonuses'][number]): string =>
  b === 'against_the_room' ? 'call against the room' : BONUS_COPY[b].toLowerCase();

/** Most notable bonus among correct scored picks: biggest factor, ties by input order. */
function notableBonus(entries: { name: string; score?: PickScore }[]): { name: string; phrase: string; points: number; bonus: PickScore['bonuses'][number] } | undefined {
  let best: { name: string; score: PickScore } | undefined;
  for (const e of entries) {
    const sc = e.score;
    if (!sc || !sc.correct || sc.bonuses.length === 0) continue;
    if (!best || sc.factor > best.score.factor) best = { name: e.name, score: sc };
  }
  if (!best) return undefined;
  const bonus = best.score.bonuses[0]!;
  return { name: best.name, phrase: bonusPhrase(bonus), points: best.score.points, bonus };
}

/** One speakable line: "Maya's lone call earned 15 points." */
const bonusLine = (n: { name: string; phrase: string; points: number }): string => `${n.name}'s ${n.phrase} earned ${pts(n.points)}.`;

const endSentence = (s: string): string => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Football drive as spoken, from the latest drive start at or before the game time. */
type DriveView = { team: 'home' | 'away'; yardline100: number; quarter: number; text: string };

/** "Otters ball at their own 25, 2nd quarter". yardline100 counts yards to the opponent's end zone. */
function currentDrive(game: Game, gameT: number): DriveView | undefined {
  if (game.sport !== 'football') return undefined;
  let start: GameEvent | undefined;
  for (const e of game.events) {
    if (e.type === 'drive' && e.drive && !e.driveResult && e.t <= gameT && (!start || e.t > start.t)) start = e;
  }
  if (!start?.drive) return undefined;
  const d = start.drive;
  const offense = d.team === 'home' ? game.home : game.away;
  const defense = d.team === 'home' ? game.away : game.home;
  const y = d.yardline100;
  const theirs = nickOf(defense.name);
  const possessive = theirs.endsWith('s') ? `${theirs}'` : `${theirs}'s`;
  const spot = y === 50 ? 'midfield' : y > 50 ? `their own ${100 - y}` : `the ${possessive} ${y}`;
  const quarter = gameClock(game, start.t, 'live').period;
  return { team: d.team, yardline100: y, quarter, text: `${nickOf(offense.name)} ball at ${spot}, ${ordinal(quarter)} quarter` };
}

/** Historical odds carried on a football drive prop (never computed live). */
function driveOdds(prop: Prop | undefined): { line: string; percentYes: number; outcome: 'score' | 'td'; sampleSize: number } | undefined {
  if (!prop || prop.resolver.kind !== 'driveResult' || !prop.odds) return undefined;
  const outcome = prop.resolver.outcome;
  const percentYes = Math.round((prop.odds.p.yes ?? 0) * 100);
  const line =
    outcome === 'td' ? `Drives like this get a touchdown ${percentYes}% of the time.` : `Drives like this score ${percentYes}% of the time.`;
  return { line, percentYes, outcome, sampleSize: prop.odds.n };
}

function requireGame(store: Store, state: PartyStateResponse) {
  const game = store.getGame(state.game.id);
  if (!game) throw new ToolError("I couldn't find the game for this party.", 'NOT_FOUND');
  return game;
}

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
        'list_available_players (undrafted players, by team or position), draft_player (a person drafts a player by name, nickname, number or position), ' +
        "get_my_roster (a person's players and points), start_watch_party (tip off, fill empty slots), " +
        'get_game_status (score, clock, open question), make_pick (a person answers the open question), ' +
        'get_leaderboard (tonight\'s standings), get_season_standings (season totals for the crew), ' +
        'explain_last_result (last settled question). ' +
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
        const opener = state.game.sport === 'football' ? 'Kickoff!' : 'Tip-off!';
        const parts = [n === 0 ? `${opener} Everyone had a full roster.` : `${opener} The bench filled in ${n} ${n === 1 ? 'player' : 'players'}.`];
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
        const game = requireGame(store, state);
        const drive = currentDrive(game, state.game.gameT);
        const odds = driveOdds(state.props.find((p) => p.id === state.activeProp?.id));
        const content = {
          code: partyCode,
          status: state.party.status,
          score,
          clock: state.game.clock,
          period: state.game.period,
          lastPlays,
          ...(drive ? { drive: { team: drive.team, yardline100: drive.yardline100, quarter: drive.quarter } } : {}),
          ...(active ? { activeProp: { ...active, ...(odds ? { odds: { percentYes: odds.percentYes, outcome: odds.outcome, sampleSize: odds.sampleSize } } : {}) } } : {}),
        };

        if (state.party.status === 'scheduled' || state.party.status === 'drafting') {
          return ok("We're still drafting. Say start the party when everyone has three players.", content);
        }
        if (state.party.status === 'final') {
          return ok(`Final: ${scoreLine}.`, content);
        }
        const parts = [`${scoreLine}, ${state.game.clock}.`];
        if (drive) parts.push(`${drive.text}.`);
        if (lastPlays[0]) parts.push(`Latest: ${lastPlays[0]}`);
        if (active) {
          parts.push(`Open question: ${active.question}`);
          if (odds) parts.push(odds.line);
          parts.push(`Locks in about ${active.secondsToLock} seconds.`);
        }
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
        const notable = notableBonus(state.picks.filter((p) => p.propId === prop.id).map((p) => ({ name: p.memberName, score: p.score })));
        if (notable) parts.push(bonusLine(notable));
        return ok(parts.join(' '), {
          code: partyCode,
          prop: { id: prop.id, question: prop.question },
          correctOption: correct ? { id: correct.id, label: correct.label } : null,
          ...(prop.explanation ? { explanation: prop.explanation } : {}),
          winners,
          ...(notable ? { bonus: { memberName: notable.name, bonus: notable.bonus, points: notable.points } } : {}),
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
        const last = row?.lastPickScore;
        const mine = last && last.correct && last.bonuses.length > 0 ? ` Your last ${bonusPhrase(last.bonuses[0]!)} earned ${pts(last.points)}.` : '';
        return ok(`${member.name}, you have ${list}. That's ${draftPoints} draft points, rank ${rank} tonight.${mine}`, content);
      }),
  );

  // ---------- MCP App (UI) tools: every result carries what the board widget needs ----------

  const uiMeta = { ui: { resourceUri: BOARD_URI } };

  registerAppTool(
    server,
    'list_available_players',
    {
      title: 'List available players',
      description:
        'Use when someone asks who is still available to draft, or who the best players left are. Optionally filter by team or position. ' +
        'Examples: "Who\'s still available?", "Show me the Hawks\' guards", "Who are the best centers left?", "Who\'s left at quarterback?". ' +
        'Shows the draft board and returns the top undrafted players.',
      inputSchema: z.object({
        code: codeField,
        team: z.string().optional().describe('Filter by team, e.g. "Harbor", "Hawks", "Foxes", "Otters" or "Forge". Optional.'),
        position: z
          .string()
          .optional()
          .describe('Filter by position, e.g. "point guard", "C", "center", "quarterback", "QB" or "tight end". Optional.'),
      }),
      _meta: uiMeta,
    },
    async ({ code, team, position }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const state = store.getState(partyCode);
        const game = requireGame(store, state);
        const side = team?.trim() ? unwrapMatch(matchTeam(team, game)) : undefined;
        const pos: Position | undefined = position?.trim() ? unwrapMatch(matchPosition(position, game.sport)) : undefined;
        const available = state.draftBoard
          .filter((e) => !e.ownerMemberId && (!side || e.side === side) && (!pos || e.player.position === pos))
          .sort((a, b) => projectionOf(b.player.id) - projectionOf(a.player.id) || (a.player.id < b.player.id ? -1 : 1));
        const players = available.map((e) => ({
          id: e.player.id,
          name: e.player.name,
          nickname: e.player.nickname,
          number: e.player.number,
          position: e.player.position,
          team: e.teamShort,
          projection: projectionOf(e.player.id),
          ...(e.scoutingNote ? { scoutingNote: e.scoutingNote } : {}),
        }));
        const content = { view: 'draft', code: partyCode, state, players };
        if (available.length === 0) {
          return ok(side || pos ? 'No one matching that is left. Try a different team or position.' : 'Everyone has been drafted.', content);
        }
        const spoken = available.slice(0, 5).map((e) => {
          const head = `${playerLabel(e.player)}, ${teamWord(state, e.side)} ${POSITION_NAMES[e.player.position]}.`;
          return e.scoutingNote ? `${head} ${endSentence(e.scoutingNote)}` : head;
        });
        return ok(`Top available: ${spoken.join(' ')}`, content);
      }),
  );

  registerAppTool(
    server,
    'draft_player',
    {
      title: 'Draft a player',
      description:
        'Use when someone drafts a player for their roster. Fuzzy-matches names, nicknames ("Big Mo"), jersey numbers ("number 7") ' +
        'and position plus team ("Harbor\'s point guard", "the Otters quarterback"). ' +
        'Examples: "I\'m Maya, draft Big Mo", "Sam wants Harbor\'s point guard", "Draft number 7 for Maya", "Leo drafts the Otters quarterback". ' +
        'If the player is taken, the error lists two alternatives to offer.',
      inputSchema: z.object({
        code: codeField,
        memberName: z.string().describe('Who is drafting, e.g. "Maya". Use the first name the speaker gives.'),
        player: z
          .string()
          .describe('The player: a name, nickname, jersey number or position plus team, e.g. "Big Mo", "number 7", "Harbor\'s point guard", "the Otters quarterback".'),
      }),
      _meta: uiMeta,
    },
    async ({ code, memberName, player }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const member = resolveMember(store, partyCode, memberName);
        const before = store.getState(partyCode);
        const game = requireGame(store, before);
        const takenIds = before.draftBoard.filter((e) => e.ownerMemberId).map((e) => e.player.id);
        const found = unwrapMatch(matchPlayer(player, game, { takenIds }));
        const pick = store.draft(partyCode, member.memberId, found.id);
        const state = store.getState(partyCode);
        const entry = state.draftBoard.find((e) => e.player.id === found.id);
        const mine = state.draftBoard.filter((e) => e.ownerMemberId === member.memberId).length;
        const side = entry?.side ?? (found.teamId === game.home.id ? 'home' : 'away');
        const tail = mine >= ROSTER_SIZE ? `${member.name}'s roster is full.` : `That's ${mine} of ${ROSTER_SIZE}.`;
        return ok(
          `${member.name} drafted ${playerLabel(found)}, ${teamWord(state, side)}'s ${POSITION_NAMES[found.position]}. ${tail}`,
          {
            view: 'draft',
            code: partyCode,
            state,
            drafted: {
              memberId: member.memberId,
              memberName: member.name,
              playerId: found.id,
              playerName: playerLabel(found),
              round: pick.round,
            },
          },
        );
      }),
  );

  registerAppTool(
    server,
    'make_pick',
    {
      title: 'Make a pick',
      description:
        'Use when someone answers the open question. Fuzzy-matches the choice to an option ("the over", "Hawks", "home", "a three", "free throw", "they score", "no score", "punt") ' +
        'and defaults to the question that is open now. ' +
        'Examples: "I\'m Sam, put me down for the Hawks", "Maya says the over", "Sam, a three", "Leo says they get stopped".',
      inputSchema: z.object({
        code: codeField,
        memberName: z.string().describe('Who is picking, e.g. "Sam". Use the first name the speaker gives.'),
        choice: z.string().describe('Their answer, e.g. "the over", "Hawks", "home", "a three", "free throw".'),
        propId: z.string().optional().describe('Question id. Optional: defaults to the open question.'),
        source: z.enum(['voice', 'screen']).optional().describe('Where the pick came from. Defaults to voice; the widget passes screen for taps.'),
      }),
      _meta: uiMeta,
    },
    async ({ code, memberName, choice, propId, source }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const member = resolveMember(store, partyCode, memberName);
        const how = source ?? 'voice';
        const before = store.getState(partyCode);
        const prop = propId ? before.props.find((p) => p.id === propId) : before.activeProp;
        if (!prop || prop.status !== 'open') {
          // The store raises the friendly "Picks are locked..." (or not-found) error.
          store.pick(partyCode, member.memberId, '', propId, how);
          throw new ToolError('Picks are locked right now.', 'PICKS_LOCKED');
        }
        const game = requireGame(store, before);
        const option = unwrapMatch(matchPropOption(choice, prop, game));
        store.pick(partyCode, member.memberId, option.id, prop.id, how);
        const state = store.getState(partyCode);
        const after = state.props.find((p) => p.id === prop.id);
        const left = after?.realSecondsToLock !== undefined ? ` Locks in about ${secondsOf(after.realSecondsToLock)} seconds.` : '';
        return ok(`Got it, ${member.name}: ${option.label}.${left}`, {
          view: 'tonight',
          code: partyCode,
          state,
          pick: { memberId: member.memberId, memberName: member.name, propId: prop.id, optionId: option.id, label: option.label },
        });
      }),
  );

  registerAppTool(
    server,
    'get_leaderboard',
    {
      title: 'Get the leaderboard',
      description:
        "Use when someone asks who is winning tonight or for the standings. Examples: \"Who's winning?\", \"Show the leaderboard\", \"Where do I stand?\". " +
        'Shows tonight\'s standings: draft points plus pick points.',
      inputSchema: z.object({ code: codeField }),
      _meta: uiMeta,
    },
    async ({ code }) =>
      wrap(() => {
        const partyCode = resolveCode(store, code);
        const state = store.getState(partyCode);
        const standings = state.standings.map((s) => ({
          rank: s.rank,
          name: s.name,
          household: s.household,
          total: s.total,
          draftPoints: s.draftPoints,
          pickPoints: s.pickPoints,
          streak: s.streak,
        }));
        const content = { view: 'tonight', code: partyCode, state, standings };
        const top = standings.slice(0, 3);
        if (top.length === 0 || top.every((r) => r.total === 0)) {
          return ok('Nobody has scored yet.', content);
        }
        const [first, ...rest] = top;
        const parts = [
          `${first.name} leads with ${pts(first.total)}: ${num(first.draftPoints)} draft, ${num(first.pickPoints)} from picks.`,
          ...rest.map((r, i) => `${r.name} is ${i === 0 ? 'second' : 'third'} with ${num(r.total)}.`),
        ];
        const notable = notableBonus(state.standings.map((s) => ({ name: s.name, score: s.lastPickScore })));
        if (notable) parts.push(bonusLine(notable));
        return ok(parts.join(' '), notable ? { ...content, bonus: { memberName: notable.name, bonus: notable.bonus, points: notable.points } } : content);
      }),
  );

  registerAppTool(
    server,
    'get_season_standings',
    {
      title: 'Get season standings',
      description:
        'Use when someone asks about the season, the long-run rankings, streaks or nights won. ' +
        'Examples: "Who\'s winning the season?", "Where am I in the season, Maya?", "Season standings for the Seattle crew". ' +
        'Crew name is optional and defaults to the Sunday Crew.',
      inputSchema: z.object({
        crewName: z.string().optional().describe('Crew name or household city, e.g. "the Seattle crew". Optional.'),
        memberName: z.string().optional().describe('A person to report on, e.g. "Maya". Optional.'),
      }),
      _meta: uiMeta,
    },
    async ({ crewName, memberName }) =>
      wrap(() => {
        const crewId = crewName?.trim() ? unwrapMatch(matchCrew(crewName, store.listCrews(), store.listHouseholds())).id : DEFAULT_CREW_ID;
        const season = store.getSeason(crewId);
        const total = (r: { points: number; fantasyPoints: number }) => r.points + r.fantasyPoints;
        if (memberName?.trim()) {
          const m = unwrapMatch(
            matchMember(
              memberName,
              season.rows.map((r) => ({ memberId: r.memberId, name: r.name, household: r.household, householdId: r.householdId })),
            ),
          );
          const row = season.rows.find((r) => r.memberId === m.memberId)!;
          const content = {
            view: 'season',
            season,
            member: { memberId: row.memberId, name: row.name, household: row.household, rank: row.rank, points: Math.round(total(row) * 10) / 10 },
          };
          return ok(
            `${row.name}, you're ${ordinal(row.rank)} this season with ${pts(total(row))}. Best streak ${row.bestStreak}, ${row.nightsWon} ${row.nightsWon === 1 ? 'night' : 'nights'} won.`,
            content,
          );
        }
        const top = season.rows.slice(0, 3);
        const content = { view: 'season', season };
        if (top.length === 0 || top.every((r) => total(r) === 0)) {
          return ok(`No season points yet for ${season.crew.name}.`, content);
        }
        const [first, ...rest] = top;
        const parts = [
          `${first.name} leads the season with ${pts(total(first))}.`,
          ...rest.map((r, i) => `${r.name} is ${i === 0 ? 'second' : 'third'} with ${num(total(r))}.`),
        ];
        return ok(parts.join(' '), content);
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
