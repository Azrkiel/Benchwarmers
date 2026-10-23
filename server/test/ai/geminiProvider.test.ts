import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiProvider, FallbackProvider, GeminiProvider } from '../../src/ai/providers.js';
import { GAMES } from '../../src/game/games.js';
import { checkText } from '../../src/ai/guardrails.js';
import type { GeminiLike } from '../../src/ai/gemini.js';

const game = Object.values(GAMES)[0];
function client(out: unknown): GeminiLike {
  return { generateContent: vi.fn().mockResolvedValue({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(out) }] } }] }) };
}
afterEach(() => vi.unstubAllEnvs());

describe('Gemini game content', () => {
  it('selects Gemini through AI_MODE and keeps explicit fallback selection', () => {
    vi.stubEnv('AI_MODE', 'gemini');
    expect(createAiProvider().mode).toBe('gemini');
    expect(createAiProvider('fallback').mode).toBe('fallback');
  });

  it('sanitizes generated recaps and notes and preserves fallback behavior', async () => {
    const ctx = { game, standings: [], draftBoard: [], season: [] };
    const p = new GeminiProvider(client({ text: 'Great night, no cash needed.' }));
    expect(checkText(await p.recap(ctx)).ok).toBe(true);
    const notes = await new GeminiProvider(client({ notes: { [game.home.roster[0].id]: 'Quick on his feet.' } })).scoutingNotes(game);
    expect(notes[game.home.roster[0].id]).toBe('Quick on his feet.');
    expect(Object.keys(notes)).toHaveLength(game.home.roster.length + game.away.roster.length);
    const broken: GeminiLike = { generateContent: vi.fn().mockRejectedValue(new Error('all keys unavailable')) };
    expect(await new GeminiProvider(broken).recap(ctx)).toBe(await new FallbackProvider().recap(ctx));
  });

  it('validates generated props and drops invalid windows', async () => {
    const prop = {
      kind: 'totalPointsOver', question: 'Will the combined score pass five points?',
      options: [{ id: 'over', label: 'Over' }, { id: 'under', label: 'Under' }],
      opensAt: 20, locksAt: 60, resolvesAt: 80, atT: 80, line: 5,
    };
    const p = new GeminiProvider(client({ props: [prop, { ...prop, opensAt: -20 }] }));
    const props = await p.generateProps({ game, gameT: 0, score: { home: 0, away: 0 }, existing: [] });
    expect(props).toHaveLength(1);
    expect(props[0].source).toBe('ai');
    expect(props[0].resolver).toEqual({ kind: 'totalPointsOver', atT: 80, line: 5 });
  });
});
