# Findings for A/B

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
