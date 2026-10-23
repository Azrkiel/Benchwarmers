# Worker B -> Worker C delivery (integration candidate)

```text
Assignment: B (with A's commits merged; candidate for C's integration checkpoint)
Task IDs: P00.3, P05.1-P05.7, P06.1-P06.8, P07.1-P07.8, P08.1-P08.7, P10.6, P10.8, P11.5, P11.7, P13.4, P13.5, P15.3-P15.4; P14.2-P14.6 dropped by owner decision (simulated device only)
Base commit: bc00daa (origin/main)
Delivery commit/range: origin/feature/basketball-product, bc00daa..HEAD
  Includes A: d6a1098, fdfea9c, 72b648f, 77d16d0, fc66bf6, 1e96ec5 (merged, unchanged)
  Includes C: 3abb214 cherry-picked as a490a04 (unchanged)
Owned paths changed: web/**, server/src/room/{assistant,commands,mcp,playback}.ts, server/src/mcp/**, B tests, docs/qa/worker-b/**
New/changed contracts or exports: none in A's contract; MCP tools 22 -> 30 (room_ask, room_quote_commitment, room_commit_points, room_call_catalog, room_quote_call, room_create_call, room_pregame_reference, room_pregame_pick); room board widget ui://benchwarmers/room-board.html
Dependency/script request: none beyond C's Playwright 1.56.1 (already in a490a04; lockfile unchanged by B)
Checks run and observed outcomes: see below
Browser/provider/device evidence: docs/qa/worker-b/c-acceptance/ (C's runner reports + screenshots)
Known limits or external prerequisites: below
Next worker/milestone unblocked: C's Checkpoint 2/3 (M2 connected demo) on this candidate
```

## C's suites on this candidate (Windows 11, Node 22, Chromium 1208 headless shell via CHROMIUM_PATH)

| Command | Result | Report |
|---|---|---|
| `npm run test:integration-tools` | 12/12 pass | (console) |
| `npm run qa:basketball` | passed: startup, room-contract, join-lineup, authorization, voice-service, pause-restart, durable-receipts, lost-response-retry, request-id-conflict, lock-boundary, final-season-restart | `c-acceptance/basketball-accept.json` |
| `npm run qa:basketball -- --game football` | passed (same 11 checks) | `c-acceptance/football-accept.json` |
| `npm run qa:browser -- --selectors docs/qa/worker-b/selectors.json` | passed: host-ui, join-lineup-ui, pick-ui, typed-assistant-ui, disconnect-recovery-ui, multi-display-ui (960x480, 1280x800, 1920x1080), lost-response-ui, final-restart-ui, page-errors | `c-acceptance/basketball-browser.json` |

Your two B findings:

1. **Browser request IDs**: closed. `lost-response-ui` passes: the UI pick carries a stable `requestId`, the dropped response is reconciled through `GET /receipts/:requestId`, retries reuse the id (`07-reconciled-receipt.png`).
2. **Final overlay**: your capture was the legacy football `/room/:code/tv` page. The basketball shared screen is `/room/:code/display`, where celebrations never cover the score strip. On it the final celebration had dimmed the winner reveal for about 2 s, so it is now confetti only (no dim, label or status chip). See `08-final-display.png`, which shows score strip and winner fully readable on the first final frame.

## Request to C (your runner, exact)

My homepage opens the host form from a "Host a party" button, which the selector adapter cannot express. I ran your browser suite with this local, **uncommitted** 2-line change; please apply it (default keeps your behavior):

```diff
-  roomName: '#rm-room-name', create: 'button:text-is("Create room")',
+  hostOpen: '', roomName: '#rm-room-name', create: 'button:text-is("Create room")',
@@ browserScenario host-ui
       await phone.goto(server.base);
+      if (selectors.hostOpen) await click(phone, 'hostOpen');
       await phone.locator(selectors.roomName).fill('C connected browser');
```

B's selectors: `docs/qa/worker-b/selectors.json` (`displayPath` is `/room/{code}/display`). The browser report's source fingerprint includes that local change.

Also: docs still say 22 MCP tools (`docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md`, `docs/MCP_HOSTS.md`); it is 30.

## Limits

- Points, calls and pregame are gated off in the ordinary entry point (A's `enableCommitments` / `enablePregame`). They were browser-verified on rehearsal servers constructed with those flags and authored test probabilities (`docs/qa/worker-b/points/`, `docs/qa/worker-b/calls/`); C's suites above run the default (gated-off) build.
- One intermittent `500 INTERNAL` on `POST /calls` in a rehearsal run (not reproduced over HTTP or in-process); the client treats 5xx as unconfirmed and retries with the same id. A was asked to log the stack.
- Simulated device only: `/display/room/:code` uses real MCP (`tools/list`, `room_ask`); browser speech stands in for mic/speaker. No real microphone measurements, Echo or Alexa.
- The worktree's native `tsc.exe` was repeatedly removed on this machine (likely antivirus); type checks were confirmed by exit code after restoring it.
