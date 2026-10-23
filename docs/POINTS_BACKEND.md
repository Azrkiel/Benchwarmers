# Points backend checkpoint

October 23, 2026. Continues backend `72b648f` on `feature/basketball-backend`. Scope is Worker A's P10.1–P10.5 and P10.7 service work. The user authorized further backend work and explicitly kept B-owned source outside this chat's edit scope.

## Availability and milestone boundary

The service is implemented but **disabled by default**. The ordinary application entry point does not turn it on. The existing free-prediction demo remains the default while B's playback fix and C's complete demo gate remain outstanding. This checkpoint prepares the next backend wave; it does not assert that Phase 09 or an end-to-end commitment UI has passed.

An integration/rehearsal caller can explicitly construct:

```ts
new RoomStore({
  dataFile: isolatedRoomFile,
  enableCommitments: true,
  probabilities: [
    {
      gameId: 'harbor-vs-summit',
      templateId: 'next_score_team',
      optionId: 'harbor',
      estimate: {
        p: 0.366,
        version: 'authored-rehearsal-v1',
        label: 'Authored rehearsal probability',
        source: 'demo_projection',
        observedAt: rehearsalClock,
        validUntil: rehearsalClock + 60_000,
      },
    },
  ],
});
```

This example is an authored test input, not a measured probability or live forecast. Production defaults contain no such estimates. A client cannot enable the feature or supply pricing through room-creation/quote JSON. Missing, invalid, stale, future-observed, or unprovenanced estimates reject the quote with `PROBABILITY_UNAVAILABLE`; ordinary free predictions continue to work.

Enablement affects newly created basketball rooms only. Existing rooms are not silently given a bank or retroactive rewards. A saved points room retains its bank/holds and continues automatic settlement even when a restarted server disables new quotes/acceptances. Previously accepted receipt retries remain recoverable. No new environment variables, dependencies or root scripts were added.

## Public contract for Worker B

Browser-safe exports are in `server/src/shared/room.ts` and `server/src/shared/points.ts`:

- `CallBank`: `grantPoints`, `availablePoints`, `reservedPoints`, `settledRiskNet`, `correctionDebt`.
- `CommitmentQuote`: B's requested quote fields, plus `targetVersion`, `maximumLossPoints`, `probabilityVersion`, `probabilitySource`.
- `CommitmentReceipt`: `callId`, `requestId`, `quoteId`, `questionId`, `optionId`, `optionLabel`, `commitPoints`, `totalReturnPoints`, `acceptedAt`, `acceptedSequence`, `state` (`pending`, `won`, `lost`, `void`).

An authenticated snapshot supplies `me.bank` and `me.commitments` only for a points-enabled room. Public snapshots do not contain bank balances, quotes, commitment receipts, ledger entries or pending voice confirmation. Public standings add `settledRiskNet`; `total` is already fantasy + free predictions + settled risk net. The 100-point starting grant never increases the leaderboard. Fantasy points remain nonspendable. Season total points include settled risk net once at final.

| Route | Body / authorization | Result |
|---|---|---|
| `POST /api/rooms/:code/commitment-quotes` | `{participantToken, questionId, optionId, commitPoints}` | `{quote}`; no balance change |
| `POST /api/rooms/:code/commitments` | `{participantToken, quoteId, requestId}` | `{commitment}`; one durable hold |
| `GET /api/rooms/:code/commitment-receipts/:requestId` | Participant bearer credential | `{commitment}`; no replay advancement |
| `POST /api/rooms/:code/commitment-confirmations/quote` | Same as quote body | `{quote}` plus private durable pending confirmation |
| `POST /api/rooms/:code/commitment-confirmations/confirm` | `{participantToken, requestId}` | `{commitment}` for that actor's pending quote |

These names match B's existing contract request. No B-owned parser, MCP implementation or UI file was edited. B must connect its `commit`/`commit_confirm` commands to `quoteCommitmentForVoice` / `confirmPendingCommitment` and speak the exact stake, total return and maximum loss before an explicit confirm. An ordinary yes must not dispatch the confirm service. The service itself never accepts a commitment on quote creation.

Allowed stakes are 10, 25 or 50. Request IDs use the existing 1–128 ASCII letter/number/underscore/hyphen convention. Identical acceptance retries return the same call with its current terminal/pending state, even after lock or restart; reusing an ID for another quote returns `IDEMPOTENCY_CONFLICT`. A new request ID cannot add a second commitment to the participant/target pair. Receipt lookup is participant-scoped; another participant sees `RECEIPT_NOT_FOUND`, and a host credential cannot impersonate a participant.

Errors use the existing `{error, code}` envelope. Schema failures use `400 BAD_REQUEST`; service errors preserve `RoomError` compatibility for B's command handlers. Relevant rejection codes: `FEATURE_DISABLED`, `PROBABILITY_UNAVAILABLE`, `QUOTE_EXPIRED`, `QUOTE_CHANGED`, `BAD_QUOTE`, `INSUFFICIENT_POINTS`, `PICKS_LOCKED`, `NOT_ELIGIBLE`, `CALL_ALREADY_COMMITTED`, `SOURCE_STALE`, `IDEMPOTENCY_CONFLICT`, `NO_PENDING_CONFIRMATION`, `RECEIPT_NOT_FOUND`, and `ROOM_SAVE_FAILED`.

## Accounting and acceptance

`points/ledger.ts` stores nonnegative safe integer half-point units. Debit/credit direction is explicit, including corrections. 25.5 points is 51 units. Posting rejects nonfinite/fractional/negative units and balance overflow. Reasons are grant, free reward, hold, return, refund and correction. A grant and each question reward have stable posting identities.

`points/quotes.ts` uses only explicitly supplied probability/provenance and accepted crowd state. Its formula follows the master plan: capped inverse probability, crowd discount, 1.10 first accepted caller factor per option/target, floor multiplier to hundredths, floor total return to half-point units. A crowd discount can make the declared multiplier less than 1; the API reports the exact return rather than implying every win guarantees a positive net.

Quote expiry is the earliest of 15 seconds, probability validity and question cutoff. Acceptance is strictly before expiry/cutoff and only for an open eligible target. It rechecks ownership, target/anchor, probability version/value/provenance, accepted support, first-caller eligibility, bank and prior commitment. A changed offer requires a new quote and explicit confirmation. Clock-only snapshot versions do not reprice an otherwise identical offer.

Room acceptance stages the call, frozen terms, one ledger hold, monotonic acceptance sequence and receipt in the existing atomic room transaction. It also fixes the ordinary free answer to the selected option; changing it later is rejected. Same-choice retries retain the original free-pick timing. A failed save rolls back everything and returns no successful receipt. A successful quote changes only stored offer state, not balance.

Voice pending state is short-lived and bound to actor/quote/target. It survives restart subject to its original real-time expiration. Another actor, an unrelated confirm or an expired/stale offer cannot spend points. A repeated accepted confirmation request recovers its earlier receipt without spending again.

## Settlement and durable validation

`points/settle.ts` posts from terminal target identity/result and frozen terms:

- Win credits the quoted total return, including stake, once.
- Loss settles the held stake with no second debit.
- Void refunds exactly the stake and contributes zero risk net.
- A later outcome revision reverses the prior credited return with an explicit correction posting, then applies the new return/refund. Same revisions are idempotent; conflicting reuse is rejected.

Example tested at a 3.0x total-return quote: bank 100 -> commit 25 -> available 75/reserved 25 -> win -> available 150/risk net +50; loss -> available 75/risk net -25; void -> available 100/risk net 0. Free rewards add separately. An official correction of already-spent winnings can leave correction debt; it never cancels unrelated pending calls or erases the debit. Later free rewards clear debt through the same ledger balance. The correction engine is tested here; no live-provider correction integration is claimed.

Durable room format stays version 2 with an optional, internally versioned `points` state. It preserves ledger, quotes, calls and pending confirmations. Validation checks safe amounts, unique identities, one hold per call, immutable quote/call references, outcome state, per-call postings, participant references, free-reward totals and bank conservation. Existing football and non-points rooms remain compatible. Older builds do not understand these fields; do not downgrade a points store to them. Storage remains single-process JSON.

## Observed checks

- Test-first failures demonstrated missing modules, banks, methods, routes, receipt/confirmation behavior, frozen provenance, malformed-provenance handling, overflow rejection and terminal-state validation before implementation.
- Points-focused tests cover all three outcomes, changed/expired quotes, first-caller repricing, private receipts, immutable picks, save-failure rollback, settlement rollback, restart and once-only season totals.
- A deterministic 200-sequence loop exercised rewards, quotes, holds, retries, win/loss/void settlement, corrections and ledger conservation.
- Fresh real `createApp` HTTP rehearsal with explicitly injected authored probability: 25-point hold, 75-point total return, restart/retry/receipt recovery, 57–56 final, bank 162.5 (100 grant + 12.5 free reward + 50 risk net), zero reserve/debt, and one season application after a second restart. Public state omitted bank/quote data.
- Final full-check counts are recorded after verification below. No provider access, real microphone, physical sound output, browser commitment UI, deployment, push or PR is claimed.

Final observed verification:

- `npm run test -w server -- --maxWorkers=1`: 61 files, 856 tests passed after the final ledger/probability validation changes.
- `npm run test -w web`: 74 files, 570 tests passed.
- `npm run typecheck`: server, widget and web passed after the final implementation changes.
- `npm run build`: passed; the existing Vite warning for chunks above 500 kB remains.
- `git diff --check`: passed.
- Manual correctness/security review covered participant/quote ownership, receipt isolation, public serialization, clock equality, stale/missing probability rejection, immutable terms, ledger safe-integer bounds, staged save publication, restart, terminal posting and correction debt. No unresolved finding remains in this scoped backend delivery. Deployment-wide auth/rate limits, provider corrections and multi-process transactions remain later work.
- Cleanup reused the existing room transaction/persistence boundary, shared basketball rewards and the same points engine across REST and voice-confirmation services. No dependency, manifest, B-owned implementation or C-owned acceptance script was changed.

## What Worker A needs to do next

1. Support B/C integrating these methods and schemas after the demo gate, and fix reproducible backend integration defects. B still owns its playback takeover race, parser/MCP binding and client confirmation flow. The user chose to leave the playback fix to B.
2. Phase 11: supported call catalog, canonical targets, mandatory commitment at creation, active-target/cooldown limits, follower quotes and no extra free reward for a voluntary call. Those endpoints are not implemented here.
3. Phase 13: authoritative pregame winner target/cutoff/resolver and honest fictional-source behavior; external market adapters require a correctly mapped real matchup and permitted data. No market numbers should be invented for Harbor/Summit.
4. Phase 12 and later: authorized provider evaluation/ingestion, event revisions/corrections, freshness and measured safe windows; advanced tracking requires coverage evidence. Wider-service storage/auth/session hardening remains Phase 16.

The server points service is a completed backend slice; it is not completion of all Worker A tasks or permission to enable a later feature wave on the submission candidate.
