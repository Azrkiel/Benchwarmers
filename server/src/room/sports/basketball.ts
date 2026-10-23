import source from '../../game/games/harbor-vs-summit.json' with { type: 'json' };
import demo from '../basketball/demo.json' with { type: 'json' };
import { validateBasketballTimeline } from '../basketball/validate.js';
import { initialBasketballState, reduceBasketballEvent } from '../basketball/reducer.js';
import { basketballAutoLineup, basketballPlayers, basketballRawPoints, basketballRules, BASKETBALL_RULES_VERSION } from '../basketball/catalog.js';
import type { RoomSportAdapter } from './adapter.js';
import { resolveBasketballTarget } from '../predictions/resolve.js';

export const BASKETBALL_GAME_ID = 'harbor-vs-summit';
const timeline = validateBasketballTimeline(demo);
let state = initialBasketballState(timeline.catalog);
const beats = timeline.beats.map(beat => {
  if (beat.event) state = reduceBasketballEvent(state, beat.event, timeline.catalog).state;
  return { ...beat, type: beat.event?.kind === 'final' ? 'final' : beat.question ? 'opportunity' : 'event', state,
    deltas: Object.entries(beat.event?.statDeltas ?? {}).map(([key, value]) => [beat.event!.playerId!, key, value!] as [string, string, number]) };
});
type Beat = typeof beats[number];
function clockAt(gameElapsedMs: number) {
  const totalSeconds = gameElapsedMs / 1000;
  const quarter = Math.min(4, Math.floor(totalSeconds / 720) + 1);
  const remaining = totalSeconds >= 2880 ? 0 : 720 - totalSeconds % 720;
  return { quarter, clock: `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}` };
}
export const basketball: RoomSportAdapter<Beat> = {
  gameId: BASKETBALL_GAME_ID, fictional: true, sport: 'basketball', rulesVersion: BASKETBALL_RULES_VERSION,
  defaultRoomName: 'Basketball Watch Party', rules: basketballRules,
  players: basketballPlayers, playerById: Object.fromEntries(basketballPlayers.map(p => [p.id, p])), beats,
  minimumResponseMs: 8000,
  duration: (beat, speed) => beat.question ? Math.max(8000, beat.presentationMs / speed) : beat.presentationMs / speed,
  isWindow: beat => Boolean(beat.question),
  locksQuestion: beat => !beat.question,
  question(beat, now, durationMs) {
    const target = beat.question; if (!target) return;
    const options = target.templateId === 'next_score_team'
      ? [source.home, source.away].map(team => ({ id: team.id, label: team.name, basePoints: 10 }))
      : target.templateId === 'next_made_field_goal_value'
        ? [{ id: 'two', label: 'Two', basePoints: 10 }, { id: 'three', label: 'Three', basePoints: 10 }]
        : [{ id: 'yes', label: 'Yes', basePoints: 10 }, { id: 'no', label: 'No', basePoints: 10 }];
    const text = target.templateId === 'next_score_team' ? 'Which team scores next?'
      : target.templateId === 'next_made_field_goal_value' ? 'Next made basket: two or three?'
      : `Will ${target.teamId === source.home.id ? source.home.name : source.away.name} score in this window?`;
    return { id: target.id, kind: target.templateId, text, opensAt: now, locksAt: now + durationMs,
      remainingMs: durationMs, options, pickCounts: {}, status: 'open', target: { templateId: target.templateId,
        anchorSequence: target.anchorSequence, horizonGameElapsedMs: target.horizonGameElapsedMs,
        ...(target.teamId ? { teamId: target.teamId } : {}), eligibleParticipantIds: [] } };
  },
  result(question, beat) {
    if (question.status === 'resolved' || question.status === 'void' || !question.target || !beat.event) return;
    const result = resolveBasketballTarget(question.target, beat.event);
    return result && ('voidReason' in result ? result : { ...result, explanation: beat.text });
  },
  rawPoints: basketballRawPoints, autoLineup: basketballAutoLineup,
  projectGame(beatIndex, phase) {
    const beat = beats[beatIndex];
    const current = beat?.state ?? initialBasketballState(timeline.catalog);
    const clock = clockAt(beat?.gameElapsedMs ?? 0);
    const possession = phase === 'lobby' || phase === 'final' ? null : current.possessionTeamId;
    const team = (value: typeof source.home) => ({ id: value.id, short: value.short, name: value.name, color: value.color, score: current.score[value.id] });
    return { gameId: BASKETBALL_GAME_ID, sport: 'basketball', sourceMode: 'scripted', sourceStatus: 'healthy',
      context: { sport: 'basketball', possessionTeamId: possession, possessionPlayerId: possession ? current.possessionPlayerId : null, ball: null, tracking: 'team_possession' },
      title: source.title, home: team(source.home), away: team(source.away), ...clock,
      situation: phase === 'lobby' ? 'Waiting for tip-off' : phase === 'final' ? 'Final' : beat?.text ?? '',
      ballOn: 0, fieldX: 0, possession, driveNumber: 0, driveCount: 0,
      recentPlays: beats.slice(0, beatIndex + 1).filter(b => b.event).slice(-12).map(b => ({ id: b.id, text: b.text, kind: b.event!.kind, ...clockAt(b.gameElapsedMs),
        ...(b.event!.kind === 'score' && b.event!.teamId && b.event!.scoreValue ? { teamId: b.event!.teamId, points: b.event!.scoreValue } : {}) })), isScripted: true };
  },
};
