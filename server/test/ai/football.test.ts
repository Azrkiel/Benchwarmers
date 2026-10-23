import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { checkText } from '../../src/ai/guardrails.js';
import { GeminiProvider, FallbackProvider, validateGeneratedProps } from '../../src/ai/providers.js';
import { startAiWorker } from '../../src/ai/worker.js';
import type { AiContentProvider, AiSink, DraftBoardEntry, Game, PartyLifecycleEvent, Prop, PropGenContext, RecapContext, WatchParty } from '../../src/shared/types.js';

const football = JSON.parse(
  readFileSync(new URL('../../src/game/games/riverton-vs-ironwood.json', import.meta.url), 'utf8'),
) as Game;
const allProps = JSON.parse(readFileSync(new URL('../../src/ai/fallback/props.json', import.meta.url), 'utf8')) as Prop[];
const driveProps = allProps.filter((p) => p.gameId === football.id);

const RESULT_WORD: Record<string, string> = {
  td: 'touchdown',
  fg: 'field goal',
  punt: 'punt',
  turnover: 'turnover',
  downs: 'turnover on downs',
  end_of_half: 'half',
  missed_fg: 'missed field goal',
  safety: 'safety',
};

describe('football fallback explainResult', () => {
  it('has the 8 drive props', () => {
    expect(driveProps.map((p) => p.id)).toEqual(['ff-1', 'ff-2', 'ff-3', 'ff-4', 'ff-5', 'ff-6', 'ff-7', 'ff-8']);
  });

  it.each(driveProps.map((p) => [p.id, p] as const))('%s names the percentage and result', async (_id, prop) => {
    const events = football.events.filter((e) => e.t <= prop.resolvesAt);
    const text = await new FallbackProvider().explainResult({ game: football, prop, events });
    const pct = Math.round(prop.odds!.p.yes! * 100);
    const r = prop.resolver;
    if (r.kind !== 'driveResult') throw new Error('not a drive prop');
    const end = events.find((e) => e.drive?.id === r.driveId && e.driveResult)!;
    const start = events.find((e) => e.drive?.id === r.driveId)!.drive!;
    expect(text).toContain(`${pct}%`);
    expect(text).toContain(RESULT_WORD[end.driveResult!]);
    expect(text).toContain(start.yardline100 > 50 ? `their own ${100 - start.yardline100}` : `${start.yardline100}`);
    expect(text).toContain(r.outcome === 'td' ? 'get a touchdown' : 'score');
    expect(text).not.toMatch(/\b(bet|wager|payout|odds boost)\b/i);
    expect(checkText(text).ok).toBe(true);
  });

  it('ff-1 matches the spec wording', async () => {
    const prop = driveProps[0]!;
    const text = await new FallbackProvider().explainResult({ game: football, prop, events: football.events.filter((e) => e.t <= prop.resolvesAt) });
    expect(text).toBe('Drives starting at their own 25 with time on the clock score about 36% of the time - this one ended in a touchdown.');
  });

  it('two-minute bucket reads late in the half', async () => {
    const prop = { ...driveProps[0]!, odds: { ...driveProps[0]!.odds!, bucket: '71-80|two-minute' } };
    const text = await new FallbackProvider().explainResult({ game: football, prop, events: football.events.filter((e) => e.t <= prop.resolvesAt) });
    expect(text).toContain('late in the half');
  });
});

describe('football AI props', () => {
  const ctx: PropGenContext = { game: football, gameT: 0, score: { home: 0, away: 0 }, existing: [] };

  it('fallback and model providers return no props', async () => {
    expect(await new FallbackProvider().generateProps(ctx)).toEqual([]);
    const generateContent = vi.fn();
    expect(await new GeminiProvider({ generateContent }).generateProps(ctx)).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('validation rejects a driveResult resolver', () => {
    const raw = {
      id: 'ai-x',
      gameId: football.id,
      question: 'Will they score on this drive?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      opensAt: 100,
      locksAt: 150,
      resolvesAt: 200,
      resolver: { kind: 'driveResult', driveId: 'd01', outcome: 'score' },
      source: 'ai',
    };
    expect(validateGeneratedProps([raw], ctx)).toEqual([]);
  });

  it('worker never asks a model provider for football props', async () => {
    let listener: ((e: PartyLifecycleEvent) => void) | undefined;
    const sink: AiSink = {
      onLifecycle: (l) => {
        listener = l;
        return () => undefined;
      },
      getPartyContext: () => ({ game: football, party: { id: 'a' } as WatchParty, props: [], gameT: 5, score: { home: 0, away: 0 } }),
      getRecapContext: () => undefined,
      addProps: vi.fn(),
      setPropExplanation: vi.fn(),
      setRecap: vi.fn(),
      setScoutingNotes: vi.fn(),
    };
    const provider = {
      mode: 'gemini',
      generateProps: vi.fn(async () => [] as Prop[]),
      explainResult: vi.fn(async () => ''),
      recap: vi.fn(async () => ''),
      scoutingNotes: vi.fn(async () => ({}) as Record<string, string>),
    } satisfies AiContentProvider;
    const w = startAiWorker({ sink, provider });
    listener!({ type: 'party_created', partyId: 'a' });
    listener!({ type: 'party_started', partyId: 'a' });
    await w.idle();
    expect(provider.generateProps).not.toHaveBeenCalled();
    w.stop();
  });
});

describe('football recap and scouting', () => {
  it('recap uses football wording', async () => {
    const qb = football.away.roster.find((p) => p.position === 'QB')!;
    const k = football.home.roster.find((p) => p.position === 'K')!;
    const board = (player: typeof qb, owner: string, points: number): DraftBoardEntry => ({
      player, side: 'away', teamShort: 'RIV', ownerMemberId: owner.toLowerCase(), ownerName: owner, points, statLine: `${points} pts`,
    });
    const ctx: RecapContext = { game: football, standings: [], draftBoard: [board(qb, 'Maya', 20), board(k, 'Leo', 0)], season: [] };
    const text = await new FallbackProvider().recap(ctx);
    expect(text).toContain(football.title);
    expect(text).toContain('on the sideline');
    expect(text).not.toMatch(/bench|tip-off|buzzer/i);
  });

  it('scouting notes cover the football roster with real notes', async () => {
    const notes = await new FallbackProvider().scoutingNotes(football);
    const players = [...football.home.roster, ...football.away.roster];
    expect(Object.keys(notes)).toHaveLength(players.length);
    for (const p of players) expect(notes[p.id]).not.toContain('is one to watch tonight');
  });
});
