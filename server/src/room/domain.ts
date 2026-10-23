import type { RoomLineup, RoomPhase, RoomPickScore, RoomQuestion, RoomRules, RoomSeasonStanding, PickReceipt } from './types.js';
import type { PointsState } from './points/model.js';
import type { PlayerCall } from './calls/model.js';

/** Private durable state. Never serialize these objects into a public response. */
export type Stats = Record<string, Record<string, number>>;
export type Identity = { id: string; name: string; token: string };
export type Participant = Identity & { baseline: Stats; lineup?: RoomLineup; predictionPoints: number; streak: number; lastPickScore?: RoomPickScore };
export type QuestionState = { view: RoomQuestion; picks: Record<string, { optionId: string; elapsedFraction: number }> };
export type Room = {
  code: string; name: string; seasonId: string; hostToken: string; createdAt: number;
  gameId: string; rulesVersion: string; version: number;
  phase: RoomPhase; speed: number; rules: RoomRules; participants: Participant[];
  beatIndex: number; elapsedMs: number; durationMs: number; windowElapsedMs: number;
  lastTickAt: number; stats: Stats; question?: QuestionState; lastQuestion?: QuestionState; recorded: boolean;
  pickReceipts?: PickReceipt[];
  points?: PointsState;
  playerCalls?: PlayerCall[];
};
export type Season = { id: string; name: string; identities: Identity[]; standings: RoomSeasonStanding[] };
export type SavedRooms = { version: 2; rooms: Room[]; seasons: Season[] };
