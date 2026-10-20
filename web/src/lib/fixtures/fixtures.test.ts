import { describe, it, expect } from 'vitest';
import { FIXTURES, FIXTURE_ORDER, isFixtureName, seasonFixture } from './index';

describe.each(FIXTURE_ORDER)('%s fixture', (name) => {
  const f = FIXTURES[name];

  it('has 16 unique players, 8 per side', () => {
    expect(f.draftBoard).toHaveLength(16);
    expect(new Set(f.draftBoard.map((e) => e.player.id)).size).toBe(16);
    expect(f.draftBoard.filter((e) => e.side === 'home')).toHaveLength(8);
    expect(f.draftBoard.filter((e) => e.side === 'away')).toHaveLength(8);
  });

  it('has 4 standings ranked 1..4 sorted by total', () => {
    expect(f.standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < f.standings.length; i++) {
      expect(f.standings[i - 1].total).toBeGreaterThanOrEqual(f.standings[i].total);
    }
  });

  it('total equals draftPoints + pickPoints, and draftPoints sums the roster', () => {
    for (const s of f.standings) {
      expect(s.total).toBeCloseTo(s.draftPoints + s.pickPoints, 5);
      expect(s.draftPoints).toBeCloseTo(s.roster.reduce((sum, r) => sum + r.points, 0), 5);
    }
  });

  it("each standing's roster is owned by that member on the draft board", () => {
    for (const s of f.standings) {
      for (const r of s.roster) {
        const entry = f.draftBoard.find((e) => e.player.id === r.playerId);
        expect(entry?.ownerMemberId).toBe(s.memberId);
        expect(entry?.points).toBeCloseTo(r.points, 5);
      }
    }
  });

  it('owned entries carry owner, household and round', () => {
    for (const e of f.draftBoard.filter((x) => x.ownerMemberId)) {
      expect(e.ownerName).toBeTruthy();
      expect(e.householdId).toBeTruthy();
      expect(e.round).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('drafting fixture', () => {
  const f = FIXTURES.drafting;
  it('has 7 owned players and nothing scored', () => {
    expect(f.draftBoard.filter((e) => e.ownerMemberId)).toHaveLength(7);
    expect(f.party.status).toBe('drafting');
    expect(f.game.gameT).toBe(0);
    expect(f.recentEvents).toEqual([]);
    expect(f.activeProp).toBeUndefined();
    expect(f.draftBoard.every((e) => e.points === 0)).toBe(true);
  });
});

describe('live fixture', () => {
  const f = FIXTURES.live;
  it('has 12 owned players', () => {
    expect(f.draftBoard.filter((e) => e.ownerMemberId)).toHaveLength(12);
    expect(f.party.status).toBe('live');
    expect(f.party.startedAt).toBeDefined();
  });
  it('has an open active prop with a countdown', () => {
    expect(f.activeProp?.status).toBe('open');
    expect(f.activeProp?.realSecondsToLock).toBeGreaterThan(0);
  });
  it('has unique recent event ids, newest first, with fantasy pops', () => {
    const ids = f.recentEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < f.recentEvents.length; i++) {
      expect(f.recentEvents[i - 1].t).toBeGreaterThan(f.recentEvents[i].t);
    }
    expect(f.recentEvents.some((e) => e.fantasy.length > 0)).toBe(true);
    expect(f.recentEvents.some((e) => e.fantasy.length === 0)).toBe(true);
  });
  it('has a clock consistent with gameT', () => {
    expect(f.game.period).toBe(3);
    expect(f.game.clock).toBe('Q3 0:48');
  });
});

describe('final fixture', () => {
  const f = FIXTURES.final;
  it('has 12 owned players, a recap and no active prop', () => {
    expect(f.draftBoard.filter((e) => e.ownerMemberId)).toHaveLength(12);
    expect(f.party.status).toBe('final');
    expect(f.recap).toBeTruthy();
    expect(f.activeProp).toBeUndefined();
    expect(f.lastResolvedProp).toBeDefined();
  });
  it('benchwarmer is the lowest-scoring owned player', () => {
    const b = f.benchwarmerOfTheNight;
    expect(b).toBeDefined();
    const ownedEntries = f.draftBoard.filter((e) => e.ownerMemberId);
    const entry = ownedEntries.find((e) => e.player.id === b!.playerId);
    expect(entry).toBeDefined();
    expect(entry!.ownerName).toBe(b!.ownerName);
    expect(entry!.points).toBeCloseTo(b!.points, 5);
    expect(b!.points).toBe(Math.min(...ownedEntries.map((e) => e.points)));
  });
});

describe('season fixture', () => {
  it('ranks 4 members 1..4 by points', () => {
    expect(seasonFixture.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < seasonFixture.rows.length; i++) {
      expect(seasonFixture.rows[i - 1].points).toBeGreaterThanOrEqual(seasonFixture.rows[i].points);
    }
    const won = seasonFixture.rows.reduce((n, r) => n + r.nightsWon, 0);
    expect(won).toBe(seasonFixture.rows[0].partiesPlayed);
  });
});

describe('isFixtureName', () => {
  it('guards names', () => {
    expect(isFixtureName('live')).toBe(true);
    expect(isFixtureName('nope')).toBe(false);
    expect(isFixtureName(3)).toBe(false);
  });
});
