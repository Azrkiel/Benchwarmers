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

/* Phase 11: Worker A's catalog (server/src/shared/calls.ts, fc66bf6) drives the composer. */
import type { CallCatalog, RoomPlayerCall } from '@shared/room';
export type { CallCatalog, RoomPlayerCall };

/** Composer view of one supported template, with labels the catalog leaves to the client. */
export type CallTemplate = {
  id: CallCatalog['templates'][number]['templateId'];
  label: string;
  options: { id: string; label: string }[];
  /** Game-time deadlines inside the server's safe window; id is the absolute game-elapsed ms. */
  horizons: { id: string; label: string }[];
  available: boolean;
  unavailableReason?: string;
};

const QUARTER_MS = 12 * 60_000;
/** Absolute game time to a quarter clock, e.g. 1_500_000 ms -> "Q3 11:00". */
export function gameClockLabel(elapsedMs: number): string {
  const quarter = Math.min(4, Math.floor(elapsedMs / QUARTER_MS) + 1);
  const left = Math.max(0, quarter * QUARTER_MS - elapsedMs);
  const min = Math.floor(left / 60_000), sec = Math.floor((left % 60_000) / 1000);
  return `Q${quarter} ${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * Labels the catalog for the composer: team names, Two/Three, and up to three deadlines in
 * the safe window. The featured call's own deadline (when inside the window) comes first:
 * the server can price that alias with the featured call's reference.
 */
export function catalogTemplates(catalog: CallCatalog, teams: { id: string; name: string }[], featuredHorizonMs?: number): CallTemplate[] {
  const window = catalog.window;
  const inWindow = (ms: number) => !!window && ms >= window.minimumHorizonGameElapsedMs && ms <= window.maximumHorizonGameElapsedMs;
  const featured = featuredHorizonMs !== undefined && inWindow(featuredHorizonMs) ? [featuredHorizonMs] : [];
  const horizons = window ? [...new Set([...featured, window.minimumHorizonGameElapsedMs, Math.round((window.minimumHorizonGameElapsedMs + window.maximumHorizonGameElapsedMs) / 2000) * 1000, window.maximumHorizonGameElapsedMs])]
    .filter(inWindow).slice(0, 3)
    .map((ms) => ({ id: String(ms), label: `By ${gameClockLabel(ms)} game clock${featured[0] === ms ? ' (same as the featured call)' : ''}` })) : [];
  const reason = !catalog.enabled ? 'Calls are off in this room' : !window ? 'No call window right now' : undefined;
  return catalog.templates.map((t) => ({
    id: t.templateId,
    label: t.templateId === 'next_score_team' ? 'Which team scores next' : 'Next made basket: two or three',
    options: t.optionIds.map((id) => ({ id, label: t.options === 'teams' ? teams.find((team) => team.id === id)?.name ?? id : id === 'three' ? 'Three' : 'Two' })),
    horizons,
    available: !reason,
    unavailableReason: reason,
  }));
}

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
export type PointsSnapshotFields = { calls?: RoomPlayerCall[]; pregame?: PregamePickState };
/** Private fields proposed under `me`. */
export type PointsMeFields = { bank?: BankSummary; commitments?: CommitmentReceipt[] };
