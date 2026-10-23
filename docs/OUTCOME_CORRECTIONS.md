# Final basketball outcome reconciliation

This backend service reconciles **recorded final basketball rooms** from a complete normalized authoritative event log. It is opt-in for newly created rooms; saved rooms without full history and contribution evidence cannot be upgraded by guessing their past. Scripted fixture corrections retain scripted source labels. This work does not enable continuous live basketball ingestion or establish real provider access.

## Transaction integration

`server/src/room/corrections/service.ts` exports:

- `initializeCorrections(room)` initializes private correction history in a new lobby. The caller enables it only for basketball rooms.
- `recordResolvedQuestion(room, question)` captures each resolved or void prompted question in original resolution order, including questions with no answers. It retains accepted options, original probabilities, elapsed fractions, crowd choices and eligible identities.
- `captureSeasonContribution(room, adapter)` records exactly what the initial `recordSeason` will add, including fantasy, free predictions, settled risk and tied winners. Call it after pregame resolution and immediately before recording the final season night.
- `reconcileFinal(room, season, events, resultVersion, adapter, now?)` returns `{room, season, changed, projection}` as detached values. The caller must publish both updated values in the existing atomic transaction. Errors leave the input objects untouched.
- `validateCorrectionState(room, adapter)` validates private cross-record correction evidence before save and on reload.

Every participant in an opted-in room needs a durable `joinedSequence`: zero in the lobby, otherwise the last observed replay sequence at joining. Corrections rebuild the participant's baseline from corrected events at or before that boundary, preventing pre-join stats from becoming new fantasy points.

The input is the provider journal's **current complete normalized event list**, rather than revision envelopes or only the changed events. Event IDs must be unique, sequences/times must be ordered, identities and scorer deltas must pass the existing basketball validator, and the last event must be final. The existing reducer runs from an empty state; corrections are never added to already-applied scores. Provider game registration and full-log reconciliation remain trusted internal operations, with no public mutation route supplied by this module.

## Result identity and projections

`resultVersion` is a lowercase SHA-256 identifier. Each applied version stores an independent canonical event payload hash. Repeating a version with its identical payload is a no-op, including after persistence/restart. Reusing a version with different data fails. The service retains at most 1,000 applied versions and accepts at most 100,000 events per complete log; reaching a bound fails closed.

Private `correctionState` stores the terminal question history, current season contribution, result-version fingerprints, current corrected event list and corrected team scores. Public snapshots may project these corrected scores while retaining the truthful source mode. The projection does not alter the original authored replay script or claim the fixture is live.

The complete original set of adapter question windows is required, including zero-pick windows that can reset streaks. Original prediction totals/streaks must be explainable by the stored accepted-pick history before any correction is applied. Older rooms missing this evidence are rejected.

## Scoring and ledger behavior

Free predictions are recomputed in their original question order using `scorePrediction`. Original accepted fractions, pick crowd, option probabilities, eligibility and frozen room rules are reused. Corrected earlier results update all later streak-dependent scores. A void target preserves the streak, matching the original resolver. Missing answers reset the streak only for eligible participants on resolved targets.

Original `free_pick_reward` entries stay immutable. `free_pick_correction` entries append the signed difference for a participant/question/result version. Net free rewards must match corrected prediction totals. These entries carry both `questionId` and `resultVersion`; persistence rejects postings without a recorded target and applied version. Corrected pregame winners use the authoritative corrected sports score, award the same flat ten points, and support wrong-to-win, win-to-wrong and tied-final void transitions.

Point commitments reuse `settleTarget` with a new monotonic outcome revision. Frozen commitments, quote probabilities, multipliers and total return terms do not change. Previously paid returns are reversed through compensating entries; corrected returns/refunds are posted separately. Correction debt remains visible through the existing bank accounting when already-spent rewards or returns are reversed.

The stored prior contribution is subtracted from season totals, then the corrected contribution is added. Unrelated rooms remain in place. Each participant still has one played night for this room; `nightsWon` is replaced for every tied winner. Contribution consistency, corrected event fingerprint, rebuilt stats/baselines and corrected target outcomes are checked on reload.

## Verification

Tests in `server/test/room/corrections.test.ts` cover complete rebuilds, signed free-reward adjustments, immutable commitment reversal, original timing/crowd/streak reuse, pregame winner/void transitions, late-join baselines, tied season replacement, duplicate events, legacy/incomplete history rejection, result-version replay/conflicts and persistence integrity. New modules first failed as missing; missing-window, void-without-pick, balanced-but-unsupported totals, altered-history outcome and unregistered-posting tests each failed on their intended assertion before the corresponding fix.

```powershell
cd C:/Users/jiang/Benchwarmers-basketball-backend/server
npx vitest run test/room/corrections.test.ts test/room/pregame.test.ts --maxWorkers=1
npx tsc --noEmit
```

The root task's store/SQLite tests record atomic integration, restart behavior and final public projection evidence. Ongoing live lifecycle reconciliation, real licensed feed verification and real market coverage require their separate external acceptance gates.
