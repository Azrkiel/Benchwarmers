/**
 * PROPOSED client contract for committed points, player calls and pregame picks
 * (master plan §3.4-3.5, Phases 10, 11, 13). Worker A owns the real types; these mirror
 * the plan so the UI can be built and reviewed first. Every field is additive and the
 * screens stay hidden until a room snapshot carries them. Requested from A in
 * docs/qa/worker-b/CONTRACT_REQUESTS.md. Values are game points (half-point precision).
 */
export type CommitAmount = 10 | 25 | 50;
export const COMMIT_AMOUNTS: CommitAmount[] = [10, 25, 50];

/** A reviewable offer. Creating it changes no balance. */
export type CommitQuote = {
  quoteId: string;
  targetId: string;
  questionId: string;
  optionId: string;
  optionLabel: string;
  commitPoints: number;
  /** Includes the committed amount: a win credits exactly this. */
  totalReturnPoints: number;
  /** Capped total-return multiplier, already rounded down as the server quotes it. */
  multiplier: number;
  /** Plain label of the declared probability source, e.g. "Demo reference, 38%". */
  probabilityLabel: string;
  firstCaller: boolean;
  expiresAt: number;
};

export type CommitmentState = 'pending' | 'won' | 'lost' | 'void';
/** Accepted, immutable commitment. */
export type CommitmentReceipt = {
  callId: string;
  requestId: string;
  quoteId: string;
  questionId: string;
  optionId: string;
  optionLabel: string;
  commitPoints: number;
  totalReturnPoints: number;
  acceptedAt: number;
  acceptedSequence: number;
  state: CommitmentState;
};

/** Per-participant bank and standings split (§3.5). The 100-point grant never counts toward standings. */
export type BankSummary = {
  grantPoints: number;
  availablePoints: number;
  reservedPoints: number;
  settledRiskNet: number;
  correctionDebt: number;
};

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
