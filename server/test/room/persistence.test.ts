import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { football } from '../../src/room/sports/football.js';

let dir: string;
let dataFile: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-contract-')); dataFile = path.join(dir, 'rooms.json'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });
const setup = () => new RoomStore({ dataFile, now: () => 1000 });
const read = () => fs.readFileSync(dataFile, 'utf8');
function legacyFile() {
  const store = setup();
  const room = store.create({ seasonId: 'friends' });
  const seat = store.join(room.view.room.code, { name: 'Fan' });
  store.autoLineup(room.view.room.code, { participantToken: seat.participantToken });
  const saved = JSON.parse(read());
  saved.version = 1;
  for (const r of saved.rooms) { delete r.gameId; delete r.rulesVersion; delete r.version; }
  const json = JSON.stringify(saved);
  fs.writeFileSync(dataFile, json);
  return { room, seat, json };
}

describe('versioned room persistence', () => {
  it('validates and backs up v1 before migrating, preserving identities, lineups and season totals', () => {
    const { room, seat, json } = legacyFile();
    const saved = JSON.parse(json);
    saved.seasons[0].standings.push({ participantId: seat.participantId, name: 'Fan', points: 42, fantasyPoints: 32, predictionPoints: 10, nightsPlayed: 1, nightsWon: 1 });
    fs.writeFileSync(dataFile, JSON.stringify(saved));
    const original = read();
    const store = setup();
    const view = store.view(room.view.room.code, seat.participantToken);
    expect(view.game.gameId).toBe('morning-wood-vs-swiss-cheese');
    expect(view.me?.lineup).toEqual(seat.view.me?.lineup ?? JSON.parse(original).rooms[0].participants[0].lineup);
    expect(view.season.standings[0].points).toBe(42);
    expect(fs.readFileSync(`${dataFile}.v1.bak`, 'utf8')).toBe(original);
    expect(JSON.parse(read()).version).toBe(2);
    expect(store.join(room.view.room.code, { name: 'Fan', participantToken: seat.participantToken }).participantId).toBe(seat.participantId);
    expect(setup().view(room.view.room.code).version).toBe(view.version);
  });

  it('fails visibly on unknown versions and malformed rooms without overwriting the source', () => {
    for (const value of [{ version: 99, rooms: [], seasons: [] }, { version: 1, rooms: [{}], seasons: [] }]) {
      fs.writeFileSync(dataFile, JSON.stringify(value));
      const original = read();
      expect(setup).toThrow(/room data.*(version|invalid|validation)|invalid.*room data/i);
      expect(read()).toBe(original);
      expect(fs.existsSync(`${dataFile}.v1.bak`)).toBe(false);
    }
  });

  it('keeps a v1 source intact when migration cannot commit', () => {
    legacyFile();
    const original = read();
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect(setup).toThrow();
    expect(read()).toBe(original);
    expect(fs.readFileSync(`${dataFile}.v1.bak`, 'utf8')).toBe(original);
  });
});

describe('atomic room mutations', () => {
  it('versions restored deadlines without consuming offline response time', () => {
    let now = 1000;
    let store = new RoomStore({ dataFile, now: () => now });
    const created = store.create();
    const code = created.view.room.code;
    store.host(code, { hostToken: created.hostToken, action: 'start' });
    now += 2000; store.tick();
    const before = store.view(code);
    now += 60000;
    store = new RoomStore({ dataFile, now: () => now });
    const after = store.view(code);
    expect(after.question?.remainingMs).toBe(before.question?.remainingMs);
    expect(after.question?.locksAt).toBe(before.question!.locksAt + 60000);
    expect(after.version).toBeGreaterThan(before.version);
    expect(JSON.parse(read()).rooms[0].version).toBe(after.version);
  });

  it('rolls back the terminal result and season together, then records the retried final exactly once', () => {
    let now = 1000;
    const store = new RoomStore({ dataFile, now: () => now });
    const room = store.create();
    const code = room.view.room.code;
    store.join(code, { name: 'Fan' });
    store.host(code, { hostToken: room.hostToken, action: 'start' });
    while (JSON.parse(read()).rooms[0].beatIndex < football.beats.length - 2) { now += 1000; store.tick(); }
    const before = store.view(code);
    const saved = JSON.parse(read()).rooms[0];
    const advance = saved.durationMs - saved.elapsedMs;
    now += advance;
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect(() => store.tick()).toThrow(expect.objectContaining({ code: 'ROOM_SAVE_FAILED' }));
    now -= advance;
    expect(store.view(code)).toEqual(before);
    expect(JSON.parse(read()).seasons[0].standings).toEqual([]);
    vi.restoreAllMocks(); now += advance; store.tick();
    expect(store.view(code).room.phase).toBe('final');
    expect(store.view(code).season.standings[0].nightsPlayed).toBe(1);
    const restored = new RoomStore({ dataFile, now: () => now });
    restored.tick();
    expect(restored.view(code).season.standings[0].nightsPlayed).toBe(1);
    expect(restored.view(code).game.home.score).toBe(27);
    expect(restored.view(code).game.away.score).toBe(24);
  });

  it.each(['create', 'join', 'lineup', 'manual-lineup', 'host', 'pick', 'tick'] as const)('rolls back %s on save failure and permits a safe retry', operation => {
    let now = 1000;
    const store = new RoomStore({ dataFile, now: () => now });
    const room = store.create();
    const code = room.view.room.code;
    const seat = store.join(code, { name: 'Fan' });
    if (operation === 'manual-lineup') store.autoLineup(code, { participantToken: seat.participantToken, style: 'value' });
    if (operation === 'pick' || operation === 'tick') store.host(code, { hostToken: room.hostToken, action: 'start' });
    if (operation === 'pick') store.pick(code, { participantToken: seat.participantToken, questionId: store.view(code).question!.id, optionId: 'PUNT' });
    const before = store.view(code, seat.participantToken);
    const diskBefore = read();
    const run = () => {
      switch (operation) {
        case 'create': return store.create({ seasonId: 'new-season' });
        case 'join': return store.join(code, { name: 'New Fan' });
        case 'lineup': return store.autoLineup(code, { participantToken: seat.participantToken });
        case 'manual-lineup': return store.setLineup(code, { participantToken: seat.participantToken, captainId: 'will-power', flexIds: ['max-yardage', 'robin-banks', 'hugh-jass', 'ben-dover'] });
        case 'host': return store.host(code, { hostToken: room.hostToken, action: 'start' });
        case 'pick': return store.pick(code, { participantToken: seat.participantToken, questionId: before.question!.id, optionId: before.question!.options[0].id });
        case 'tick': return store.tick();
      }
    };
    if (operation === 'tick') now += 1000;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect(run).toThrow(expect.objectContaining({ status: 503, code: 'ROOM_SAVE_FAILED' }));
    expect(read()).toBe(diskBefore);
    rename.mockRestore();
    // Inspect at the old clock so this assertion cannot advance an otherwise healthy replay.
    if (operation === 'tick') now -= 1000;
    expect(store.view(code, seat.participantToken)).toEqual(before);
    expect(store.list()).toHaveLength(1);
    expect(setup().view(code, seat.participantToken)).toEqual(before);
    if (operation === 'tick') now += 1000;
    expect(run).not.toThrow();
    expect(JSON.parse(read()).version).toBe(2);
  });
});
