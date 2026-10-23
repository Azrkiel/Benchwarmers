# Findings for A/B

**Superseded baseline findings:** the integrated main candidate has the additive basketball contract, durable receipts and stable UI request IDs. C's current follow-up reruns those boundaries. The old overlay capture concerns legacy football `/tv`; it is distinct from B's new shared `/display` route. See [current acceptance](FOLLOWUP.md).

## Resolved integrated defect: player-call timestamp

C's real HTTP feature run twice observed `POST /calls` returning HTTP 500. The transaction validator rejected an “uncommitted player call”: its `createdAt` used a second wall-clock read, while the linked commitment's `acceptedAt` used the first. Crossing a millisecond made valid input fail the durable invariant. Frozen-clock tests had hidden this boundary.

The owner explicitly authorized C to apply the domain fix and regression test. The player call now uses the commitment's accepted timestamp. `server/test/room/player-calls.test.ts` advances time on every clock read and verifies acceptance, same-ID recovery, one call and one reserved hold. A standalone [reproducer](repro-player-call.mjs) failed before the fix and passed after it. Run `node --import tsx docs/qa/worker-c/repro-player-call.mjs` from the repository root. Failed pre-fix feature reports are retained separately from the corrected candidate's passing evidence.

## Open for B: final scoring animation obscures winner card

Candidate `14d8229` plus C follow-up fingerprint `dc2faf5e00ad083c302a1b5ab05945f7118cd566f135bf9cfcae173fd9d72a96`; JSON browser run `7968fe24-2443-4568-a814-4dc7a39f0880`, 2026-10-23. Run `npm run qa:browser -- --no-build` after building the candidate. Observe `/room/:code/display` at 1920×1080 when the genuine final arrives, before reloading. [First final screenshot](integrated-2026-10-23/screens/08-final-display.png).

Expected: the native final winner card remains readable during the final transition. Observed: the top Final / SUM 56 / HAR 57 strip is readable, but the last “2 POINTS” hoop animation and dimming layer obscure the winner card. This is the new native basketball route, distinct from the old football finding below. The actual final/standings API comparisons, restored phone result and browser assertions pass; those assertions do not measure pixel occlusion. B's prior final-confetti-only change does not prevent this last-score animation in the captured frame.

Ownership: B (`RoomDisplayPage`/celebration presentation). C leaves UI source unchanged and records a manual recording-review hold. Recheck the first final frame after B's fix; do not count a later clear frame as first-frame evidence. The current simulator screenshot and the phone's restored final remain useful acceptance artifacts, but do not close this issue.

## Historical findings before A/B integration

These observations are against C's main baseline plus C-only tooling. A/B's local implementations were not merged or evaluated. An unmerged capability is a prerequisite gap here, not a claim that A/B's implementation is defective.

## A: basketball contract and durable receipts

Reproduce from the repository root with Node >=22:

```sh
npm run qa:basketball
npm run qa:basketball -- --game football
```

Expected for basketball: explicit `harbor-vs-summit` basketball identity. Observed on main: creation returns a football room because this schema does not yet accept a game selector. C records blocked and stops; it never treats that room as basketball.

Expected for durable picks: response receipt identifies the request, lookup survives restart, same ID/payload returns the same receipt, conflicting payload returns 409, and a new ID cannot accept a closed question. Observed on main: the football service accepts a pick but provides no durable receipt; receipt-conflict and lost-response replay gates remain unrun. The existing lock boundary and final/season restart checks pass. Deliver the accepted additive contract and exact commit, then rerun C's adapter; field differences require an explicit adapter review.

## B: browser request IDs and final overlay

```sh
npm run qa:browser -- --game football
```

The current phone successfully joins, saves a lineup, makes a pick, restores its seat and renders final state. The full response-loss gate blocks because its pick body has no `requestId`. No request-ID claim is made from the visible “Your pick” text. Rerun against B's integrated candidate to validate receipt reconciliation.

Manual visual finding: in the captured 1920x1080 football final transition, the FIELD GOAL celebration dims/overlays the score strip and partially hides its central content. The play feed still contains the final score. See [the final transition screenshot](screens/football-final-transition.png). This is a baseline visual finding for B to assess against the accepted celebration/readability requirement; C did not change any effects/UI implementation. The automatic display check compares paused scores to API values and does not claim to measure every animated frame's occlusion.

Reproduction: start the connected two-phone scenario above, leave the shared display open through the last scoring play, and inspect the first final frame before the celebration clears. Capture the same candidate and viewport after any fix. The browser runner's screenshot is genuine connected state, not a fixture. No real microphone, speaker, TV or Echo device was used.
