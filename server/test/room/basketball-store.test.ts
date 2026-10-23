import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';

describe('basketball adapter in durable rooms', () => {
  it('preserves eight active seconds through 4x speed, pause, restart and a timer stall', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basketball-room-'));
    try {
      const dataFile = path.join(dir, 'rooms.json');
      let now = 1000;
      let store = new RoomStore({ dataFile, now: () => now });
      const created = store.create({ gameId: 'harbor-vs-summit', speed: 4 });
      const code = created.view.room.code;
      const seat = store.join(code, { name: 'Fan' });
      const host = (action: 'start'|'pause'|'resume'|'set_speed', speed?: number) => store.host(code, { hostToken: created.hostToken, action, speed });
      host('start'); now += 100000;
      let view = store.view(code);
      expect(view.question!.remainingMs).toBe(8000);
      expect(view.game.context).toMatchObject({ sport: 'basketball', possessionTeamId: 'summit', possessionPlayerId: null, ball: null, tracking: 'team_possession' });
      expect(view.question!.target!.anchorSequence).toBeGreaterThan(0);
      expect(JSON.stringify(view)).not.toContain('legacy-005');
      store.pick(code, { participantToken: seat.participantToken, requestId:'smoke-pick', questionId: view.question!.id, optionId: 'harbor' });
      now += 2000; host('pause'); now += 30000;
      expect(store.view(code).question!.remainingMs).toBe(6000);
      now += 500000; store = new RoomStore({ dataFile, now: () => now });
      expect(store.view(code, seat.participantToken).me!.currentPick?.optionId).toBe('harbor');
      expect(store.view(code).question!.remainingMs).toBe(6000);
      host('resume'); host('set_speed', 1); host('set_speed', 4);
      expect(store.view(code).question!.remainingMs).toBeGreaterThanOrEqual(6000);
      now += 5999;
      expect(store.view(code).question!.status).toBe('open');
      now += 1;
      expect(store.view(code).question!.status).toBe('locked');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('finishes at 57–56, applies captain points and records the season only once after restart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basketball-final-'));
    try {
      const dataFile = path.join(dir, 'rooms.json'); let now = 1000;
      let store = new RoomStore({ dataFile, now: () => now });
      const created = store.create({ gameId: 'harbor-vs-summit', speed: 4 }); const code = created.view.room.code;
      const seat = store.join(code, { name: 'Fan' });
      store.autoLineup(code, { participantToken: seat.participantToken });
      store.host(code, { hostToken: created.hostToken, action: 'start' });
      let view = store.view(code);
      for (let i = 0; i < 200 && view.room.phase !== 'final'; i++) { now += 100000; view = store.view(code); }
      expect(view.room.phase).toBe('final');
      expect(view.game.home.score).toBe(57); expect(view.game.away.score).toBe(56);
      expect(view.game.context).toMatchObject({ possessionTeamId: null });
      const captain = view.standings[0].roster.find(p => p.captain)!;
      expect(captain.points).toBeCloseTo(view.players.find(p => p.id === captain.playerId)!.rawPoints * 1.5, 2);
      expect(captain).toMatchObject({ rawPoints: expect.any(Number), positionMultiplier: 1, captainMultiplier: 1.5 });
      expect(view.season.standings[0].nightsPlayed).toBe(1);
      const standings = view.season.standings;
      store = new RoomStore({ dataFile, now: () => now + 1000000 });
      expect(store.view(code).season.standings).toEqual(standings);
      expect(store.view(code).rules).toEqual(view.rules);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
