import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkText } from '../../src/ai/guardrails.js';
import { BedrockProvider, createAiProvider, FallbackProvider, validateGeneratedProps } from '../../src/ai/providers.js';
import type { DraftBoardEntry, Game, GameEvent, Player, Prop, PropGenContext, RecapContext, StandingRow } from '../../src/shared/types.js';

const realGame = JSON.parse(
  readFileSync(new URL('../../src/game/games/harbor-vs-summit.json', import.meta.url), 'utf8'),
) as Game;

const ev = (t: number, team: 'home' | 'away', points: number, text: string): GameEvent => ({
  t,
  type: 'score',
  team,
  points,
  text,
  tags: [],
});

const game: Game = {
  ...realGame,
  id: 'g1',
  durationSec: 480,
  events: [ev(60, 'home', 3, 'Jet hits a three'), ev(130, 'away', 2, 'Rafa finishes at the rim'), ev(200, 'home', 1, 'Splash at the line')],
};

const ctx: PropGenContext = { game, gameT: 50, score: { home: 10, away: 8 }, existing: [] };

function reply(text: string) {
  return { output: { message: { content: [{ text }] } }, usage: { inputTokens: 5, outputTokens: 5 } };
}

function client(...texts: string[]) {
  const send = vi.fn();
  for (const t of texts) send.mockResolvedValueOnce(reply(t));
  send.mockResolvedValue(reply(texts[texts.length - 1] ?? ''));
  return { send };
}

const nextScore = {
  kind: 'nextScoreType',
  question: 'What kind of score comes next?',
  options: [
    { id: 'three', label: 'A three' },
    { id: 'two', label: 'A two' },
    { id: 'ft', label: 'A free throw' },
  ],
  opensAt: 100,
  locksAt: 160,
  resolvesAt: 220,
};

describe('BedrockProvider.generateProps', () => {
  it('accepts valid props', async () => {
    const c = client(JSON.stringify({ props: [nextScore] }));
    const props = await new BedrockProvider(c).generateProps(ctx);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({
      id: 'ai-g1-100',
      gameId: 'g1',
      source: 'ai',
      opensAt: 100,
      locksAt: 160,
      resolver: { kind: 'nextScoreType', afterT: 160 },
    });
    const prompt = JSON.stringify(c.send.mock.calls[0]![0].input);
    expect(prompt).toContain('Jet hits a three');
  });

  it('accepts teamScoresFirst and totalPointsOver, drops overlapping second prop', async () => {
    const tsf = {
      kind: 'teamScoresFirst',
      question: 'Who scores first?',
      options: [
        { id: 'home', label: 'Hawks' },
        { id: 'away', label: 'Foxes' },
      ],
      opensAt: 250,
      locksAt: 300,
      resolvesAt: 340,
      untilT: 340,
    };
    const tpo = {
      kind: 'totalPointsOver',
      question: 'Will the total pass 60?',
      options: [
        { id: 'over', label: 'Over' },
        { id: 'under', label: 'Under' },
      ],
      opensAt: 400,
      locksAt: 430,
      resolvesAt: 470,
      atT: 470,
      line: 60,
    };
    const props = await new BedrockProvider(client(JSON.stringify({ props: [tsf, tpo] }))).generateProps(ctx);
    expect(props.map((p) => p.resolver.kind)).toEqual(['teamScoresFirst']); // tpo lock gap is only 30
  });

  it('drops invalid props', async () => {
    const bad = [
      { ...nextScore, opensAt: 55, locksAt: 120, resolvesAt: 150 }, // opens before gameT + 20? 55 < 70
      { ...nextScore, opensAt: 100, locksAt: 130, resolvesAt: 200 }, // lock window < 40
      { ...nextScore, resolvesAt: 9999 }, // past the game
      { ...nextScore, options: [{ id: 'three', label: 'A' }, { id: 'banana', label: 'B' }, { id: 'ft', label: 'C' }] },
      { ...nextScore, question: 'Place a bet on the next score?' },
      { ...nextScore, options: [{ id: 'three', label: 'Cash prize' }, { id: 'two', label: 'B' }, { id: 'ft', label: 'C' }] },
    ];
    const props = await new BedrockProvider(client(JSON.stringify({ props: bad }))).generateProps(ctx);
    expect(props).toEqual([]);
  });

  it('drops props overlapping existing windows', async () => {
    const existing: Prop[] = [
      {
        id: 'p1',
        gameId: 'g1',
        question: 'q',
        options: [],
        opensAt: 90,
        locksAt: 130,
        resolvesAt: 150,
        resolver: { kind: 'nextScoreType', afterT: 130 },
        source: 'fallback',
      },
    ];
    const props = await new BedrockProvider(client(JSON.stringify({ props: [nextScore] }))).generateProps({ ...ctx, existing });
    expect(props).toEqual([]);
  });

  it('falls back to [] after invalid JSON twice', async () => {
    const send = vi.fn().mockResolvedValue(reply('not json at all'));
    const props = await new BedrockProvider({ send }).generateProps(ctx);
    expect(props).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('validateGeneratedProps', () => {
  const full = (over: Record<string, unknown> = {}) => ({
    id: 'ai-g1-100',
    gameId: 'g1',
    source: 'ai',
    ...nextScore,
    resolver: { kind: 'nextScoreType', afterT: 160 },
    ...over,
  });

  it('never throws on garbage', () => {
    expect(validateGeneratedProps(null, ctx)).toEqual([]);
    expect(validateGeneratedProps([null, 3, 'x', {}, { options: 5 }], ctx)).toEqual([]);
  });

  it('requires ai- id prefix and ai source', () => {
    expect(validateGeneratedProps([full({ id: 'x-1' })], ctx)).toEqual([]);
    expect(validateGeneratedProps([full({ source: 'fallback' })], ctx)).toEqual([]);
    expect(validateGeneratedProps([full()], ctx)).toHaveLength(1);
  });

  it('checks probabilities and resolver consistency', () => {
    const opts = (p: number[]) => [
      { id: 'three', label: 'A', probability: p[0] },
      { id: 'two', label: 'B', probability: p[1] },
      { id: 'ft', label: 'C', probability: p[2] },
    ];
    expect(validateGeneratedProps([full({ options: opts([0.5, 0.3, 0.2]) })], ctx)).toHaveLength(1);
    expect(validateGeneratedProps([full({ options: opts([0.9, 0.9, 0.9]) })], ctx)).toEqual([]);
    expect(validateGeneratedProps([full({ resolver: { kind: 'nextScoreType', afterT: 100 } })], ctx)).toEqual([]);
  });

  it('drops overlap among returned props', () => {
    const a = full();
    const b = full({ id: 'ai-g1-120', opensAt: 120, locksAt: 170, resolvesAt: 230, resolver: { kind: 'nextScoreType', afterT: 170 } });
    expect(validateGeneratedProps([a, b], ctx)).toHaveLength(1);
  });
});

function standing(memberId: string, name: string, rank: number, roster: StandingRow['roster']): StandingRow {
  return {
    memberId,
    name,
    household: 'h',
    householdId: 'h',
    avatar: 'a',
    rank,
    prevRank: rank,
    total: 50,
    draftPoints: 30,
    pickPoints: 20,
    streak: 0,
    roster,
  };
}

function board(player: Player, owner: string, points: number): DraftBoardEntry {
  return { player, side: 'home', teamShort: 'HAR', ownerMemberId: owner.toLowerCase(), ownerName: owner, points, statLine: `${points} pts` };
}

const byId = (id: string) => [...realGame.home.roster, ...realGame.away.roster].find((p) => p.id === id)!;

const recapCtx: RecapContext = {
  game,
  standings: [
    standing('maya', 'Maya', 1, [{ memberId: 'maya', playerId: 'har-pg-1', points: 31.5, statLine: '5 pts2, 3 pts3' }]),
    standing('leo', 'Leo', 2, [{ memberId: 'leo', playerId: 'har-c-34', points: 0, statLine: 'DNP' }]),
  ],
  draftBoard: [board(byId('har-pg-1'), 'Maya', 31.5), board(byId('har-c-34'), 'Leo', 0)],
  season: [
    { memberId: 'maya', name: 'Maya', household: 'The Garcias', householdId: 'garcias', avatar: 'a', rank: 1, points: 120, bestStreak: 3, currentStreak: 1, correct: 8, total: 12, partiesPlayed: 4, fantasyPoints: 90, nightsWon: 2 },
    { memberId: 'leo', name: 'Leo', household: 'The Garcias', householdId: 'garcias', avatar: 'a', rank: 2, points: 100, bestStreak: 2, currentStreak: 0, correct: 6, total: 12, partiesPlayed: 4, fantasyPoints: 70, nightsWon: 1 },
  ],
};

describe('FallbackProvider', () => {
  it('generateProps is empty', async () => {
    expect(await new FallbackProvider().generateProps(ctx)).toEqual([]);
  });

  it('explain uses prop.explanation when present', async () => {
    const prop: Prop = { ...(full0() as Prop), explanation: 'Because Jet was hot.' };
    expect(await new FallbackProvider().explainResult({ game, prop, events: game.events })).toBe('Because Jet was hot.');
  });

  it('explain template names the correct label and deciding play', async () => {
    const prop: Prop = { ...(full0() as Prop), correctOptionId: 'two' };
    const text = await new FallbackProvider().explainResult({ game, prop, events: game.events });
    expect(text).toContain('A two');
    expect(text).toContain('Splash at the line');
    expect(checkText(text).ok).toBe(true);
  });

  it('recap mentions best and worst draft picks', async () => {
    const text = await new FallbackProvider().recap(recapCtx);
    expect(text).toContain('Jet');
    expect(text).toContain('Leo drafted Big Mo, who spent the night warming the bench');
    expect(text).toContain('Maya leads');
    expect(text).toContain('20 ahead of Leo');
    expect(checkText(text).ok).toBe(true);
  });

  it('scouting.json covers all 16 roster ids with clean lines', () => {
    const file = JSON.parse(readFileSync(new URL('../../src/ai/fallback/scouting.json', import.meta.url), 'utf8')) as Record<string, string>;
    const ids = [...realGame.home.roster, ...realGame.away.roster].map((p) => p.id);
    expect(ids).toHaveLength(16);
    for (const id of ids) {
      expect(typeof file[id]).toBe('string');
      expect(checkText(file[id]!).ok).toBe(true);
    }
  });

  it('scoutingNotes returns notes for each roster id, generic for unknown ids', async () => {
    const notes = await new FallbackProvider().scoutingNotes(realGame);
    expect(Object.keys(notes)).toHaveLength(16);
    const custom: Game = {
      ...realGame,
      home: { ...realGame.home, roster: [{ id: 'zzz-1', teamId: 'x', name: 'Zed Zee', number: 9, position: 'PG' }] },
      away: { ...realGame.away, roster: [] },
    };
    const n2 = await new FallbackProvider().scoutingNotes(custom);
    expect(n2['zzz-1']).toContain('Zed Zee');
  });
});

function full0(): Record<string, unknown> {
  return {
    id: 'p0',
    gameId: 'g1',
    question: 'What kind of score comes next?',
    options: nextScore.options,
    opensAt: 100,
    locksAt: 160,
    resolvesAt: 220,
    resolver: { kind: 'nextScoreType', afterT: 160 },
    source: 'fallback',
  };
}

describe('BedrockProvider text calls', () => {
  it('uses model text, sanitized', async () => {
    const p = new BedrockProvider(client(JSON.stringify({ text: 'Great night, no cash needed.' })));
    const text = await p.recap(recapCtx);
    expect(checkText(text).ok).toBe(true);
    expect(text).toContain('points');
  });

  it('explain and recap fall back to templates after invalid JSON twice', async () => {
    const send = vi.fn().mockResolvedValue(reply('nope'));
    const p = new BedrockProvider({ send });
    const prop: Prop = { ...(full0() as Prop), correctOptionId: 'three' };
    expect(await p.explainResult({ game, prop, events: game.events })).toContain('A three');
    expect(await p.recap(recapCtx)).toContain('warming the bench');
  });

  it('scoutingNotes fills missing ids from fallback', async () => {
    const p = new BedrockProvider(client(JSON.stringify({ notes: { 'har-pg-1': 'Fast and fun.', bogus: 'ignored' } })));
    const notes = await p.scoutingNotes(realGame);
    expect(notes['har-pg-1']).toBe('Fast and fun.');
    expect(notes['sum-sf-8']).toContain('Frosty');
    expect(notes.bogus).toBeUndefined();
    expect(Object.keys(notes)).toHaveLength(16);
  });
});

describe('createAiProvider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to fallback with no env', () => {
    vi.stubEnv('AI_MODE', '');
    expect(createAiProvider().mode).toBe('fallback');
  });

  it('honours AI_MODE=bedrock and explicit mode', () => {
    vi.stubEnv('AI_MODE', 'bedrock');
    expect(createAiProvider().mode).toBe('bedrock');
    expect(createAiProvider('fallback').mode).toBe('fallback');
  });
});
