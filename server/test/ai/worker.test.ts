import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAiProvider } from '../../src/ai/providers.js';
import { startAiWorker } from '../../src/ai/worker.js';
import type {
  AiContentProvider,
  AiMode,
  AiSink,
  Game,
  PartyLifecycleEvent,
  Prop,
  RecapContext,
  WatchParty,
} from '../../src/shared/types.js';

const realGame = JSON.parse(
  readFileSync(new URL('../../src/game/games/harbor-vs-summit.json', import.meta.url), 'utf8'),
) as Game;

const mkProp = (id: string, extra: Partial<Prop> = {}): Prop => ({
  id,
  gameId: 'g1',
  question: 'Q?',
  options: [{ id: 'a', label: 'A' }],
  opensAt: 10,
  locksAt: 50,
  resolvesAt: 100,
  resolver: { kind: 'nextScoreType', afterT: 50 },
  correctOptionId: 'a',
  source: 'fallback',
  ...extra,
});

function fakeSink(parties: Record<string, { gameId: string; props?: Prop[] }>) {
  let listener: ((e: PartyLifecycleEvent) => void) | undefined;
  const calls = {
    scouting: [] as [string, Record<string, string>][],
    addProps: [] as [string, Prop[]][],
    explanation: [] as [string, string, string][],
    recap: [] as [string, string][],
  };
  const recapCtx = { game: realGame, standings: [], draftBoard: [], season: [] } as RecapContext;
  const sink: AiSink = {
    onLifecycle(l) {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    getPartyContext(id) {
      const p = parties[id];
      if (!p) return undefined;
      return {
        game: { ...realGame, id: p.gameId },
        party: { id } as WatchParty,
        props: p.props ?? [],
        gameT: 5,
        score: { home: 1, away: 2 },
      };
    },
    getRecapContext: (id) => (parties[id] ? recapCtx : undefined),
    addProps: (id, props) => void calls.addProps.push([id, props]),
    setPropExplanation: (id, pid, t) => void calls.explanation.push([id, pid, t]),
    setRecap: (id, t) => void calls.recap.push([id, t]),
    setScoutingNotes: (g, n) => void calls.scouting.push([g, n]),
  };
  return { sink, calls, emit: (e: PartyLifecycleEvent) => listener?.(e), subscribed: () => listener !== undefined };
}

function fakeProvider(mode: AiMode, props: Prop[] = [mkProp('gen')]) {
  return {
    mode,
    generateProps: vi.fn(async (..._a: unknown[]) => props),
    explainResult: vi.fn(async (..._a: unknown[]) => 'because'),
    recap: vi.fn(async (..._a: unknown[]) => 'recap text'),
    scoutingNotes: vi.fn(async (..._a: unknown[]) => ({ p1: 'note' }) as Record<string, string>),
  } satisfies AiContentProvider;
}

describe('ai worker', () => {
  it('generates props on creation and start in Gemini mode', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const provider = fakeProvider('gemini');
    const w = startAiWorker({ sink: f.sink, provider });
    f.emit({ type: 'party_created', partyId: 'a' });
    f.emit({ type: 'party_started', partyId: 'a' });
    await w.idle();
    expect(provider.generateProps).toHaveBeenCalledTimes(2);
    expect(f.calls.addProps).toHaveLength(2);
    w.stop();
  });
  it('sets scouting notes once per gameId across parties', async () => {
    const f = fakeSink({ a: { gameId: 'g1' }, b: { gameId: 'g1' }, c: { gameId: 'g2' } });
    const provider = fakeProvider('fallback');
    const w = startAiWorker({ sink: f.sink, provider });
    f.emit({ type: 'party_created', partyId: 'a' });
    f.emit({ type: 'party_created', partyId: 'b' });
    f.emit({ type: 'party_created', partyId: 'c' });
    await w.idle();
    expect(f.calls.scouting.map((c) => c[0])).toEqual(['g1', 'g2']);
    expect(provider.scoutingNotes).toHaveBeenCalledTimes(2);
  });

  it('retries scouting after a failure', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const provider = fakeProvider('fallback');
    provider.scoutingNotes.mockRejectedValueOnce(new Error('boom'));
    const log = vi.fn();
    const w = startAiWorker({ sink: f.sink, provider, log });
    f.emit({ type: 'party_created', partyId: 'a' });
    await w.idle();
    expect(f.calls.scouting).toHaveLength(0);
    expect(log).toHaveBeenCalled();
    f.emit({ type: 'party_created', partyId: 'a' });
    await w.idle();
    expect(f.calls.scouting).toHaveLength(1);
  });

  it('adds props on party_created in gemini mode, not in fallback', async () => {
    const fb = fakeSink({ a: { gameId: 'g1' } });
    const fbProv = fakeProvider('fallback');
    const w1 = startAiWorker({ sink: fb.sink, provider: fbProv });
    fb.emit({ type: 'party_created', partyId: 'a' });
    fb.emit({ type: 'party_started', partyId: 'a' });
    await w1.idle();
    expect(fb.calls.addProps).toHaveLength(0);
    expect(fbProv.generateProps).not.toHaveBeenCalled();

    const br = fakeSink({ a: { gameId: 'g1' } });
    const brProv = fakeProvider('gemini');
    const w2 = startAiWorker({ sink: br.sink, provider: brProv });
    br.emit({ type: 'party_created', partyId: 'a' });
    await w2.idle();
    expect(br.calls.addProps).toHaveLength(1);
    expect(brProv.generateProps).toHaveBeenCalledWith(expect.objectContaining({ gameT: 5, score: { home: 1, away: 2 }, existing: [] }));
    br.emit({ type: 'party_started', partyId: 'a' });
    await w2.idle();
    expect(br.calls.addProps).toHaveLength(2);
  });

  it('does not add props when the provider returns none', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const w = startAiWorker({ sink: f.sink, provider: fakeProvider('gemini', []) });
    f.emit({ type: 'party_started', partyId: 'a' });
    await w.idle();
    expect(f.calls.addProps).toHaveLength(0);
  });

  it('sets explanation on prop_resolved, skips when already present', async () => {
    const f = fakeSink({ a: { gameId: 'g1', props: [mkProp('p1'), mkProp('p2', { explanation: 'done' })] } });
    const provider = fakeProvider('fallback');
    const w = startAiWorker({ sink: f.sink, provider });
    f.emit({ type: 'prop_resolved', partyId: 'a', propId: 'p1' });
    f.emit({ type: 'prop_resolved', partyId: 'a', propId: 'p2' });
    f.emit({ type: 'prop_resolved', partyId: 'a', propId: 'missing' });
    await w.idle();
    expect(f.calls.explanation).toEqual([['a', 'p1', 'because']]);
    expect(provider.explainResult).toHaveBeenCalledTimes(1);
  });

  it('sets recap on party_final', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const w = startAiWorker({ sink: f.sink, provider: fakeProvider('fallback') });
    f.emit({ type: 'party_final', partyId: 'a' });
    f.emit({ type: 'party_final', partyId: 'nope' });
    await w.idle();
    expect(f.calls.recap).toEqual([['a', 'recap text']]);
  });

  it('survives a throwing provider and keeps running later jobs', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const provider = fakeProvider('fallback');
    provider.recap.mockRejectedValueOnce(new Error('nope'));
    const log = vi.fn();
    const w = startAiWorker({ sink: f.sink, provider, log });
    expect(() => f.emit({ type: 'party_final', partyId: 'a' })).not.toThrow();
    f.emit({ type: 'party_final', partyId: 'a' });
    await expect(w.idle()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(f.calls.recap).toHaveLength(1);
  });

  it('stop() unsubscribes and drops queued work', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const provider = fakeProvider('fallback');
    const w = startAiWorker({ sink: f.sink, provider });
    f.emit({ type: 'party_final', partyId: 'a' });
    w.stop();
    expect(f.subscribed()).toBe(false);
    f.emit({ type: 'party_final', partyId: 'a' });
    await w.idle();
    expect(provider.recap).not.toHaveBeenCalled();
    expect(f.calls.recap).toHaveLength(0);
  });

  it('idle() resolves after the queue drains, including late jobs', async () => {
    const f = fakeSink({ a: { gameId: 'g1' } });
    const provider = fakeProvider('fallback');
    let release!: () => void;
    provider.recap.mockImplementationOnce(() => new Promise<string>((r) => (release = () => r('slow'))));
    const w = startAiWorker({ sink: f.sink, provider });
    f.emit({ type: 'party_final', partyId: 'a' });
    let done = false;
    const idle = w.idle().then(() => (done = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(done).toBe(false);
    f.emit({ type: 'party_final', partyId: 'a' });
    release();
    await idle;
    expect(done).toBe(true);
    expect(f.calls.recap).toHaveLength(2);
  });

  it('works end to end with the real fallback provider', async () => {
    const f = fakeSink({ a: { gameId: realGame.id } });
    const w = startAiWorker({ sink: f.sink, provider: createAiProvider('fallback') });
    f.emit({ type: 'party_created', partyId: 'a' });
    await w.idle();
    expect(f.calls.scouting).toHaveLength(1);
    expect(Object.keys(f.calls.scouting[0]![1])).toHaveLength(16);
  });
});
