# Player-created calls backend checkpoint

> Follow-up: [pregame winner backend](PREGAME_BACKEND.md) adds the gated free winner target and fictional-source fallback. [Live basketball access](LIVE_BASKETBALL.md) records the synthetic provider boundary and remaining access gates.

October 23, 2026. Continues `77d16d0` on `feature/basketball-backend`. Implements Worker A's P11.1–P11.4 and P11.6 for the two initial templates. Worker B's composer, parser/MCP binding and shared-display notices remain pending. The ordinary application entry point still disables commitments. This is an isolated backend delivery, not the Phase 09 demo gate or end-to-end Phase 11 acceptance.

## Available behavior

- `next_score_team`: the room's home/away IDs; includes free throws.
- `next_made_field_goal_value`: `two` or `three`; ignores free throws and misses.
- Possession-specific made threes, named players, layups and arbitrary propositions are unsupported. The catalog omits them; the strict quote schema rejects extra fields rather than silently changing the request.
- Creation is restricted to the scripted basketball adapter's existing safe response windows. The server supplies the current anchor, cutoff and permitted absolute game-time horizon range. A horizon must be a safe integer within those bounds. It cannot extend the acceptance window. Paused, closed, stale-anchor and late-joiner requests cannot commit.

The canonical semantic key is `[gameId, templateId, anchorSequence, teamId-or-null, horizonGameElapsedMs]`. Actor, answer and stake never allocate a new opportunity. A voluntary call with exactly the current prompted target's semantics shares its existing ID, including pre-upgrade holds; other calls receive a stable hash of the semantic key. Prompted/voluntary acceptance therefore shares participant-target uniqueness, accepted support and first-caller status.

A quote is private and durable but allocates no public target, hold or notice. Only explicit acceptance atomically creates/joins the target, freezes terms, holds the stake and saves the receipt. Disk failure rolls all of those changes back. A race that fills room capacity or changes pricing rejects acceptance and requires another review. Identical accepted retries recover the same call, including after lock, settlement and a restart with commitments disabled.

Limits are rechecked both when quoting and accepting:

- One pending voluntary commitment per participant.
- One accepted commitment per participant/semantic target, including prompted aliases.
- Three active voluntary targets per room. Joining an existing target does not allocate another.
- Fifteen real seconds between creating new targets for the same participant; equality is allowed. Completed targets and accepted request IDs remain durable. Followers do not restart the creator cooldown.

Every follower receives current pricing from accepted support and a fresh statistical reference; earlier accepted terms remain frozen. Public call `pickCounts` contains accepted counts per side, not modeled probabilities or free-pick support. Probability labels/provenance and return terms remain in the participant's quote.

## API and browser-safe contracts

Imports: `server/src/shared/room.ts` exports `CallCatalog`, `CallTemplateId`, `PlayerCallInput`, `PlayerCallQuote` and `RoomPlayerCall`. Existing commitment quote/receipt types are unchanged.

| Route | Input | Output |
|---|---|---|
| `GET /api/rooms/:code/call-catalog` | Public room code | `{enabled, templates, window}`. Templates include exact option IDs, required capabilities, fields and resolver reference. Window is null when no safe creation window is available or the feature is disabled. |
| `POST /api/rooms/:code/call-quotes` | `{participantToken, templateId, anchorSequence, horizonGameElapsedMs, optionId, commitPoints}` | `{quote, target}`. Target is a private review preview with zero base reward; quote includes exact total return, maximum loss and expiry. |
| `POST /api/rooms/:code/calls` | `{participantToken, quoteId, requestId}` | `{commitment}`. Requires a player-call quote; no direct unreviewed creation. |
| `GET /api/rooms/:code/commitment-receipts/:requestId` | Participant bearer credential | Existing private `{commitment}` lookup, without advancing replay. |

Service methods are `callCatalog`, `quotePlayerCall` and `acceptPlayerCall`. The existing `acceptCommitment` service also recognizes player-call quotes and applies the same rules, so transport choice cannot bypass limits. B can consume these services and schemas without copying gameplay validation. A future voice binding must retain actor-bound explicit confirmation; quote creation alone never accepts a call. Existing prompted voice-confirmation routes are unchanged.

Points-enabled snapshots add `calls: RoomPlayerCall[]`, initially empty. Each entry has the public question fields plus `creatorId` and `createdAt`; B can resolve the creator's name from standings. Calls remain separate from `question`, so the featured prediction is unchanged. Public responses contain no quote IDs, receipts, bank balances, pending confirmations or ledger entries. Non-points rooms omit `calls`.

Stake values remain 10/25/50. Request IDs retain the 1–128 ASCII letter/number/underscore/hyphen convention. New service errors are `TARGET_UNSUPPORTED`, `STALE_ANCHOR`, `BAD_HORIZON` and `CALL_LIMIT_REACHED`. Existing errors include `FEATURE_DISABLED`, `PICKS_LOCKED`, `NOT_ELIGIBLE`, `BAD_OPTION`, `BAD_QUOTE`, `PROBABILITY_UNAVAILABLE`, `QUOTE_CHANGED`, `QUOTE_EXPIRED`, `CALL_ALREADY_COMMITTED`, `INSUFFICIENT_POINTS`, `IDEMPOTENCY_CONFLICT` and `ROOM_SAVE_FAILED`. Strict REST schema failures use `400 BAD_REQUEST`.

## Probability and reward boundaries

`RoomProbability` optionally binds an injected estimate to `anchorSequence` and `horizonGameElapsedMs`. A voluntary target that differs from the prompted target requires both exact bindings. A generic template estimate cannot price another horizon or another template. An exact prompted alias may reuse the existing server-injected prompted estimate. The ordinary entry point contains no estimates; tests use explicitly authored inputs, not measured forecasts or invented market data.

Voluntary acceptance does not create a free pick or change the free-pick streak. Settlement uses the same normalized basketball resolver and points engine as prompted calls: win credits the frozen total return, loss has no second debit, void refunds the stake. If the participant already explicitly picked the matching prompted question, accepting its voluntary alias keeps that pick consistent with the committed side; a changed side gets the new acceptance timing. That prompted opportunity may still earn its ordinary reward once. A voluntary target itself never grants an extra free base reward.

## Durability and checks

Room file version remains 2. Optional `playerCalls` and private quote draft metadata are preserved. Validation checks canonical identities, authorized scripted windows/horizons, options, participant references, creator/accepted-quote linkage, terminal outcome consistency and the existing ledger invariants. New drafts do not add dependencies, environment variables or package scripts. Older builds do not understand these fields; do not downgrade a store containing player calls.

Test-first failures demonstrated missing catalog/services/routes, creator metadata, inconsistent existing free answers and missing durable safe-window validation. `player-calls.test.ts` and `player-calls-routes.test.ts` cover grammar rejection, private previews, shared prompted identity, follower repricing, exposure/cap/cooldown checks including acceptance races and cooldown equality, pause/expiry, exact probability semantics, win/loss/void, failed creation/settlement rollback, disabled restart/receipt retries, corrupted data, 57–56 final and once-only season totals. The HTTP test exercises the real `createApp` mount on an ephemeral loopback port.

Observed verification:

- `npm run test -w server -- --maxWorkers=1`: 63 files, 870 tests passed.
- `npm run test -w web`: 74 files, 570 tests passed.
- `npm run typecheck`: server, widget and web passed; rerun after strengthening the HTTP test to use `createApp`.
- `npm run build`: passed; the existing Vite warning for chunks above 500 kB remains.
- Focused player-call tests: 14 passed; the HTTP test passed again after switching from the isolated room router to the full app mount.
- `git diff --check`: passed.
- Manual correctness review covered canonical prompted aliases, quote/accept races, safe cutoffs, real-time expiry versus paused replay, per-actor exposure, exact probability semantics, immutable existing picks, settlement before season recording, and rollback/restart behavior.
- Manual security review covered participant versus host credentials, quote ownership, strict unsupported-field rejection, receipt isolation, safe integer horizons, durable window/creator references and explicit public serialization. No unresolved finding remains in this scoped change. Wider-service auth/rate limits and multi-process transactions remain later work.
- Cleanup kept the existing ledger, pricing, settlement and transaction boundaries, isolated call grammar/window logic in `calls/`, and placed public types in browser-safe `shared/calls.ts`. No dependency, manifest, B-owned implementation or C-owned acceptance file changed.

## Next work

B owns the composer, voice command binding and display notices. C owns connected demo/Phase 11 acceptance. Keep this feature disabled in the ordinary entry point until their gates pass. Later A work remains authoritative pregame winner targets and honest source behavior, then provider evaluation/ingestion/corrections/freshness and storage/auth hardening. No provider access, live feed, browser composer, microphone, deployment, push or PR is claimed here.
