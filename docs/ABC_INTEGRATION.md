# Combined A/B/C application

The combined checkout is `feature/basketball-backend`. It contains A's backend, B's product interface and C's tooling with their Git history preserved. This is a local integration; it does not publish or deploy the application.

## Included deliveries

| Delivery | Included commit | Integration |
|---|---|---|
| A: ingestion recovery, corrections, SQLite and session hardening | `191c389` | Native backend history |
| B: product branch tip | `ddfd304` | Merge `4ad914a` |
| C: integration branch tip | `d8680f6` | Merge `c49c1c5` |
| Shared market presentation contract | `cc1468b` | Keeps backend reference fields compatible with B's component |

Remote branches were fetched on October 23, 2026. Both B and C tips are ancestors of the combined branch; no delivery commit is missing. Historical worker reports describe their original candidates. Current combined verification is recorded below.

## Run the combined app

```sh
npm ci
npm run demo
```

Open `http://localhost:3001`, choose **Host a party**, then select basketball or football. Join from phones with the room code; open the shared display from the room. Basketball is the form default. The omitted `gameId` API default remains football for backward compatibility.

For C's isolated rehearsal, use `npm run demo:basketball` on port 3037 and follow [the operations guide](BASKETBALL_DEMO.md). This uses separate private data. Calls, commitments and pregame picks remain opt-in; no live feed is activated by these commands.

## Integration fixes

- C's browser runner now opens B's host panel, explicitly selects the requested sport and uses the combined display/receipt selectors by default. Its real API, sport identity, privacy, response-loss and final/restart assertions remain intact.
- C's local HTTP controller uses independent native HTTP sockets with the same ten-second deadline. A separate-thread regression reproduces `ECONNRESET` when a paused controller reuses a socket the server has expired. The fix avoids that reuse; it adds no retries and does not relax the zero-error or latency criteria. Transport tests also cover UTF-8 JSON, credential headers, status assertions and deadlines during both header and body stalls. Earlier controller stalls are retained as historical evidence; this does not claim a proven upstream Node defect.
- README and the demo banner now describe both sports, the combined display route and the actual 30-tool MCP surface.
- [The selector contract](qa/worker-c/SELECTORS.md) documents the current defaults and optional legacy-form overrides. A separate selector JSON is no longer needed for the combined interface.

## Verification

The previous host-form failure was reproduced before the fix. Afterward, the full connected browser workflow passed, including three independent browser contexts, three display sizes, reconnect recovery, lost-response receipt reconciliation and final-state recovery after restart. Final committed-candidate reports are recorded here after verification.

## External acceptance

Licensed provider access, real-game timing, continuous tracking, production topology and deployment remain outside this local integration. The current device target is the simulated smart display, as recorded in [B's device scope](qa/worker-b/DEVICE_AND_TRACKING.md); physical Echo/Alexa validation is excluded from that scope, and no real-device claim is made. See [backend status](BACKEND_COMPLETION.md) and [C's release criteria](qa/worker-c/RELEASE_GATES.md) for future service gates. Ordinary startup retains fictional scripted play and conservative feature defaults.
