import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PartyLifecycleEvent, Prop } from '../../src/shared/types.js';
import { GameError } from '../../src/game/engine.js';
import { Store } from '../../src/game/store.js';

let dir: string;
let file: string;
let t: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-'));
  file = path.join(dir, 'nested', 'store.json');
  t = 1_000_000;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const mk = () => new Store({ dataFile: file, now: () => t, speed: 4 });

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return undefined;
}

/** Play a whole game: step the clock by `stepGameSec` game seconds, ticking each step. */
function playOut(s: Store, stepGameSec = 5): void {
  const realStep = (stepGameSec / s.speed) * 1000;
  for (let i = 0; i < 200; i++) {
    t += realStep;
    s.tick();
  }
}

describe('seed + persistence', () => {
  it('seeds when the file is missing', () => {
    const s = mk();
    expect(fs.existsSync(file)).toBe(true);
    const demo = s.getParty('demo')!;
    expect(demo.status).toBe('drafting');
    expect(demo.id).toBe('party-demo');
    expect(s.partyMembers('DEMO').map((m) => m.memberId)).toEqual(['maya', 'leo', 'sam', 'priya']);
    const season = s.getSeason('sunday-crew');
    expect(season.rows).toHaveLength(4);
    expect(season.rows.every((r) => r.partiesPlayed === 3)).toBe(true);
    expect(season.rows.reduce((n, r) => n + r.nightsWon, 0)).toBe(3);
    expect(s.getState('DEMO').props).toHaveLength(8);
    expect(s.getCurrentPartyCode('sunday-crew')).toBe('DEMO');
  });

  it('round-trips through the file', () => {
    const s = mk();
    s.draft('DEMO', 'maya', 'har-c-34');
    s.pick('DEMO', 'sam', 'home');
    const v = s.getParty('DEMO')!.version;
    const s2 = mk();
    expect(s2.getParty('DEMO')!.version).toBe(v);
    const st = s2.getState('DEMO');
    expect(st.draftBoard.find((e) => e.player.id === 'har-c-34')?.ownerMemberId).toBe('maya');
    expect(st.picks.find((p) => p.memberId === 'sam')?.optionLabel).toBe('Hawks');
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});

describe('mutations', () => {
  it('creates parties', () => {
    const s = mk();
    const events: PartyLifecycleEvent[] = [];
    s.onLifecycle((e) => events.push(e));
    const p = s.createParty({ crewId: 'sunday-crew' });
    expect(p.code).toMatch(/^[A-Z]{4}$/);
    expect(p.id).toBe(`party-${p.code.toLowerCase()}`);
    expect(p.status).toBe('drafting');
    expect(events).toEqual([{ type: 'party_created', partyId: p.id }]);
    expect(s.getState(p.code).props).toHaveLength(8);
    expect(code(() => s.createParty({ crewId: 'nope' }))).toBe('NOT_FOUND');
    expect(code(() => s.createParty({ crewId: 'sunday-crew', gameId: 'nope' }))).toBe('NOT_FOUND');
  });

  it('joins a household once', () => {
    const s = mk();
    const p = s.createParty({ crewId: 'sunday-crew' });
    expect(code(() => s.joinParty(p.code, 'nobody'))).toBe('NOT_FOUND');
    const v = s.getParty(p.code)!.version;
    s.joinParty(p.code, 'garcias');
    expect(s.getParty(p.code)!.householdIds).toEqual(['garcias', 'sams-place']);
    expect(s.getParty(p.code)!.version).toBe(v);
  });

  it('surfaces draft errors', () => {
    const s = mk();
    s.draft('DEMO', 'maya', 'har-c-34');
    let err: GameError | undefined;
    try {
      s.draft('DEMO', 'leo', 'har-c-34');
    } catch (e) {
      err = e as GameError;
    }
    expect(err?.code).toBe('PLAYER_TAKEN');
    expect(err?.alternatives).toHaveLength(2);
    const game = s.getGame('harbor-vs-summit')!;
    const all = [...game.home.roster, ...game.away.roster];
    for (const a of err!.alternatives!) expect(all.find((p) => p.id === a.id)?.position).toBe('C');
    s.draft('DEMO', 'maya', 'har-pg-1');
    s.draft('DEMO', 'maya', 'har-sg-7');
    expect(code(() => s.draft('DEMO', 'maya', 'har-sf-11'))).toBe('ROSTER_FULL');
    expect(code(() => s.draft('DEMO', 'stranger', 'har-sf-11'))).toBe('NOT_IN_PARTY');
    expect(s.getState('DEMO').ticker[0]).toContain('Maya drafted');
    s.start('DEMO');
    expect(code(() => s.draft('DEMO', 'leo', 'har-sf-11'))).toBe('BAD_STATUS');
  });

  it('lets the latest pick win and reports lock timing', () => {
    const s = mk();
    s.pick('DEMO', 'sam', 'home');
    s.pick('DEMO', 'sam', 'away');
    let st = s.getState('DEMO');
    expect(st.activeProp?.id).toBe('fb-1');
    expect(st.picks.filter((p) => p.memberId === 'sam')).toHaveLength(1);
    expect(st.picks[0].optionLabel).toBe('Foxes');
    expect(st.activeProp?.pickCounts).toEqual({ home: 0, away: 1 });
    expect(code(() => s.pick('DEMO', 'sam', 'zzz'))).toBe('BAD_OPTION');
    expect(code(() => s.pick('DEMO', 'sam', 'home', 'nope'))).toBe('NOT_FOUND');
    expect(code(() => s.pick('DEMO', 'stranger', 'home'))).toBe('NOT_IN_PARTY');

    s.start('DEMO');
    t += 12_000; // gameT 48: fb-1 locked, fb-2 opens at 60 -> 12 game s = 3 real s
    s.tick();
    st = s.getState('DEMO');
    expect(st.activeProp).toBeUndefined();
    let err: GameError | undefined;
    try {
      s.pick('DEMO', 'sam', 'over');
    } catch (e) {
      err = e as GameError;
    }
    expect(err?.code).toBe('PICKS_LOCKED');
    expect(err?.message).toContain('next question opens in about 3 seconds');
  });

  it('says so after the last question', () => {
    const s = mk();
    s.start('DEMO');
    t += 118_000; // gameT 472: fb-8 locks at 460, nothing upcoming
    expect(() => s.pick('DEMO', 'sam', 'over')).toThrow(/last question of the night/);
  });

  it('starts, auto-fills to 3 each and emits party_started', () => {
    const s = mk();
    const events: PartyLifecycleEvent[] = [];
    s.onLifecycle((e) => events.push(e));
    s.draft('DEMO', 'maya', 'har-c-34');
    s.start('DEMO');
    const board = s.getState('DEMO').draftBoard;
    for (const id of ['maya', 'leo', 'sam', 'priya']) {
      expect(board.filter((e) => e.ownerMemberId === id)).toHaveLength(3);
    }
    expect(board.filter((e) => e.auto).length).toBe(11);
    expect(s.getParty('DEMO')!.status).toBe('live');
    expect(s.getParty('DEMO')!.startedAt).toBe(t);
    expect(events.filter((e) => e.type === 'party_started')).toHaveLength(1);
    expect(s.getState('DEMO').ticker.some((l) => l.startsWith('The bench filled in '))).toBe(true);
    expect(code(() => s.start('DEMO'))).toBe('BAD_STATUS');
    expect(() => s.start('DEMO')).toThrow('The game is already underway.');
  });

  it('isolates listener failures and supports unsubscribe', () => {
    const s = mk();
    const seen: string[] = [];
    s.onLifecycle(() => {
      throw new Error('boom');
    });
    const off = s.onLifecycle((e) => seen.push(e.type));
    const orig = console.error;
    console.error = () => {};
    try {
      s.createParty({ crewId: 'sunday-crew' });
    } finally {
      console.error = orig;
    }
    off();
    s.createParty({ crewId: 'sunday-crew' });
    expect(seen).toEqual(['party_created']);
  });
});

describe('full game', () => {
  it('resolves props, finishes, and applies the season exactly once', () => {
    const s = mk();
    const events: PartyLifecycleEvent[] = [];
    s.onLifecycle((e) => events.push(e));
    const before = Object.fromEntries(s.getSeason('sunday-crew').rows.map((r) => [r.memberId, r]));
    s.start('DEMO');
    s.pick('DEMO', 'sam', 'home');
    playOut(s);

    expect(events.filter((e) => e.type === 'prop_resolved')).toHaveLength(8);
    expect(new Set(events.filter((e) => e.type === 'prop_resolved').map((e) => (e as { propId: string }).propId)).size).toBe(8);
    expect(events.filter((e) => e.type === 'party_final')).toHaveLength(1);
    expect(s.getParty('DEMO')!.status).toBe('final');

    const st = s.getState('DEMO');
    const winner = st.standings[0].memberId;
    const after = Object.fromEntries(s.getSeason('sunday-crew').rows.map((r) => [r.memberId, r]));
    for (const id of Object.keys(before)) {
      expect(after[id].partiesPlayed).toBe(before[id].partiesPlayed + 1);
      expect(after[id].nightsWon).toBe(before[id].nightsWon + (id === winner ? 1 : 0));
    }
    expect(after.sam.total).toBeGreaterThan(before.sam.total - 1);

    // Idempotent: more ticks, a state read, and a reload change nothing.
    t += 60_000;
    s.tick();
    s.getState('DEMO');
    const reloaded = mk();
    reloaded.tick();
    for (const row of reloaded.getSeason('sunday-crew').rows) expect(row.partiesPlayed).toBe(before[row.memberId].partiesPlayed + 1);
    expect(events.filter((e) => e.type === 'party_final')).toHaveLength(1);
  });

  it('builds a complete state shape', () => {
    const s = mk();
    s.start('DEMO');
    s.pick('DEMO', 'sam', 'home');
    t += 5_000; // gameT 20
    s.tick();
    let st = s.getState('DEMO', 'garcias');
    expect(st.speed).toBe(4);
    expect(st.serverNow).toBe(t);
    expect(st.game.gameT).toBeCloseTo(20);
    expect(st.game.clock).toMatch(/^Q1 \d+:\d\d$/);
    expect(st.activeProp?.secondsToLock).toBeCloseTo(20);
    expect(st.activeProp?.realSecondsToLock).toBeCloseTo(5);
    expect(st.activeProp?.explanation).toBeUndefined();
    expect(st.draftBoard).toHaveLength(16);
    expect(st.draftBoard[0].side).toBe('home');
    expect(st.draftBoard[8].side).toBe('away');
    expect(st.standings).toHaveLength(4);
    expect(st.households.map((h) => h.id)).toEqual(['garcias', 'sams-place']);
    expect(st.party.crewName).toBe('Sunday Crew');
    expect(() => s.getState('DEMO', 'nobody')).toThrow(GameError);

    t += 200_000; // gameT 480 would be final; stop mid-game instead
    t -= 100_000; // 100 real s -> gameT 420
    s.tick();
    st = s.getState('DEMO');
    expect(st.recentEvents.length).toBeLessThanOrEqual(12);
    expect(st.recentEvents.length).toBeGreaterThan(0);
    for (let i = 1; i < st.recentEvents.length; i++) expect(st.recentEvents[i - 1].t).toBeGreaterThanOrEqual(st.recentEvents[i].t);
    expect(st.recentEvents.some((e) => e.fantasy.length > 0)).toBe(true);
    const pop = st.recentEvents.flatMap((e) => e.fantasy)[0];
    expect(pop.memberName).toBeTruthy();
    expect(pop.playerName).toBeTruthy();
    expect(st.recentEvents[0].id).toMatch(/^harbor-vs-summit-\d+$/);
    expect(st.lastResolvedProp?.status).toBe('resolved');
    expect(st.lastResolvedProp?.explanation).toBeTruthy();
    expect(st.benchwarmerOfTheNight).toBeUndefined();

    t += 100_000;
    s.tick();
    st = s.getState('DEMO');
    expect(st.party.status).toBe('final');
    expect(st.game.clock).toBe('Final');
    expect(st.benchwarmerOfTheNight?.ownerName).toBeTruthy();
    const drafted = st.draftBoard.filter((e) => e.ownerMemberId).map((e) => e.points);
    expect(st.benchwarmerOfTheNight!.points).toBe(Math.min(...drafted));
    expect(st.props.every((p) => p.status === 'resolved')).toBe(true);
    expect(code(() => s.pick('DEMO', 'sam', 'home'))).toBe('BAD_STATUS');
  });

  it('bumps version on changes and not on a no-op tick', () => {
    const s = mk();
    s.start('DEMO');
    t += 4_000;
    s.tick();
    s.tick();
    const v = s.getParty('DEMO')!.version;
    s.tick();
    s.getState('DEMO');
    expect(s.getParty('DEMO')!.version).toBe(v);
    t += 30_000; // gameT 136: events and prop statuses change, fb-3 open
    s.tick();
    const v2 = s.getParty('DEMO')!.version;
    expect(v2).toBeGreaterThan(v);
    s.tick();
    expect(s.getParty('DEMO')!.version).toBe(v2);
    s.pick('DEMO', 'sam', 'over');
    expect(s.getParty('DEMO')!.version).toBeGreaterThan(v2);
  });
});

describe('reset', () => {
  it('restores DEMO and the seed season with a higher version', () => {
    const s = mk();
    s.start('DEMO');
    playOut(s);
    const v = s.getParty('DEMO')!.version;
    expect(s.getSeason('sunday-crew').rows[0].partiesPlayed).toBe(4);
    s.reset('demo');
    const p = s.getParty('DEMO')!;
    expect(p.status).toBe('drafting');
    expect(p.startedAt).toBeUndefined();
    expect(p.version).toBe(v + 1);
    expect(s.getSeason('sunday-crew').rows.every((r) => r.partiesPlayed === 3)).toBe(true);
    const st = s.getState('DEMO');
    expect(st.props).toHaveLength(8);
    expect(st.draftBoard.every((e) => !e.ownerMemberId)).toBe(true);
    expect(code(() => s.reset('ZZZZ'))).toBe('NOT_FOUND');
  });

  it('resets other parties in place', () => {
    const s = mk();
    const p = s.createParty({ crewId: 'sunday-crew' });
    s.draft(p.code, 'maya', 'har-c-34');
    s.start(p.code);
    const v = s.getParty(p.code)!.version;
    s.reset(p.code);
    const after = s.getParty(p.code)!;
    expect(after.id).toBe(p.id);
    expect(after.status).toBe('drafting');
    expect(after.version).toBe(v + 1);
    expect(s.getState(p.code).draftBoard.every((e) => !e.ownerMemberId)).toBe(true);
  });
});

describe('AiSink', () => {
  it('adds props with dedupe, sets recap, explanation and scouting notes', () => {
    const s = mk();
    const ctx = s.getPartyContext('party-demo')!;
    expect(ctx.props).toHaveLength(8);
    expect(ctx.gameT).toBe(0);
    expect(s.getPartyContext('nope')).toBeUndefined();
    const extra: Prop = { ...structuredClone(ctx.props[0]), id: 'ai-1', source: 'ai' };
    let v = s.getParty('DEMO')!.version;
    s.addProps('party-demo', [extra, ctx.props[0]]);
    expect(s.getState('DEMO').props).toHaveLength(9);
    expect(s.getParty('DEMO')!.version).toBe(v + 1);
    s.addProps('party-demo', [extra]);
    expect(s.getState('DEMO').props).toHaveLength(9);
    s.addProps('nope', [extra]);

    v = s.getParty('DEMO')!.version;
    s.setRecap('party-demo', 'What a night.');
    expect(s.getState('DEMO').recap).toBe('What a night.');
    s.setPropExplanation('party-demo', 'fb-1', 'Because.');
    expect(s.getPartyContext('party-demo')!.props.find((p) => p.id === 'fb-1')?.explanation).toBe('Because.');
    s.setScoutingNotes('harbor-vs-summit', { 'har-c-34': 'Rim protector.' });
    expect(s.getParty('DEMO')!.version).toBeGreaterThan(v + 2);
    expect(s.getState('DEMO').draftBoard.find((e) => e.player.id === 'har-c-34')?.scoutingNote).toBe('Rim protector.');

    const rc = s.getRecapContext('party-demo')!;
    expect(rc.standings).toHaveLength(4);
    expect(rc.draftBoard).toHaveLength(16);
    expect(rc.season).toHaveLength(4);
    expect(s.getRecapContext('nope')).toBeUndefined();
    s.setRecap('nope', 'x');
  });
});
