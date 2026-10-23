import { PLAYERS, PLAYER_BY_ID, TEAMS, PREDICTION_LABELS, PREDICTION_POINTS } from '../replay/data.js';
import { buildTimeline, toSec, type Beat } from '../replay/timeline.js';
import { fantasyPoints } from '../replay/scoring.js';
import { DEFAULT_RULES, FOUR_WAY_PROBABILITIES } from '../scoring.js';
import { getOdds } from '../../game/odds.js';
import type { RoomSportAdapter } from './adapter.js';

const timeline = buildTimeline();
export const FOOTBALL_GAME_ID = 'morning-wood-vs-swiss-cheese';
export const FOOTBALL_RULES_VERSION = 'football-v1';

export const football: RoomSportAdapter<Beat> = {
  gameId: FOOTBALL_GAME_ID, sport: 'football', rulesVersion: FOOTBALL_RULES_VERSION,
  defaultRoomName: 'Football Watch Party', rules: DEFAULT_RULES,
  players: PLAYERS, playerById: PLAYER_BY_ID, beats: timeline.beats, minimumResponseMs: 5000,
  duration(beat, speed) {
    if (beat.type === 'drive_start') return Math.max(8000 / speed, 5000);
    const ms = beat.type === 'play' && beat.kind === 'td' ? 4500 : ({ play: 3000, pat: 2000, drive_end: 2500, halftime: 6000 }[beat.type] ?? 3000);
    return ms / speed;
  },
  isWindow: beat => beat.type === 'drive_start',
  locksQuestion: beat => beat.type === 'play',
  question(beat, now, durationMs) {
    if (beat.type !== 'drive_start') return;
    const kind = beat.drive % 2 === 0 ? 'drive_outcome' : beat.drive % 4 === 1 ? 'drive_score' : 'drive_td';
    const binary = kind !== 'drive_outcome';
    const odds = binary ? getOdds(100 - beat.ballOn, (beat.q % 2 === 1 ? 900 : 0) + toSec(beat.clock), kind === 'drive_td' ? 'td' : 'score') : undefined;
    const options = binary
      ? [{ id: 'yes', label: 'Yes', basePoints: 10, probability: odds!.p }, { id: 'no', label: 'No', basePoints: 10, probability: 1 - odds!.p }]
      : Object.keys(PREDICTION_POINTS).map(id => ({ id, label: PREDICTION_LABELS[id], basePoints: PREDICTION_POINTS[id], probability: FOUR_WAY_PROBABILITIES[id] }));
    return { id: `drive-${beat.drive + 1}`, kind, text: binary ? `Will ${TEAMS[beat.off].name} ${kind === 'drive_td' ? 'score a touchdown' : 'score'} on this drive?` : `How will ${TEAMS[beat.off].name}'s drive end?`, opensAt: now, locksAt: now + durationMs, remainingMs: durationMs, options, pickCounts: {}, status: 'open' };
  },
  result(question, beat) {
    if (beat.type !== 'drive_end') return;
    const optionId = question.kind === 'drive_outcome' ? beat.outcome! : question.kind === 'drive_td' ? (beat.outcome === 'TD' ? 'yes' : 'no') : ['TD', 'FG'].includes(beat.outcome!) ? 'yes' : 'no';
    return { optionId, explanation: beat.text };
  },
  rawPoints: fantasyPoints,
  autoLineup: style => style === 'stars' ? ['will-power', 'max-yardage', 'robin-banks', 'lance-downfield', 'major-package'] : style === 'value' ? ['hugh-jass', 'barb-dwyer', 'phil-mccracken', 'ben-dover', 'holden-penalty'] : ['max-yardage', 'robin-banks', 'hugh-jass', 'barb-dwyer', 'chip-shot'],
  projectGame(beatIndex, phase) {
    const beat = timeline.beats[beatIndex];
    const score = beat?.score ?? { VT: 0, SD: 0 };
    const team = (id: string) => ({ id, short: id, name: TEAMS[id].name, color: TEAMS[id].color, score: score[id] });
    const possession = phase === 'final' || phase === 'lobby' ? null : beat?.off ?? null;
    return { gameId: FOOTBALL_GAME_ID, sport: 'football', sourceMode: 'scripted', sourceStatus: 'healthy', context: { sport: 'football', possessionTeamId: possession, ballOn: beat?.ballOn ?? 25, down: possession ? beat?.down ?? null : null, toGo: possession ? beat?.togo ?? null : null }, title: "South Dakota Swiss Cheese at Vermont's Morning Wood", home: team('VT'), away: team('SD'), quarter: beat?.q ?? 1, clock: beat?.clock ?? '15:00', situation: beat?.situation ?? (phase === 'lobby' ? 'Waiting for kickoff' : `${beat?.down ?? 1} & ${beat?.togo ?? 10}`), ballOn: beat?.ballOn ?? 25, fieldX: beat?.fieldX ?? 25, possession, driveNumber: beat ? beat.drive + 1 : 0, driveCount: timeline.driveCount, recentPlays: timeline.beats.slice(Math.max(0, beatIndex - 11), beatIndex + 1).map(b => ({ id: `beat-${b.i}`, text: b.text, kind: b.kind, quarter: b.q, clock: b.clock })), isScripted: true };
  },
};
