import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RoomStore } from '../../src/room/store.js';
import { basketballPlayers, salaryFor, basketballAutoLineup, basketballRawPoints } from '../../src/room/basketball/catalog.js';
import { basketballCalibrationReport } from '../../src/room/basketball/calibration.js';

describe('pregame basketball catalog and lineups', () => {
  it('uses declared demo projections, neutral position weights, and integer salaries', () => {
    expect(salaryFor(0)).toBe(3500);
    expect(salaryFor(100)).toBe(11500);
    expect(salaryFor(25)).toBe(9000);
    for (const invalid of [-1, NaN, Infinity]) expect(() => salaryFor(invalid)).toThrow('INVALID_PROJECTION');
    expect(basketballPlayers).toHaveLength(16);
    for (const player of basketballPlayers) {
      expect(player.salary).toBe(salaryFor(player.projectedPoints));
      expect(player.projectionSource).toBe('demo_projection');
      expect(player.salary % 500).toBe(0);
    }
    const view = new RoomStore({ persist: false }).create({ gameId: 'harbor-vs-summit' }).view;
    expect(view.rules.positionMultipliers).toEqual({ PG: 1, SG: 1, SF: 1, PF: 1, C: 1 });
    expect(view.players[0]).toHaveProperty('projectedPoints');
  });

  it.each(['balanced', 'stars', 'value'] as const)('finds a deterministic legal %s lineup without future outcomes', style => {
    const ids = basketballAutoLineup(style);
    expect(ids).toEqual(basketballAutoLineup(style));
    const store = new RoomStore({ persist: false });
    const { view } = store.create({ gameId: 'harbor-vs-summit' });
    const { participantToken } = store.join(view.room.code, { name: 'Fan' });
    const lineup = store.autoLineup(view.room.code, { participantToken, style }).me!.lineup!;
    expect([lineup.captainId, ...lineup.flexIds]).toEqual(ids);
    expect(new Set(ids).size).toBe(5);
    expect(lineup.salaryUsed).toBeLessThanOrEqual(50000);
  });

  it('rejects duplicates, unknown players, over-cap and post-start edits without changing the lineup', () => {
    const store = new RoomStore({ persist: false, now: () => 1000 });
    const created = store.create({ gameId: 'harbor-vs-summit' });
    const code = created.view.room.code;
    const { participantToken } = store.join(code, { name: 'Fan' });
    const view = store.autoLineup(code, { participantToken });
    const lineup = view.me!.lineup!;
    const save = (captainId: string, flexIds: string[]) => store.setLineup(code, { participantToken, captainId, flexIds });
    expect(() => save(lineup.captainId, [lineup.captainId, ...lineup.flexIds.slice(0, 3)])).toThrow(expect.objectContaining({ code: 'DUPLICATE_PLAYER' }));
    expect(() => save('will-power', lineup.flexIds)).toThrow(expect.objectContaining({ code: 'BAD_PLAYER' }));
    const expensive = [...basketballPlayers].sort((a,b) => b.salary - a.salary).slice(0,5);
    expect(() => save(expensive[0].id, expensive.slice(1).map(p => p.id))).toThrow(expect.objectContaining({ code: 'OVER_CAP' }));
    expect(store.view(code, participantToken).me!.lineup).toEqual(lineup);
    store.host(code, { hostToken: created.hostToken, action: 'start' });
    expect(() => save(lineup.captainId, lineup.flexIds)).toThrow(expect.objectContaining({ code: 'LINEUPS_LOCKED' }));
  });

  it('scores basketball stat counts using the shared raw weights', () => {
    expect(basketballRawPoints({ pts3: 1, reb: 2, ast: 1, stl: 1, tov: 1 })).toBeCloseTo(8.9);
    expect(basketballRawPoints({ pts3: 1, reb: 2, ast: 1, stl: 1, tov: 1 }) * 1.5).toBeCloseTo(13.35);
  });

  it('reports pregame position production without claiming calibrated balance', () => {
    const report = basketballCalibrationReport();
    expect(report.provenance).toBe('demo_projection');
    expect(report.calibrated).toBe(false);
    expect(report.positions).toHaveLength(5);
    expect(report.positions.every(row => row.weight === 1 && row.players > 0 && row.expectedWeighted === row.expectedRaw)).toBe(true);
    expect(report.lineups.every(row => row.salaryUsed <= 50000)).toBe(true);
  });

  it('accepts exact cap and rejects one dollar over a saved cap', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basketball-cap-'));
    try {
      const dataFile = path.join(dir, 'rooms.json');
      let store = new RoomStore({ dataFile, now: () => 1000 });
      const created = store.create({ gameId: 'harbor-vs-summit' });
      const code = created.view.room.code;
      const { participantToken } = store.join(code, { name: 'Fan' });
      const input = { participantToken, captainId: 'har-pg-1', flexIds: ['har-sg-7', 'har-sf-11', 'har-pf-21', 'har-c-44'] };
      expect(store.setLineup(code, input).me!.lineup!.salaryUsed).toBe(50000);
      const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      saved.rooms[0].rules.salaryCap = 49999;
      delete saved.rooms[0].participants[0].lineup;
      fs.writeFileSync(dataFile, JSON.stringify(saved));
      store = new RoomStore({ dataFile, now: () => 1000 });
      expect(() => store.setLineup(code, input)).toThrow(expect.objectContaining({ code: 'OVER_CAP', message: expect.stringContaining('$50,000') }));
      expect(store.view(code, participantToken).me!.lineup).toBeUndefined();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
