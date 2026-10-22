import { describe, expect, it } from 'vitest';
import { finalFixture, liveFixture } from '../lib/fixtures';
import { playerInfo, worstPerformer } from './rosters';

describe('worstPerformer', () => {
  it('returns the lowest-points roster row of the live fixture', () => {
    const all = liveFixture.standings.flatMap((s) => s.roster.map((r) => ({ ...r, memberId: s.memberId })));
    const min = Math.min(...all.map((r) => r.points));
    const w = worstPerformer(liveFixture)!;
    expect(w.points).toBe(min);
    expect(all.some((r) => r.memberId === w.memberId && r.playerId === w.playerId && r.points === min)).toBe(true);
  });

  it('matches benchwarmerOfTheNight on the final fixture', () => {
    expect(worstPerformer(finalFixture)?.playerId).toBe(finalFixture.benchwarmerOfTheNight!.playerId);
  });

  it('is undefined with no rosters', () => {
    expect(worstPerformer({ ...liveFixture, standings: [] })).toBeUndefined();
    expect(
      worstPerformer({ ...liveFixture, standings: liveFixture.standings.map((s) => ({ ...s, roster: [] })) }),
    ).toBeUndefined();
  });

  it('breaks ties toward the later row', () => {
    const [a, b, ...rest] = liveFixture.standings;
    const tie = {
      ...liveFixture,
      standings: [
        { ...a!, roster: [{ ...a!.roster[0]!, points: -5 }] },
        { ...b!, roster: [{ ...b!.roster[0]!, points: -5 }] },
        ...rest,
      ],
    };
    expect(worstPerformer(tie)?.memberId).toBe(b!.memberId);
  });
});

describe('playerInfo', () => {
  it('finds the draft board entry', () => {
    const id = liveFixture.standings[0]!.roster[0]!.playerId;
    expect(playerInfo(liveFixture, id)?.player.id).toBe(id);
    expect(playerInfo(liveFixture, 'nope')).toBeUndefined();
  });
});
