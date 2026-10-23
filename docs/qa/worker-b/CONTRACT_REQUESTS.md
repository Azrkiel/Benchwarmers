# Worker B -> Worker A: contract requests for Phases 07, 10, 11, 13

Date: 2026-10-23. These are the smallest additive fields and routes B's screens consume. B's client types: `web/src/room/points/types.ts`; the only place routes are named: `web/src/room/points/api.ts`. If A picks different names, B swaps those two files; nothing else changes. Screens stay hidden until a snapshot carries the fields.

## 1. Playback lease (P07.7) — ready to register

`server/src/room/playback.ts` exports `PlaybackLeases` and `createPlaybackRouter(leases, isHost)`. Request: in `routes.ts`

```ts
const leases = new PlaybackLeases();
router.use('/:code/playback', createPlaybackRouter(leases, (code, hostToken) => store.isHost(code, hostToken)));
```

plus a read-only `RoomStore.isHost(code, token): boolean` (no mutation, no version bump). Responses: `GET /` -> `{lease:{label,expiresAt}|null}`; `POST /claim {deviceId,label?,force?,hostToken?}` -> 200 `{granted:true}` or 409 `{code:'PLAYBACK_HELD', lease}`; `POST /release {deviceId}`. Tests: `server/test/room/playback.test.ts`.

## 2. Commitments (P10.6, P10.8; A owns P10.1-P10.5, P10.7)

Private snapshot fields under `me` (never in public reads):

```ts
me.bank?: { grantPoints: number; availablePoints: number; reservedPoints: number; settledRiskNet: number; correctionDebt: number }
me.commitments?: CommitmentReceipt[] // { callId, requestId, quoteId, questionId, optionId, optionLabel, commitPoints, totalReturnPoints, acceptedAt, acceptedSequence, state: 'pending'|'won'|'lost'|'void' }
```

Points are game points with half-point precision (A may store integer half-units internally). `RoomStanding.total` must already include settled call net; B never recomputes it.

Routes:

- `POST /api/rooms/:code/commitment-quotes` body `{participantToken, questionId, optionId, commitPoints}` -> `200 {quote}` where quote is `{quoteId, targetId, questionId, optionId, optionLabel, commitPoints, totalReturnPoints, multiplier, probabilityLabel, firstCaller, expiresAt}`. No balance change.
- `POST /api/rooms/:code/commitments` body `{participantToken, quoteId, requestId}` -> `200 {commitment}`; identical retry returns the same commitment.
- Errors B renders: `QUOTE_EXPIRED`, `QUOTE_CHANGED` (B fetches a new quote and asks again), `INSUFFICIENT_POINTS`, `PICKS_LOCKED`, `CALL_ALREADY_COMMITTED`, `SOURCE_STALE`, `IDEMPOTENCY_CONFLICT`.

Voice (P10.7): B's parser already emits `{kind:'commit', questionId, optionId, amount}` and `{kind:'commit_confirm'}` and currently refuses them without mutating. Request: a store method pair, e.g. `quoteCommitmentForVoice(code, {participantToken, questionId, optionId, commitPoints})` returning the quote and storing a short-lived pending confirmation bound to actor/target/quote, and `confirmPendingCommitment(code, {participantToken, requestId})`. B will speak the amount, exact return and loss, and accept only "confirm".

## 3. Player calls (P11.5, P11.7; A owns P11.1-P11.4, P11.6)

- `GET /api/rooms/:code/call-catalog` -> `{templates: [{id, label, options:[{id,label}], horizons:[{id,label}], available, unavailableReason?}]}` (ids `next_score_team`, `next_made_field_goal_value`, `team_next_possession_three`).
- Call quote: same `commitment-quotes` route with `{participantToken, templateId, optionId, horizonId, commitPoints}` instead of `questionId`.
- `POST /api/rooms/:code/calls` body `{participantToken, quoteId, templateId, requestId}` -> `200 {commitment}`; errors `CALL_LIMIT_REACHED`, `TARGET_UNSUPPORTED`, plus the commitment errors.
- Public snapshot `calls?: [{id, templateId, creatorName, optionLabel, horizonLabel, followers, createdAt, state}]`. B shows one notice per new id and a separate Calls view.

## 4. Pregame winner pick (P13.4, P13.5; A owns P13.1-P13.3, P13.6)

Public snapshot `pregame?: {questionId, closesAt, status:'open'|'locked'|'resolved'|'void', resolutionRule, reference?: {source, sourceUrl?, observedAt, home, away, method, stale}, crowd:{home, away}, myPick?: 'home'|'away', result?: 'home'|'away'}` (`myPick` only for an authenticated reader). Picks use the existing `POST /picks` with `questionId = pregame.questionId`, `optionId = 'home'|'away'`, and a `requestId`. Fictional games omit `reference`.
