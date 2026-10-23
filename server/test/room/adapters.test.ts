import { describe, expect, it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';

describe('football compatibility before adapter extraction', () => {
  it.each(['balanced', 'stars', 'value'] as const)('keeps the %s auto-lineup legal without future stats', style => {
    const store = new RoomStore({ persist: false, now: () => 1000 });
    const room = store.create();
    const seat = store.join(room.view.room.code, { name: 'Fan' });
    const view = store.autoLineup(room.view.room.code, { participantToken: seat.participantToken, style });
    const lineup = view.me!.lineup!;
    expect(new Set([lineup.captainId, ...lineup.flexIds]).size).toBe(5);
    const salary = (id: string) => view.players.find(p => p.id === id)!.salary;
    expect(lineup.salaryUsed).toBe(Math.round(salary(lineup.captainId) * 1.5) + lineup.flexIds.reduce((sum, id) => sum + salary(id), 0));
    expect(lineup.salaryUsed).toBeLessThanOrEqual(50000);
    expect(view.players.every(p => p.rawPoints === 0)).toBe(true);
  });
});

describe('additive room contract', () => {
  it('selects football by default and explicitly, with authoritative metadata and no future data', () => {
    const store = new RoomStore({ persist: false, now: () => 1234 });
    const created = store.create();
    const view = created.view;
    expect(view.game).toMatchObject({ gameId: 'morning-wood-vs-swiss-cheese', sport: 'football', sourceMode: 'scripted', sourceStatus: 'healthy', context: { sport: 'football', possessionTeamId: null, ballOn: 25, down: null, toGo: null } });
    expect(view).toMatchObject({ version: 1, serverNow: 1234, rulesVersion: 'football-v1' });
    const explicit = store.create({ gameId: 'morning-wood-vs-swiss-cheese' });
    expect(explicit.view.game).toEqual(view.game);
    const json = JSON.stringify(view);
    expect(json).not.toContain(created.hostToken);
    expect(json).not.toContain('outcome');
    expect(json).not.toContain('27–24');
  });

  it('rejects unsupported IDs before creating any room or season', () => {
    const store = new RoomStore({ persist: false });
    for (const gameId of ['unknown', '__proto__', 'constructor', 'harbor-vs-summit']) {
      expect(() => store.create({ gameId })).toThrow(expect.objectContaining({ status: 400, code: 'GAME_NOT_SUPPORTED' }));
    }
    expect(store.list()).toEqual([]);
  });

  it('versions committed changes, keeps reads stable, and never versions rejected edits', () => {
    const store = new RoomStore({ persist: false, now: () => 1234 });
    const room = store.create();
    const code = room.view.room.code;
    const seat = store.join(code, { name: 'Fan' });
    expect(seat.view.version).toBeGreaterThan(room.view.version!);
    expect(store.view(code).version).toBe(seat.view.version);
    expect(() => store.autoLineup(code, { participantToken: 'bad' })).toThrow();
    expect(store.view(code).version).toBe(seat.view.version);
    const ready = store.autoLineup(code, { participantToken: seat.participantToken });
    expect(ready.version).toBeGreaterThan(seat.view.version!);
    const live = store.host(code, { hostToken: room.hostToken, action: 'start' });
    expect(live.game.context).toMatchObject({ sport: 'football', possessionTeamId: live.game.possession, down: 1, toGo: 10 });
  });
});
