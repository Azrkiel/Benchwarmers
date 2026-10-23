# Pregame winner backend checkpoint

October 23, 2026. Continues `fc66bf6` on `feature/basketball-backend`. This slice supports B's P13.4 winner-pick journey and implements the fictional/unavailable-source fallback from P13.6. It also adds the initial synthetic provider boundary documented in [LIVE_BASKETBALL.md](LIVE_BASKETBALL.md). It does not complete Phase 12 or Phase 13.

## Availability and scoring

`new RoomStore({enablePregame:true})` opts newly created basketball rooms into free pregame winner picks. It is independent of `enableCommitments`; no bank is required. Both remain disabled in the ordinary application entry point. Existing saved rooms are not retrofitted. Restarting with the flag disabled prevents new picks but preserves accepted retries, result resolution and rewards.

The current source is a fictional replay. Its server-owned cutoff is **host start**, explicitly returned as `cutoff: "replay_start"`. Start locks the winner target and lineups in the same durable transaction before the first replay beat. It is not represented as an official scheduled tip-off. A real-game scheduled cutoff, postponement policy and source-driven lifecycle still require a registered live adapter and verified game identity.

The public rule states that the replay final score decides the winner; a tied final voids the pick. A correct winner pick earns a flat 10 free-prediction points. No probability, speed, crowd or streak multiplier applies. It does not change the in-game prediction streak. Points-enabled rooms credit the same 10 points to the bank through the existing free-reward ledger. Wrong/void picks receive zero and debit nothing. Winner rewards apply before the once-only season contribution.

Only the final adapter projection is used at settlement; no pregame calculation reads the future replay result. The standalone sports-result resolver leaves scheduled, postponed, in-progress and provisional-final inputs unsettled, voids abandoned games/tied finals, and uses final sports scores rather than market settlements. It can evaluate revised final inputs, but applying provider corrections to saved room rewards and replacing season contributions remains Phase 12 work. No correction integration is claimed.

## API and contract for B

`server/src/shared/room.ts` exports `PregameView`, `PregamePickInput` and `PregameReference`. Opted-in snapshots add `pregame`, separate from the live featured `question`. It contains home/away options, counts, status, `acceptingPicks`, cutoff, the 10-point reward and the resolution rule. Only authenticated `me` adds the actor's `pregamePick: {optionId, acceptedAt}`. Individual picks, credentials and receipts are not exposed publicly. Closed targets have `lockedAt`; results appear only at final.

| Route | Input | Output |
|---|---|---|
| `GET /api/rooms/:code/pregame-reference` | Public room code | Current fallback: `{status:"unavailable", reason:"fictional_game", label, reference:null, commitmentQuotingEnabled:false}`. Unmapped non-fictional adapters receive `unmapped_game`. No provider request or replay advancement occurs in this read. |
| `POST /api/rooms/:code/pregame-picks` | `{participantToken, requestId, optionId}` | `RoomSnapshot` plus the durable `receipt`. Strict schema rejects stake, price and unsupported fields. |
| `GET /api/rooms/:code/receipts/:requestId` | Participant bearer credential | Existing participant-scoped pick receipt. |

Corresponding services: `pregameReference` and `pickPregame`. Request IDs use the existing 1–128 ASCII letter/number/underscore/hyphen format and share the participant's free-pick request namespace. An identical retry returns the original receipt after start/final/restart; the snapshot contains current state. Reusing an ID for a different pick conflicts. A new request may change the winner pick only in the lobby. Same-choice submissions retain the original pick timing while each accepted request has its own receipt.

Errors retain the existing envelope and codes: `BAD_REQUEST`, `BAD_OPTION`, `BAD_CREDENTIAL`, `FEATURE_DISABLED`, `PICKS_LOCKED`, `IDEMPOTENCY_CONFLICT`, `RECEIPT_NOT_FOUND` and `ROOM_SAVE_FAILED`. A host token cannot impersonate a participant. Failure to save a pick publishes neither pick nor receipt; failure to save host start leaves the lobby and cutoff open. Final-write failure rolls back reward, final state and season together.

## Market/source policy

Harbor/Summit and the football demo are explicitly fictional adapter identities. Neither receives real market percentages. There is no Kalshi/Polymarket adapter, matched market, invented complement or authored winner probability in this patch. The unavailable-reference response does not stop free picks or host start. Market-based winner commitment quotes are unavailable.

Before adding an external reference, establish the actual league, provider game/team IDs, scheduled date and compatible game-winner settlement rules. An ambiguous name/search hit, series market, spread or another day's game must not attach. Cache provenance/time/declared price method separately from room support and sports settlement. Those mapping/cache/adapter tasks remain pending rather than being represented as completed by synthetic source tests.

## Persistence and verification

File version remains 2 with an optional internally versioned `pregame` state. The validator checks phase/cutoff consistency, participant/team/receipt references, final-score winner identity and required reward postings. Existing rooms and football behavior remain compatible. Older builds do not preserve this state; do not downgrade an opted-in store.

Test-first failures demonstrated missing service/snapshot state, missing routes and a missing durable reward check before implementation. Tests cover default-off/no retrofit, free play without a bank, actor isolation, changed/same-choice picks, retry/restart, start cutoff, failed pick/start/final writes, authoritative 57–56 resolution, zero loss debit, private serialization and once-only season/reward application. The HTTP test uses the real `createApp` mount. Separate resolver tests cover postponed/provisional/abandoned/tied/revised inputs and invalid scores. Synthetic source-boundary tests cover explicit mapping and fail-closed freshness; they are not live-provider validation.

Observed verification:

- `npm run test -w server -- --maxWorkers=1`: 67 files, 889 tests passed.
- `npm run test -w web`: 74 files, 570 tests passed.
- `npm run typecheck`: server, widget and web passed.
- `npm run build`: passed; the existing Vite chunk-size warning remains.
- The four new focused test files passed 19 tests, including the real-app HTTP test and synthetic boundary/resolver cases.
- `git diff --check`: passed.
- Manual correctness review covered cutoff/start transaction order, shared receipt namespace, same-choice timing, no future-result exposure, settlement-before-season order, save rollback and disabled restart behavior.
- Manual security review covered host/participant separation, private-pick serialization, strict schema rejection, explicit provider/entity mappings, durable winner/reward consistency and the absence of runtime live/network enablement. No unresolved finding remained within this scope; deployment auth/rate limits and live-provider validation remain pending.
- Cleanup reused the existing transaction, receipts, free-reward ledger and season boundary; the reusable winner resolver and source modules remain separate from HTTP and B-owned implementations.

B owns UI/voice/MCP bindings and C owns connected acceptance. No frontend, B-owned implementation, dependency, root script, provider credential, deployment, push or PR was changed. Next backend work remains live transport/runner/cursor reconciliation, event correction and season replacement, measured safe future windows, real market mapping/cache, and the Phase 16 storage/auth work after its release gate.
