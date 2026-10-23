import type { RoomGameMetadata, RoomPhase, RoomQuestion, RoomRules, RoomView, QuestionResolution } from '../types.js';

export type RoomCatalogPlayer = { id: string; name: string; team: string; pos: string; role: string; salary: number; projectedPoints?: number; projectionSource?: 'demo_projection'; salaryModelVersion?: string };
export type RoomReplayBeat = { type: string; deltas: [string, string, number][] };

/** Pure sport behavior only: no credentials, disk, HTTP, or rendering. */
export interface RoomSportAdapter<Beat extends RoomReplayBeat = RoomReplayBeat> {
  readonly gameId: string;
  readonly sport: RoomGameMetadata['sport'];
  readonly rulesVersion: string;
  readonly defaultRoomName: string;
  readonly rules: RoomRules;
  readonly players: readonly RoomCatalogPlayer[];
  readonly playerById: Readonly<Record<string, RoomCatalogPlayer>>;
  readonly beats: readonly Beat[];
  readonly minimumResponseMs: number;
  duration(beat: Beat, speed: number): number;
  isWindow(beat: Beat): boolean;
  locksQuestion(beat: Beat): boolean;
  question(beat: Beat, now: number, durationMs: number): RoomQuestion | undefined;
  result(question: RoomQuestion, beat: Beat): QuestionResolution | undefined;
  rawPoints(stats: Record<string, number>, role: string): number;
  autoLineup(style: 'balanced' | 'stars' | 'value'): readonly string[];
  projectGame(beatIndex: number, phase: RoomPhase): RoomView['game'] & RoomGameMetadata;
}
