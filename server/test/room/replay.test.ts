import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../src/room/replay/timeline.js';
import { PLAYERS } from '../../src/room/replay/data.js';
describe('Watch Party Fantasy replay', () => {
  it('preserves the complete realistic script and all specialist credits', () => {
    const { beats, warnings } = buildTimeline();
    expect(warnings).toEqual([]);
    expect(PLAYERS).toHaveLength(25);
    expect(beats.at(-1)?.score).toEqual({VT:27, SD:24});
    const stats: Record<string,Record<string,number>> = {};
    for (const beat of beats) for (const [id, key, n] of beat.deltas) {
      stats[id] ??= {}; stats[id][key] = (stats[id][key] ?? 0) + n;
    }
    expect(Object.keys(stats)).toHaveLength(25);
    expect(stats['hugh-jass'].teamRushYds).toBe(86);
    expect(stats['phil-mccracken']).toEqual({puntYds:148,puntIn20:3});
    expect(stats['ben-dover'].cleanSnaps).toBe(8);
  });
});
