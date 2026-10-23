/**
 * Client contract for committed points (Worker A's exports, below) plus PROPOSED types
 * for player calls and pregame picks (master plan Phases 11, 13) that A has not shipped. Every field is additive and the
 * screens stay hidden until a room snapshot carries them. Requested from A in
 * docs/qa/worker-b/CONTRACT_REQUESTS.md. Values are game points (half-point precision).
 */
export type CommitAmount = 10 | 25 | 50;
export const COMMIT_AMOUNTS: CommitAmount[] = [10, 25, 50];

/* Phase 10 types come from Worker A's exported contract (server/src/shared/points.ts, 77d16d0). */
import type { CallBank, CommitmentQuote, CommitmentReceipt as ServerCommitmentReceipt } from '@shared/room';
export type BankSummary = CallBank;
export type CommitmentReceipt = ServerCommitmentReceipt;
export type CommitmentState = CommitmentReceipt['state'];
/** A reviewable offer; A's provenance fields are optional so older fixtures still render. */
export type CommitQuote = Omit<CommitmentQuote, 'targetVersion' | 'maximumLossPoints' | 'probabilityVersion' | 'probabilitySource'>
  & Partial<Pick<CommitmentQuote, 'targetVersion' | 'maximumLossPoints' | 'probabilityVersion' | 'probabilitySource'>>;

/** Supported player-call templates (Phase 11 catalog), as served by A's catalog read. */
export type CallTemplate = {
  id: 'next_score_team' | 'next_made_field_goal_value' | 'team_next_possession_three';
  label: string;
  options: { id: string; label: string }[];
  horizons: { id: string; label: string }[];
  available: boolean;
  unavailableReason?: string;
};
export type VoluntaryCall = { id: string; templateId: CallTemplate['id']; creatorName: string; optionLabel: string; horizonLabel: string; followers: number; createdAt: number; state: CommitmentState };

/** Pregame winner pick (Phase 13). `reference` is absent for fictional games or when no matching market exists. */
export type PregameReference = { source: string; sourceUrl?: string; observedAt: number; home: number; away: number; method: string; stale: boolean };
export type PregamePickState = {
  questionId: string;
  closesAt: number;
  status: 'open' | 'locked' | 'resolved' | 'void';
  resolutionRule: string;
  reference?: PregameReference;
  crowd: { home: number; away: number };
  myPick?: 'home' | 'away';
  result?: 'home' | 'away';
};

/** Public fields a points-enabled snapshot is proposed to add (pregame.myPick only for an authenticated reader). */
export type PointsSnapshotFields = { calls?: VoluntaryCall[]; pregame?: PregamePickState };
/** Private fields proposed under `me`. */
export type PointsMeFields = { bank?: BankSummary; commitments?: CommitmentReceipt[] };
