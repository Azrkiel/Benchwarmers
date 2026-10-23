import { describe, expect, it } from 'vitest';
import source from '../../src/game/games/harbor-vs-summit.json' with { type: 'json' };
import demo from '../../src/room/basketball/demo.json' with { type: 'json' };
import { validateBasketballTimeline } from '../../src/room/basketball/validate.js';
import { initialBasketballState, reduceBasketballEvent } from '../../src/room/basketball/reducer.js';

describe('authored basketball room replay', () => {
  it('preserves source athletes, scoring and assists and reaches the declared final', () => {
    const timeline = validateBasketballTimeline(demo);
    expect(timeline.catalog.gameId).toBe(source.id);
    expect(Object.keys(timeline.catalog.playerTeams).sort()).toEqual([...source.home.roster, ...source.away.roster].map(p => p.id).sort());
    let state = initialBasketballState(timeline.catalog);
    for (const beat of timeline.beats) if (beat.event) state = reduceBasketballEvent(state, beat.event, timeline.catalog).state;
    expect(state.score).toEqual({ harbor: 57, summit: 56 });
    expect(state.final).toBe(true);
    expect(state.possessionTeamId).toBeNull();
    const totals = Object.values(state.stats).reduce((sum, stats) => {
      for (const [key, n] of Object.entries(stats)) sum[key] = (sum[key] ?? 0) + n;
      return sum;
    }, {} as Record<string, number>);
    expect(totals).toMatchObject({ pts2: 30, pts3: 17, ft: 2, ast: 41, reb: 3, stl: 2, blk: 1, tov: 2 });
    const events = timeline.beats.flatMap(b => b.event ? [b.event] : []);
    expect(events.filter(e => e.kind === 'shot_attempt').map(e => e.shotType)).toEqual(expect.arrayContaining(['jump_shot', 'three_pointer']));
    expect(events.some(e => e.kind === 'possession' && e.playerId === undefined)).toBe(true);
    expect(timeline.beats.filter(b => b.question).length).toBeGreaterThanOrEqual(3);
    expect(timeline.beats.reduce((ms, beat) => ms + beat.presentationMs, 0)).toBeLessThan(240000);
    expect(timeline.beats.find(b => b.event?.gameElapsedMs === 451 * 6000)?.text).not.toContain('tie');
    expect(timeline.beats.find(b => b.event?.gameElapsedMs === 466 * 6000)?.text).not.toContain('ties');
  });

  it.each(['duplicate', 'order', 'player', 'duration', 'score', 'anchor', 'horizon', 'subtype', 'final', 'unresolved', 'overlap'])('rejects an invalid %s timeline', problem => {
    const bad: any = structuredClone(demo);
    const score = bad.beats.find((b: any) => b.event?.kind === 'score');
    const questions = bad.beats.filter((b: any) => b.question);
    const question = questions[0];
    if (problem === 'duplicate') bad.beats[1].id = bad.beats[0].id;
    if (problem === 'order') bad.beats[1].sequence = bad.beats[0].sequence;
    if (problem === 'player') score.event.playerId = 'unknown';
    if (problem === 'duration') score.presentationMs = -1;
    if (problem === 'score') score.event.scoreValue = 4;
    if (problem === 'anchor') question.question.anchorSequence = score.sequence;
    if (problem === 'horizon') question.question.horizonGameElapsedMs = question.gameElapsedMs - 1;
    if (problem === 'subtype') question.question.templateId = 'next_layup';
    if (problem === 'final') bad.finalScore.harbor++;
    if (problem === 'unresolved') { question.question.horizonGameElapsedMs = question.gameElapsedMs; question.question.allowVoid = false; }
    if (problem === 'overlap') question.question.horizonGameElapsedMs = bad.beats.at(-1).gameElapsedMs;
    expect(() => validateBasketballTimeline(bad)).toThrow();
  });

  it('allows an explicitly declared no-event void, without fabricating a result', () => {
    const changed: any = structuredClone(demo);
    const question = changed.beats.find((b: any) => b.question);
    question.question.horizonGameElapsedMs = question.gameElapsedMs;
    question.question.allowVoid = true;
    const timeline = validateBasketballTimeline(changed);
    expect(timeline.outcomes[question.question.id]).toEqual({ state: 'void' });
  });
});
