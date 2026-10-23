# Basketball backend checkpoint

> Follow-up: [playback route integration and connected checks](PLAYBACK_INTEGRATION.md) records the merged product delivery, host-checked playback API, 32-participant checks, and a product-owned takeover race found during browser verification.

October 23, 2026. Branch: `feature/basketball-backend`. Continues `d6a1098` and the original `BACKEND_CONTRACT.md` delivery. Implementation remains in `C:/Users/jiang/Benchwarmers-basketball-backend` on the approved provisional upstream base. The original dirty checkout is preserved.

This delivery supplies the scripted backend for the demo integration gate. It does not complete the 61-task backend assignment or claim connected UI, voice, hardware, live-provider, or deployment acceptance. Worker C retains master-plan/integration acceptance ownership. B-owned implementation, web/extension code, dependency manifests and C-owned QA tooling were not edited.

## Implemented behavior

- Explicit `gameId: "harbor-vs-summit"` creates basketball; omission still creates football. Unknown games still return `400 GAME_NOT_SUPPORTED` without creating a room.
- Sixteen existing athletes, authored `demo_projection` inputs, `demo-projection-350-v1` salaries, five distinct athletes under $50,000, one 1.5x captain, four flex athletes, and neutral position weights. `balanced`, `stars` and `value` use deterministic catalog search without future replay outcomes.
- Shared raw basketball scoring weights are reused. Roster contributions expose `rawPoints`, `positionMultiplier`, `captainMultiplier` and final `points`. Player catalog entries add `projectedPoints`, `projectionSource` and `salaryModelVersion`. All new fields are additive.
- A validated 117-beat authored timeline preserves the 57–56 final and all original scoring/assist credits. Base presentation duration is 145 seconds. It adds explicit team possessions, a missed two, a missed three, a rebound and a block. Four opportunities cover the three declared prediction templates.
- Every new question receives at least eight active real seconds at all replay speeds. Pause freezes the budget. Timer stalls stop at new questions. Live and paused restart retain replay position, picks and active time; downtime is excluded.
- The normalized pure reducer validates event fields and references, changes score only from scores, applies declared stat credits separately, emits stable event moments, and ignores repeated/older event revisions. A newer revision is rejected explicitly until correction reconciliation exists. It does not silently add a corrected basket.
- Possession comes from explicit script events. Player possession and ball observations remain null. `sourceMode` is `scripted`; tracking capability is `team_possession`. Period/final events clear possession. No continuous tracking is claimed.
- Machine-readable targets carry template, anchor sequence, horizon, optional named team and opening eligibility. Open/lock times remain on the containing question. Late joiners wait for the next question. Resolution uses normalized event identity, value and time, never prose or future answers.
- `next_score_team` includes free throws. `next_made_field_goal_value` ignores free throws and misses. `team_scores_in_window` counts named-team scoring within the inclusive game-time horizon. Multiple ordered events can share that horizon timestamp. Missing next-score/basket outcomes void after horizon/final; void earns zero and preserves streak. Free predictions have no fabricated probability factor.
- Pick acceptance is server-owned and strictly before cutoff. New picks at equality are rejected. Season results apply once, including after restart. Shared participant identity remains season-scoped.

## Pick and receipt contract

Basketball `POST /api/rooms/:code/picks` requires:

```json
{
  "participantToken": "<participant credential>",
  "requestId": "unique-client-request-id",
  "questionId": "basketball-q1",
  "optionId": "harbor"
}
```

`requestId` accepts 1–128 ASCII letters, numbers, underscores or hyphens. Generate one per intended submission; retain it for retries. Football may continue omitting it. Providing it opts football picks into the same receipt protocol. B must pass a stable request ID from basketball UI/command/MCP callers; this delivery does not edit B-owned parsers or descriptions.

Success remains a `RoomSnapshot`, adding `receipt` only to that mutation response:

```ts
type PickReceipt = {
  requestId: string;
  participantId: string;
  questionId: string;
  optionId: string;
  acceptedAt: number; // server Unix milliseconds
  acceptanceSequence: number; // strictly increasing within the room
};
```

Receipts are scoped by room, participant and request ID. An identical retry returns the original receipt even after lock/resolution/restart; the accompanying snapshot is current state and may show a later changed answer. Reusing the ID with another question/answer returns `409 IDEMPOTENCY_CONFLICT`. A new request ID changing a free answer uses the new acceptance timing. A same-choice retry preserves the original scoring timing. No exact-first-caller bonus is claimed.

`GET /api/rooms/:code/receipts/:requestId` requires `Authorization: Bearer <participant credential>` and returns the receipt itself. Missing/malformed authorization returns `401 UNAUTHORIZED`; invalid/host credentials return `401 BAD_CREDENTIAL`; an unknown receipt, including another participant's receipt, returns `404 RECEIPT_NOT_FOUND`. Receipts are absent from ordinary public/private snapshot reads.

Missing basketball request ID returns `400 BAD_REQUEST`. Late joiners receive `409 NOT_ELIGIBLE`; closed/new late submissions receive `409 PICKS_LOCKED`. Save failure returns `503 ROOM_SAVE_FAILED`, retaining the previous committed pick, receipts and version. Retrying an uncommitted request is a new acceptance. Receipt lookup does not advance replay.

Browser-safe exports remain `server/src/shared/room.ts`, now also exporting `BasketballTarget`, `PickReceipt` and `QuestionResolution`. `RoomQuestion.status` adds `void`, with `voidReason` and no `result`. Consumers must render this state without claiming a correct/wrong outcome or a broken streak. Target eligibility contains public participant IDs, never credentials.

## Storage

Durable file version remains 2, with optional additive `pickReceipts` and question target/void fields. The updated validator preserves them across saves and restart and checks receipt ordering, participant references and target eligibility. Existing version-2 football files need no migration; version-1 backup/migration behavior remains intact. Older server builds do not understand the new fields, so do not downgrade a basketball/receipt store to the original checkpoint server.

The durable beat index is the cursor into the immutable versioned script; it determines the applied normalized sequence and projected score/possession. Aggregated stats, remaining active time, pause state, accepted picks, receipts and once-only season marker remain durable room fields. Stable visible event IDs allow clients to retain their own celebration cursor; browser animation/reload behavior remains B-owned.

Storage is still synchronous single-process JSON, with no cross-process transaction guarantee. Committed-point ledger, quote/confirmation services and generalized mutation receipts remain later work.

## Source audit

`server/src/game/games/harbor-vs-summit.json` contains 16 athletes and 64 events: 49 scoring events (30 twos, 17 threes, two free throws), 41 assists, two rebounds, two steals, two turnovers, and period boundaries at 120, 240, 360 and 480 seconds. Score arithmetic matches the declared 57–56 final.

Inconsistencies/limits found before finalizing the room replay:

- The score at source second 451 is 53–54, and at 466 it is 55–56. Both descriptions incorrectly call these ties. The room script corrects those descriptions; legacy source data is preserved.
- The source lacks explicit misses, blocks and possession boundaries. Those are newly authored fiction, not observations recovered from the old file. Original score and assist credits are unchanged; the authored defensive additions produce three rebounds and one block in total.
- The eight-minute source clock is a compressed story. The room timeline maps it to four 12-minute game periods while using separate short presentation durations. Event timestamps are synthetic, anchored at October 23, 2026 12:00 UTC; they are not live-provider observations or the room's acceptance clock.
- Shot subtypes are retained only where declared by source tags or deliberately authored. An unspecified made two remains a two; it is not relabeled as a layup. Player possession is not inferred from the latest scorer.

## Calibration evidence

`basketballCalibrationReport()` in `basketball/calibration.ts` inspects pregame inputs only. All weights remain 1.0; real positional balance is unverified.

| Position | Athletes | Mean authored projection | Weight |
|---|---:|---:|---:|
| PG | 3 | 28.33 | 1.0 |
| SG | 3 | 25.67 | 1.0 |
| SF | 4 | 21.25 | 1.0 |
| PF | 3 | 21.33 | 1.0 |
| C | 3 | 19.67 | 1.0 |

Observed auto-lineups: balanced costs $50,000 for 144.5 expected points; stars costs $50,000 for 145; value costs $41,750 for 122. These are authored projections, not expected outcomes from a trained model. The declared exact-cap manual lineup is captain `har-pg-1`, flex `har-sg-7`, `har-sf-11`, `har-pf-21`, `har-c-44`. Boundary tests also reject that $50,000 lineup under a saved $49,999 cap.

No historical calibration dataset is available in this checkpoint. Adoption gate: declare an authorized pregame training window, position sample sizes/minutes treatment and a later held-out window; propose weights bounded to 0.80–1.25; require held-out positional mean weighted production within 10% of the common target and at least three distinct affordable captain lineups. Report failed thresholds rather than tune on this fictional final. Adopt only under a new rules/catalog version. These are proposed validation thresholds, not achieved evidence.

## Verification and next work

New test files cover reducer validation/duplicates/order, timeline validation, catalog/lineup/scoring/calibration, active-time and final persistence, real `createApp` HTTP routes, target semantics/void persistence, and durable receipt retry/isolation/failure behavior. `fixtures/basketball-contract.json` contains actual public lobby/open/locked/resolved/final responses captured through a fresh HTTP app with generated rehearsal identities. It contains no credentials or future script. Void is tested with an isolated no-event target; no live/stale-source fixture is presented as supported live behavior.

Current completion evidence is recorded in the final checkpoint update below after the full checks. Required downstream work is B's basketball command/request-ID and void rendering integration, followed by C's connected M2 demo acceptance. Fix reproducible domain failures from that gate before starting the later committed-points wave. Phases 10–16 remain pending, including actual provider access/licensing/timing, market data, tracking evidence and multi-process storage/auth hardening. No push, PR or deployment is part of this delivery.

### Observed checkpoint checks

- Test-first failures demonstrated the missing reducer, timeline, catalog, basketball registration, receipt protocol, target metadata and contribution breakdown before implementation. A horizon-equality regression failed before changing the resolver to process all eligible events at that timestamp.
- `npm run test -w server -- --maxWorkers=1`: 49 files, 810 tests passed in the final run. Includes real HTTP play-through, save-failure rollback, pick retry/conflict/isolation, cutoff equality, live/paused restart, persisted void/streak retention, football compatibility and once-only final/season.
- `npm run test -w web`: 59 files, 500 tests passed.
- `npm run typecheck`: server, widget and web passed after final implementation changes.
- `npm run build`: passed; existing Vite warning for chunks larger than 500 kB remains.
- Fresh `createApp` HTTP fixture capture: lobby/open/locked/resolved/final, 57–56, one season application; credential absence asserted before writing the fixture.
- Manual correctness review covered event identity/order, declared credit validation, inclusive horizon ordering, server cutoff, eligibility, receipt publication after persistence, restart cursor/time and terminal scoring.
- Manual security review covered untrusted event IDs/references, receipt participant authorization, host rejection, public snapshot/fixture serialization, and save-error behavior. No new scoped vulnerability was found. Wider-service authentication, rate limits and database concurrency remain Phase 16 work.
- Cleanup retained shared stat weights and reused one target resolver for authored validation and runtime resolution. No dependency, shared script, B-owned implementation or C-owned QA-tool changes were needed.
- `git diff --check`: passed. No browser, microphone, physical display, paid-provider, live-basketball or deployed-service evidence is claimed.

The backend continuation covers the Phase 01 basketball-selection remainder, Phase 02, Phase 03, Phase 04 free-prediction domain and P08.8. It is ready for connected M2 acceptance, not a completed end-to-end demo. B must adopt the new request-ID/receipt/void contract; C must integrate and validate the provisional baseline and user journey before the next feature wave.
