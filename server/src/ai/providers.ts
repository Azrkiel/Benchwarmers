import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type {
  AiContentProvider,
  AiMode,
  ExplainContext,
  Game,
  GameEvent,
  Player,
  DriveResult,
  Prop,
  PickScore,
  PropGenContext,
  RecapContext,
} from '../shared/types.js';
import { round1 } from '../game/engine.js';
import { BONUS_COPY } from '../shared/types.js';
import { converseJson, type BedrockLike, type ConverseJsonOptions } from './bedrock.js';
import { generateGeminiJson, type GeminiLike } from './gemini.js';
import { checkText, sanitizeText } from './guardrails.js';
import { validateGeneratedProps } from './propValidation.js';

export { validateGeneratedProps } from './propValidation.js';

// ---------- helpers ----------

let scoutingCache: Record<string, string> | undefined;
function loadScouting(): Record<string, string> {
  if (scoutingCache) return scoutingCache;
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(new URL('./fallback/scouting.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
    }
  } catch {
    /* generic lines are generated instead */
  }
  scoutingCache = out;
  return out;
}

function rosterPlayers(game: Game): Player[] {
  return [...game.home.roster, ...game.away.roster];
}

function display(p: Player): string {
  return p.nickname ?? p.name;
}

function genericScouting(p: Player): string {
  return `${p.name} (#${p.number}, ${p.position}) is one to watch tonight. Keep an eye out for a big play.`;
}

const SAFE_GENERIC = 'A player to watch tonight.';

function clean(text: string, fallback: string): string {
  return sanitizeText(text, checkText(fallback).ok ? fallback : SAFE_GENERIC);
}

function log(msg: string, err: unknown): void {
  if (process.env.VITEST || process.env.AI_LOG === '0') return;
  console.warn(`[ai] ${msg}: ${err instanceof Error ? err.message : String(err)}`);
}

function fmtClockT(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- fallback ----------

function decidingEvent(prop: Prop, events: GameEvent[]): GameEvent | undefined {
  const r = prop.resolver;
  const scores = events.filter((e) => e.type === 'score');
  let found: GameEvent | undefined;
  if (r.kind === 'nextScoreType') found = scores.find((e) => e.t >= r.afterT);
  else if (r.kind === 'teamScoresFirst') found = scores.find((e) => e.t >= r.afterT && e.t <= r.untilT);
  else if (r.kind === 'totalPointsOver') found = [...scores].reverse().find((e) => e.t <= r.atT);
  else found = events.find((e) => e.drive?.id === r.driveId && e.driveResult !== undefined);
  return found ?? events[events.length - 1];
}

const DRIVE_RESULT_PHRASE: Record<DriveResult, string> = {
  td: 'a touchdown',
  fg: 'a field goal',
  missed_fg: 'a missed field goal',
  punt: 'a punt',
  turnover: 'a turnover',
  downs: 'a turnover on downs',
  end_of_half: 'the end of the half',
  safety: 'a safety',
};

function yardlineWords(yardline100: number): string {
  if (yardline100 > 50) return `their own ${100 - yardline100}`;
  if (yardline100 === 50) return 'midfield';
  return `the other side's ${yardline100}`;
}

/** Plain-words explanation of a football drive prop from real events and the stored historical odds. */
function explainDrive(prop: Prop, events: GameEvent[]): string | undefined {
  const r = prop.resolver;
  if (r.kind !== 'driveResult' || !prop.odds) return undefined;
  const driveEvents = events.filter((e) => e.drive?.id === r.driveId);
  const start = driveEvents[0]?.drive;
  const end = driveEvents.find((e) => e.driveResult !== undefined);
  const pYes = prop.odds.p.yes;
  if (!start || !end?.driveResult || typeof pYes !== 'number') return undefined;
  const pct = Math.round(pYes * 100);
  const lateInHalf = prop.odds.bucket.endsWith('|two-minute') || prop.odds.bucket.endsWith('|two_minute');
  const when = lateInHalf ? 'late in the half' : 'with time on the clock';
  const what = r.outcome === 'td' ? 'get a touchdown' : 'score';
  const ended = end.driveResult === 'end_of_half' ? 'with the half running out' : `in ${DRIVE_RESULT_PHRASE[end.driveResult]}`;
  return `Drives starting at ${yardlineWords(start.yardline100)} ${when} ${what} about ${pct}% of the time - this one ended ${ended}.`;
}

export class FallbackProvider implements AiContentProvider {
  readonly mode: AiMode = 'fallback';

  async generateProps(_ctx: PropGenContext): Promise<Prop[]> {
    // Football drive props are scripted (fallback props.json); AI never invents them.
    return [];
  }

  async explainResult(ctx: ExplainContext): Promise<string> {
    const { prop } = ctx;
    if (prop.explanation && checkText(prop.explanation).ok) return prop.explanation;
    const drive = explainDrive(prop, ctx.events);
    if (drive && checkText(drive).ok) return drive;
    const correct = prop.options.find((o) => o.id === prop.correctOptionId);
    const ev = decidingEvent(prop, ctx.events);
    const label = correct?.label ?? 'the answer';
    const evPart = ev ? ` Here is what settled it: ${ev.text} (at ${fmtClockT(ev.t)} of game time).` : '';
    const r = prop.resolver;
    const how =
      r.kind === 'nextScoreType'
        ? 'This question asked what kind of score would come next after the pick window closed.'
        : r.kind === 'teamScoresFirst'
          ? 'This question asked which team would score first once the pick window closed.'
          : r.kind === 'totalPointsOver'
            ? `This question asked whether the combined score would pass ${r.line} points by the check time.`
            : `This question asked whether the drive would end in ${r.outcome === 'td' ? 'a touchdown' : 'points'}.`;
    return clean(`The right answer was ${label}. ${how}${evPart}`, `The right answer was ${label}.`);
  }

  async recap(ctx: RecapContext): Promise<string> {
    const names = new Map<string, string>();
    for (const p of rosterPlayers(ctx.game)) names.set(p.id, display(p));
    for (const d of ctx.draftBoard) names.set(d.player.id, display(d.player));

    const football = ctx.game.sport === 'football';
    const lines: string[] = [`${ctx.game.title} is in the books.`];
    const standings = [...ctx.standings].sort((a, b) => a.rank - b.rank);
    for (const s of standings) {
      const best = [...s.roster].sort((a, b) => b.points - a.points)[0];
      if (best) {
        const who = names.get(best.playerId) ?? 'a teammate';
        lines.push(`${s.name}'s best moment: ${who} put up ${best.points} fantasy points (${best.statLine}).`);
      } else {
        lines.push(`${s.name} finished with ${s.total} points.`);
      }
    }
    let bestCall: { name: string; score: PickScore } | undefined;
    for (const s of standings) {
      const sc = s.lastPickScore;
      if (sc && sc.correct && sc.bonuses.length > 0 && (!bestCall || sc.factor > bestCall.score.factor)) bestCall = { name: s.name, score: sc };
    }
    if (bestCall) {
      const b = bestCall.score.bonuses[0]!;
      const phrase = b === 'against_the_room' ? 'call against the room' : BONUS_COPY[b].toLowerCase();
      lines.push(`Best call of the night: ${bestCall.name}'s ${phrase} earned ${bestCall.score.points} points.`);
    }
    const owned = ctx.draftBoard.filter((d) => d.ownerName);
    if (owned.length > 0) {
      const sorted = [...owned].sort((a, b) => b.points - a.points);
      const best = sorted[0]!;
      const worst = sorted[sorted.length - 1]!;
      lines.push(`Best draft pick: ${best.ownerName} chose ${display(best.player)}, who scored ${best.points} fantasy points.`);
      if (worst !== best) {
        lines.push(`${worst.ownerName} drafted ${display(worst.player)}, who spent the night ${football ? 'on the sideline' : 'warming the bench'}.`);
      }
    }
    const season = [...ctx.season].sort((a, b) => a.rank - b.rank);
    if (season.length > 0) {
      const lead = season[0]!;
      const second = season[1];
      // Season rank is by total (pick + draft points), so the race line uses the same total.
      const total = (r: (typeof season)[number]) => round1(r.points + r.fantasyPoints);
      lines.push(
        second
          ? `Season race: ${lead.name} leads with ${total(lead)} points, ${round1(total(lead) - total(second))} ahead of ${second.name}.`
          : `Season race: ${lead.name} leads with ${total(lead)} points.`,
      );
    }
    return clean(lines.join(' '), `${ctx.game.title} is in the books. Thanks for playing!`);
  }

  async scoutingNotes(game: Game): Promise<Record<string, string>> {
    const file = loadScouting();
    const out: Record<string, string> = {};
    for (const p of rosterPlayers(game)) {
      const line = file[p.id] ?? genericScouting(p);
      out[p.id] = clean(line, genericScouting(p));
    }
    return out;
  }
}

// ---------- bedrock ----------

const SYSTEM =
  'You are a family-friendly sports commentator for a fictional sports league. ' +
  'Never use gambling or money language (no bet, odds, wager, cash, money, stakes). ' +
  'Never mention real leagues or real teams. Write in plain language so newcomers can follow. Keep it short.';

const textSchema = z.object({ text: z.string().min(1) });
const notesSchema = z.object({ notes: z.record(z.string(), z.string()) });
const genSchema = z.object({
  props: z
    .array(
      z.object({
        kind: z.enum(['nextScoreType', 'teamScoresFirst', 'totalPointsOver']),
        question: z.string(),
        options: z.array(z.object({ id: z.string(), label: z.string(), probability: z.number().nullish() })),
        opensAt: z.number(),
        locksAt: z.number(),
        resolvesAt: z.number(),
        untilT: z.number().nullish(),
        atT: z.number().nullish(),
        line: z.number().nullish(),
      }),
    )
    .max(4),
});

function eventSummary(e: GameEvent): string {
  return `t=${e.t}${e.team ? ` ${e.team}` : ''}${e.points ? ` +${e.points}` : ''}: ${e.text}`;
}

type JsonGenerator = <T>(opts: Omit<ConverseJsonOptions<T>, 'client'>) => Promise<T>;

/** Shared prompts, schemas, prop validation and text guardrails for both model providers. */
class GeneratedProvider implements AiContentProvider {
  private readonly fallback = new FallbackProvider();

  constructor(readonly mode: 'bedrock' | 'gemini', private readonly json: JsonGenerator) {}

  async generateProps(ctx: PropGenContext): Promise<Prop[]> {
    if (ctx.game.sport === 'football') return [];
    try {
      const upcoming = ctx.game.events
        .filter((e) => e.t > ctx.gameT)
        .slice(0, 12)
        .map(eventSummary);
      const windows = ctx.existing.map((p) => `[${p.opensAt}, ${p.resolvesAt}]`).join(' ') || 'none';
      const prompt =
        `Game: ${ctx.game.title} (${ctx.game.home.name} home vs ${ctx.game.away.name} away), ${ctx.game.durationSec}s long.\n` +
        `Now: t=${ctx.gameT}s, score home ${ctx.score.home} - away ${ctx.score.away}.\n` +
        `Existing prop windows (opensAt..resolvesAt, do not overlap): ${windows}\n` +
        `Upcoming scripted events:\n${upcoming.join('\n') || '(none)'}\n\n` +
        `Write 1 or 2 pick'em questions. Rules: opensAt >= ${ctx.gameT + 20}, resolvesAt <= ${ctx.game.durationSec}, ` +
        'locksAt - opensAt >= 40, opensAt < locksAt <= resolvesAt.\n' +
        'kind "nextScoreType": option ids three, two, ft (optional other); resolves on next score after locksAt.\n' +
        'kind "teamScoresFirst": option ids home, away (optional none); set untilT in (locksAt, resolvesAt].\n' +
        'kind "totalPointsOver": option ids over, under; set atT in [locksAt, resolvesAt] and line > 0 (combined points).\n' +
        'Option probability is optional, 0-1, summing to 1. Reply JSON only: ' +
        '{"props":[{"kind":"...","question":"...","options":[{"id":"...","label":"..."}],"opensAt":0,"locksAt":0,"resolvesAt":0,"untilT":0,"atT":0,"line":0}]}';
      const out = await this.json({ system: SYSTEM, prompt, schema: genSchema, maxTokens: 900 });
      const candidates = out.props.slice(0, 2).map((p) => {
        let resolver: Record<string, unknown>;
        if (p.kind === 'nextScoreType') resolver = { kind: p.kind, afterT: p.locksAt };
        else if (p.kind === 'teamScoresFirst') resolver = { kind: p.kind, afterT: p.locksAt, untilT: p.untilT ?? p.resolvesAt };
        else resolver = { kind: p.kind, atT: p.atT ?? p.resolvesAt, line: p.line ?? 0 };
        return {
          id: `ai-${ctx.game.id}-${p.opensAt}`,
          gameId: ctx.game.id,
          question: p.question,
          options: p.options.map((o) => (o.probability == null ? { id: o.id, label: o.label } : o)),
          opensAt: p.opensAt,
          locksAt: p.locksAt,
          resolvesAt: p.resolvesAt,
          resolver,
          source: 'ai',
        };
      });
      return validateGeneratedProps(candidates, ctx);
    } catch (err) {
      log('generateProps failed, using fallback', err);
      return this.fallback.generateProps(ctx);
    }
  }

  async explainResult(ctx: ExplainContext): Promise<string> {
    const fb = await this.fallback.explainResult(ctx);
    try {
      const correct = ctx.prop.options.find((o) => o.id === ctx.prop.correctOptionId);
      const ev = decidingEvent(ctx.prop, ctx.events);
      const prompt =
        `Question: ${ctx.prop.question}\nCorrect answer: ${correct?.label ?? 'unknown'}\n` +
        `Deciding play: ${ev ? eventSummary(ev) : 'unknown'}\n` +
        'Explain in 1-2 plain sentences why that answer was right, for someone new to the sport. ' +
        'Reply JSON only: {"text":"..."}';
      const out = await this.json({ system: SYSTEM, prompt, schema: textSchema, maxTokens: 200 });
      return sanitizeText(out.text, fb);
    } catch (err) {
      log('explainResult failed, using fallback', err);
      return fb;
    }
  }

  async recap(ctx: RecapContext): Promise<string> {
    const fb = await this.fallback.recap(ctx);
    try {
      const prompt =
        `Write a fun 3-5 sentence recap for the watch party of ${ctx.game.title}. Use only these facts:\n${fb}\n` +
        'Keep every name and number accurate. Reply JSON only: {"text":"..."}';
      const out = await this.json({ system: SYSTEM, prompt, schema: textSchema, maxTokens: 400 });
      return sanitizeText(out.text, fb);
    } catch (err) {
      log('recap failed, using fallback', err);
      return fb;
    }
  }

  async scoutingNotes(game: Game): Promise<Record<string, string>> {
    const fb = await this.fallback.scoutingNotes(game);
    try {
      const players = rosterPlayers(game);
      const prompt =
        'Write one fun, family-friendly, fictional scouting line (max 25 words) per player.\n' +
        players.map((p) => `${p.id}: ${p.name}${p.nickname ? ` "${p.nickname}"` : ''}, ${p.position}`).join('\n') +
        '\nReply JSON only: {"notes":{"<player id>":"<line>"}}';
      const out = await this.json({ system: SYSTEM, prompt, schema: notesSchema, maxTokens: 900 });
      const result: Record<string, string> = {};
      for (const p of players) {
        const line = out.notes[p.id];
        result[p.id] = typeof line === 'string' && line.trim() ? sanitizeText(line.trim(), fb[p.id]!) : fb[p.id]!;
      }
      return result;
    } catch (err) {
      log('scoutingNotes failed, using fallback', err);
      return fb;
    }
  }
}

export class BedrockProvider extends GeneratedProvider {
  constructor(client?: BedrockLike) {
    super('bedrock', (opts) => converseJson({ ...opts, client }));
  }
}

export class GeminiProvider extends GeneratedProvider {
  constructor(client?: GeminiLike) {
    super('gemini', (opts) => generateGeminiJson({ ...opts, client }));
  }
}

export function createAiProvider(mode?: AiMode, opts?: { client?: BedrockLike; gemini?: GeminiLike }): AiContentProvider {
  const configured = process.env.AI_MODE?.toLowerCase();
  const m: AiMode = mode ?? (configured === 'bedrock' || configured === 'gemini' ? configured : 'fallback');
  if (m === 'bedrock') return new BedrockProvider(opts?.client);
  if (m === 'gemini') return new GeminiProvider(opts?.gemini);
  return new FallbackProvider();
}
