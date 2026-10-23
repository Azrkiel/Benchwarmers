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
- C's child process explicitly selects JSON storage and rehearsal session mode. Inherited `ROOM_STORAGE`, `ROOM_SQLITE_FILE` or strict-session settings cannot redirect QA into another store or change the local test policy. A real-server regression verifies that an unrelated SQLite file is untouched while private JSON state, joining and lineup changes work normally. SQLite and secure-session behavior remain covered by A's dedicated tests.
- README and the demo banner now describe both sports, the combined display route and the actual 30-tool MCP surface.
- [The selector contract](qa/worker-c/SELECTORS.md) documents the current defaults and optional legacy-form overrides. A separate selector JSON is no longer needed for the combined interface.

## Verification

The final tested code candidate is `25ded6a5a72c7d422543c6dbd654f694fdd6ac83`, fingerprint `20f2104507ae9700089fee23fa890879cb1cd41358f4d10a005790ddcde3e81d`. The final evidence/documentation commit adds no application or tooling changes. Both remote delivery tips were fetched and checked again during verification; there were no missing newer B/C commits. B's web/assistant/command/MCP implementation and C's dependency manifest/lockfile are preserved.

| Check | Observed result |
|---|---|
| Server tests | 88 files / 991 passed |
| Web tests | 79 files / 604 passed |
| Integration tooling tests | 16 passed, including real-server configuration isolation and idle-socket regression |
| Type checks and assets | Server, widget and web checks passed; production assets built |
| Basketball service | Full authorization, lineup, MCP, receipt/retry, cutoff, final/season/restart acceptance passed |
| Basketball browser | Full host/join/pick/assistant, reconnect, three displays, lost-response receipt and final/restart checks passed |
| Football browser | The same complete connected workflow passed with explicit football selection |
| Backup/restore | JSON roundtrip, corruption rejection and overwrite refusal passed |
| Final load | 32 clients, 60 seconds, 1,920 reads, 128 real pick writes, zero errors; p95 200.66 ms against 500 ms |
| Repeated load | Two earlier consecutive runs after socket isolation also passed, p95 201.12 / 202.24 ms, zero errors |
| Legacy compatibility | Both scripted household game play-throughs passed |
| C's full local release gate | Passed all required checks, including exact-source candidate and rollback evidence |

Reports and selected screenshots are in [the evidence directory](qa/abc-integration-2026-10-23/). The final gate is [release.json](qa/abc-integration-2026-10-23/release.json); [basketball](qa/abc-integration-2026-10-23/browser.json) and [football](qa/abc-integration-2026-10-23/football-browser.json) browser reports record the same tested commit and fingerprint. The two repeated-load reports identify their earlier `6cc46b5` candidate separately. Failed pre-fix reports remain under `regressions/`; they are not current acceptance.

The host-form, idle-socket and inherited-configuration failures were observed before their fixes. No test was weakened, no request was silently retried, and no deadline or load budget was increased. Captured phone and shared-display layouts were inspected for both sports; automated checks cover overflow and API/display score agreement at 960×480, 1280×800 and 1920×1080. See the [phone](qa/abc-integration-2026-10-23/phone-pick.png), [compact display](qa/abc-integration-2026-10-23/shared-display-960.png) and [TV display](qa/abc-integration-2026-10-23/shared-display-1920.png).

Scoped correctness/security review checked sport identity, private credentials, unchanged service assertions, bounded deadlines through response bodies, socket ownership and rehearsal storage isolation. Cleanup reused the existing C server/report lifecycle and B selectors; no dependency was added. No unresolved integration finding remains in this local scripted candidate. Existing SQLite experimental and Vite chunk-size warnings remain. This local gate does not certify production capacity or deployment.

## External acceptance

Licensed provider access, real-game timing, continuous tracking, production topology and deployment remain outside this local integration. The current device target is the simulated smart display, as recorded in [B's device scope](qa/worker-b/DEVICE_AND_TRACKING.md); physical Echo/Alexa validation is excluded from that scope, and no real-device claim is made. See [backend status](BACKEND_COMPLETION.md) and [C's release criteria](qa/worker-c/RELEASE_GATES.md) for future service gates. Ordinary startup retains fictional scripted play and conservative feature defaults.
