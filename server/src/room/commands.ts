import { createHash } from 'node:crypto';
import { RoomError, type RoomStore } from './store.js';
import type { RoomView } from './types.js';

/**
 * Typed room commands. Voice, typed text and a model-backed interpreter all reduce to
 * one of these, and every mutation still goes through RoomStore validation. The parser
 * never decides correctness, timing or prices; it only picks a command or asks.
 */
export type ReadTopic = 'score' | 'possession' | 'rank' | 'leader' | 'season' | 'help';
export type RoomCommand =
  | { kind: 'read'; topic: ReadTopic }
  | { kind: 'auto_lineup'; style: 'balanced' | 'stars' | 'value' }
  | { kind: 'set_captain'; playerId: string }
  | { kind: 'pick'; questionId: string; optionId: string }
  | { kind: 'host'; action: 'start' | 'pause' | 'resume' | 'set_speed'; speed?: number }
  | { kind: 'navigate'; view: 'standings' | 'season' | 'game' | 'lineups' }
  | { kind: 'clarify'; reply: string };

export type RoomActor = { participantToken?: string; hostToken?: string };
export type CommandResult = { reply: string; view: RoomView; command: RoomCommand; accepted?: boolean; navigate?: 'standings' | 'season' | 'game' | 'lineups' };

const QUESTION_WORD = /^(how|what|who|whose|when|where|which|is|are|did|does|do|can)\b/;
const normalize = (text: string) => text.toLowerCase().replace(/^\s*(hey\s+)?alexa[,!.\s]*/, '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
const words = (text: string) => text.replace(/[^a-z0-9' ]/g, ' ').split(' ').filter(Boolean);

// Spoken forms for known option ids. Team options also match the team's own names.
const OPTION_WORDS: Record<string, RegExp> = {
  TD: /\b(touchdown|td|touch down)\b/, FG: /\b(field goal|fg)\b/, PUNT: /\bpunt\b/, TURNOVER: /\b(turnover|fumble|interception|picked off|downs)\b/,
  yes: /\b(yes|they will|will score|yeah|yep)\b/, no: /\b(no|nope|they won'?t|will not|won'?t score)\b/, over: /\bover\b/, under: /\bunder\b/,
  two: /\b(two|2|deuce|two pointer|bucket)\b/, three: /\b(three|3|trey|three pointer|from deep)\b/,
};

function teamAliases(view: RoomView, option: { id: string; label: string }): string[] {
  const label = option.label.toLowerCase();
  const team = [view.game.home, view.game.away].find((t) => t.id === option.id || t.name.toLowerCase() === label || t.short.toLowerCase() === label);
  if (!team) return [];
  return [...new Set([team.id, team.short, team.name, ...words(team.name.toLowerCase())].map((value) => value.toLowerCase()).filter((value) => value.length > 1))];
}

/** Resolves an answer to exactly one option of the current question, or explains why not. */
export function resolveOption(view: RoomView, text: string): { optionId: string } | { reply: string } | null {
  const q = view.question;
  if (!q) return null;
  const said = ` ${words(text).join(' ')} `;
  if (q.options.some((o) => o.id === 'no') && OPTION_WORDS.no!.test(text)) return { optionId: 'no' };
  const matches = q.options.filter((option) => {
    if (OPTION_WORDS[option.id]?.test(text)) return true;
    const label = option.label.toLowerCase();
    if (said.includes(` ${label} `)) return true;
    return teamAliases(view, option).some((alias) => said.includes(` ${alias} `));
  });
  if (matches.length === 1) return { optionId: matches[0]!.id };
  if (matches.length > 1) return { reply: `Did you mean ${matches.map((o) => o.label).join(' or ')}? Say just one.` };
  return null;
}

type Player = RoomView['players'][number] & { nickname?: string };
/** One athlete by full name, unique first or last name, nickname or id; ambiguity asks. */
export function resolvePlayer(view: RoomView, query: string): { playerId: string } | { reply: string } {
  const q = query.toLowerCase().replace(/[.!?]+$/, '').trim();
  const players = view.players as Player[];
  const exact = players.filter((p) => p.name.toLowerCase() === q || p.id === q || p.nickname?.toLowerCase() === q);
  const partial = exact.length ? exact : players.filter((p) => p.name.toLowerCase().split(' ').includes(q));
  if (partial.length === 1) return { playerId: partial[0]!.id };
  if (partial.length > 1) return { reply: `Which one: ${partial.map((p) => p.name).join(' or ')}?` };
  return { reply: `I couldn't find a player called ${query.trim()}. Say their full name.` };
}

export function parseCommand(input: string, view: RoomView): RoomCommand {
  const text = normalize(input);
  if (/\b(kick ?off|tip ?off|start (the )?(game|replay)|let'?s go)\b/.test(text)) return { kind: 'host', action: 'start' };
  if (/\b(resume|unpause|keep going)\b/.test(text)) return { kind: 'host', action: 'resume' };
  if (/\bpause\b/.test(text)) return { kind: 'host', action: 'pause' };
  const speed = text.match(/\b(?:speed|replay)\b.*?\b([1-4])\s*x?\b/);
  if (speed) return { kind: 'host', action: 'set_speed', speed: Number(speed[1]) };
  if (/\b(show|open|go to)\b.*\bseason\b/.test(text)) return { kind: 'navigate', view: 'season' };
  if (/\b(show|open|go to)\b.*\b(standings|leaderboard)\b/.test(text)) return { kind: 'navigate', view: 'standings' };
  if (/\b(sleepers?|auto ?lineup|make my lineup|build (me )?(a |my )?\w* ?lineup|pick my (lineup|team)|choose.*for me|lineup for me)\b/.test(text)) {
    return { kind: 'auto_lineup', style: /sleeper|value|cheap/.test(text) ? 'value' : /star/.test(text) ? 'stars' : 'balanced' };
  }
  const captain = text.match(/(?:make|set)\s+(.+?)\s+(?:my|the|as)\s+captain|^captain\s+(.+)|^(.+?)\s+(?:as|for)\s+(?:my\s+)?captain$/);
  if (captain) {
    const found = resolvePlayer(view, captain[1] ?? captain[2] ?? captain[3] ?? '');
    return 'playerId' in found ? { kind: 'set_captain', playerId: found.playerId } : { kind: 'clarify', reply: found.reply };
  }
  if (/\b(who has the ball|who'?s got the ball|possession|whose ball)\b/.test(text)) return { kind: 'read', topic: 'possession' };
  if (/\b(season|all time|all-time)\b/.test(text)) return { kind: 'read', topic: 'season' };
  if (/\b(leaderboard|standings|who'?s leading|who is leading|who'?s winning|who is winning)\b/.test(text)) return { kind: 'read', topic: 'leader' };
  if (/\b(my rank|my points|my score|my status|how am i|how'?s my|how is my|where do i stand)\b/.test(text)) return { kind: 'read', topic: 'rank' };
  if (view.question && !QUESTION_WORD.test(text)) {
    const option = resolveOption(view, text);
    if (option && 'optionId' in option) return { kind: 'pick', questionId: view.question.id, optionId: option.optionId };
    if (option) return { kind: 'clarify', reply: option.reply };
  }
  if (/\b(score|quarter|clock|what happened|what'?s happening)\b/.test(text)) return { kind: 'read', topic: 'score' };
  return { kind: 'read', topic: 'help' };
}

/**
 * Stable request id for a spoken or tool pick. The same request retried (a duplicate
 * model tool call) maps to the same id, so the server returns the original receipt;
 * a changed answer, or changing back, includes the current pick and gets a new id.
 */
export function pickRequestId(prefix: 'voice' | 'mcp', participantId: string, questionId: string, optionId: string, currentOptionId: string | undefined): string {
  const digest = createHash('sha256').update(`${participantId}:${questionId}:${optionId}:${currentOptionId ?? ''}`).digest('hex').slice(0, 40);
  return `${prefix}-${digest}`;
}

const HOST_VERB = { start: 'start the game', pause: 'pause the replay', resume: 'resume the replay', set_speed: 'change the replay speed' } as const;

function scoreLine(view: RoomView): string {
  const { home, away, clock, quarter } = view.game;
  const where = view.room.phase === 'final' ? 'Final.' : view.room.phase === 'lobby' ? 'Not started yet.' : `Quarter ${quarter}, ${clock}.`;
  const source = view.game.sourceStatus && view.game.sourceStatus !== 'healthy' ? ` Data is ${view.game.sourceStatus}.` : '';
  return `${home.name} ${home.score}, ${away.name} ${away.score}. ${where}${source}`;
}

function read(view: RoomView, topic: ReadTopic): string {
  switch (topic) {
    case 'score': return scoreLine(view);
    case 'possession': {
      const id = view.game.context ? view.game.context.possessionTeamId : view.game.possession;
      const team = id === view.game.home.id ? view.game.home : id === view.game.away.id ? view.game.away : undefined;
      return team ? `${team.name} have the ball.` : 'Possession is unknown right now.';
    }
    case 'leader': {
      const leaders = view.standings.filter((row) => row.rank === 1);
      if (!leaders.length) return 'Nobody has joined this room yet.';
      return leaders.length > 1 ? `${leaders.map((row) => row.name).join(' and ')} are tied for the lead with ${leaders[0]!.total} points.` : `${leaders[0]!.name} leads with ${leaders[0]!.total} points.`;
    }
    case 'season': {
      const leader = view.season.standings[0];
      return leader ? `${leader.name} leads the season with ${leader.points} points.` : 'This season has no completed nights yet.';
    }
    case 'rank': {
      const own = view.me ? view.standings.find((row) => row.participantId === view.me!.participantId) : undefined;
      if (!own) return 'Choose who you are first, then ask again.';
      return `${own.name}, you are number ${own.rank} of ${view.room.participantCount} with ${own.total} points.`;
    }
    case 'help': {
      const q = view.question;
      return q && q.status === 'open' ? `Try ${q.options.map((o) => `“${o.label}”`).join(', ')}, “what's my rank?”, or “what's the score?”` : 'Try “build a balanced lineup for me”, “what’s my rank?”, or “what’s the score?”';
    }
  }
}

/** Runs one command for one actor. Clarifications and refusals never mutate. */
export function executeCommand(store: RoomStore, code: string, command: RoomCommand, actor: RoomActor): CommandResult {
  const token = actor.participantToken;
  let view = store.view(code, token);
  const done = (reply: string, extra: Partial<CommandResult> = {}): CommandResult => ({ reply, view, command, ...extra });
  const needSeat = () => done('Choose who you are first. Nothing was changed.', { accepted: false });
  switch (command.kind) {
    case 'clarify': return done(command.reply, { accepted: false });
    case 'read': return done(read(view, command.topic));
    case 'navigate':
      if (command.view === 'season' && view.room.phase !== 'final') return done('Season standings open after the final.');
      return done(command.view === 'season' ? read(view, 'season') : read(view, 'leader'), { navigate: command.view });
    case 'host':
      if (!actor.hostToken) return done(`Only the host can ${HOST_VERB[command.action]}.`, { accepted: false });
      try { view = store.host(code, { hostToken: actor.hostToken, action: command.action, speed: command.speed }); }
      catch (err) {
        if (err instanceof RoomError && err.code === 'BAD_HOST_CREDENTIAL') return done(`Only the host can ${HOST_VERB[command.action]}.`, { accepted: false });
        if (err instanceof RoomError && err.status === 409) return done(err.message, { accepted: false });
        throw err;
      }
      if (token) view = store.view(code, token);
      return done(command.action === 'start' ? 'Tip-off! Lineups are locked.' : command.action === 'pause' ? 'Replay paused. Answer time is paused too.' : command.action === 'resume' ? 'The replay is running again.' : `Replay speed is ${command.speed} times.`, { accepted: true });
    case 'auto_lineup':
      if (!token || !view.me) return needSeat();
      try { view = store.autoLineup(code, { participantToken: token, style: command.style }); }
      catch (err) { if (err instanceof RoomError && err.status < 500) return done(err.message, { accepted: false }); throw err; }
      return done(`Your ${command.style} lineup is saved at $${(view.me?.lineup?.salaryUsed ?? 0).toLocaleString('en-US')} of $${view.rules.salaryCap.toLocaleString('en-US')}.`, { accepted: true });
    case 'set_captain': {
      if (!token || !view.me) return needSeat();
      const lineup = view.me.lineup;
      const player = view.players.find((p) => p.id === command.playerId)!;
      if (!lineup) return done('Build your lineup first. Say “build a balanced lineup for me”.', { accepted: false });
      if (lineup.captainId === player.id) return done(`${player.name} is already your captain.`, { accepted: true });
      const ids = [lineup.captainId, ...lineup.flexIds];
      const flexIds = ids.includes(player.id) ? ids.filter((id) => id !== player.id) : lineup.flexIds;
      try { view = store.setLineup(code, { participantToken: token, captainId: player.id, flexIds }); }
      catch (err) { if (err instanceof RoomError && err.status < 500) return done(`${player.name} can't be captain: ${err.message}`, { accepted: false }); throw err; }
      return done(`${player.name} is your captain. Lineup cost $${(view.me?.lineup?.salaryUsed ?? 0).toLocaleString('en-US')}.`, { accepted: true });
    }
    case 'pick': {
      if (!token || !view.me) return needSeat();
      const q = view.question;
      const label = q?.options.find((o) => o.id === command.optionId)?.label ?? command.optionId;
      if (!q || q.id !== command.questionId || q.status !== 'open') return done('That call has closed. Nothing was accepted.', { accepted: false });
      // A repeated command after success must not act twice.
      if (view.me.currentPick?.questionId === q.id && view.me.currentPick.optionId === command.optionId) return done(`${label} is already your pick.`, { accepted: true });
      const current = view.me.currentPick?.questionId === q.id ? view.me.currentPick.optionId : undefined;
      try { view = store.pick(code, { participantToken: token, questionId: q.id, optionId: command.optionId, requestId: pickRequestId('voice', view.me.participantId, q.id, command.optionId, current) }); }
      catch (err) {
        if (err instanceof RoomError && err.code === 'PICKS_LOCKED') return done(`That call closed before your answer arrived. ${label} was not accepted.`, { accepted: false });
        if (err instanceof RoomError && err.status < 500) return done(`${label} was not accepted: ${err.message}`, { accepted: false });
        throw err;
      }
      const saved = view.me?.currentPick?.questionId === q.id && view.me.currentPick.optionId === command.optionId;
      return saved ? done(`${label} accepted.`, { accepted: true }) : done(`${label} was not accepted.`, { accepted: false });
    }
  }
}
