# Worker B delivery 1: product UI, shared display, voice, MCP

Date: 2026-10-23. Branch `feature/basketball-product`, worktree `C:/Users/jiang/Benchwarmers-basketball-product`.
Base `bc00daa` (origin/main). Merged Worker A checkpoint `d6a1098` (football adapter + additive contract) at `ba5236f`.
Commit range: `bc00daa..HEAD` of `feature/basketball-product` (pushed to `origin/feature/basketball-product`).

Update (same day): A's `fdfea9c` (playable basketball replay + durable receipts) is merged at `32190ea`, and the connected basketball scenario below now runs against a real `harbor-vs-summit` room. Earlier captures in this folder that show a "Fixture" badge remain layout evidence only.

## Connected basketball scenario (real room, no fixtures)

Script: `docs/qa/worker-b/connected/connected-qa.cjs` (Playwright, headless Chromium; dev server `PORT=3011 AI_MODE=fallback ASSISTANT_MODE=offline`, Vite on 5211). Observed run, room `D15736`:

1. Homepage -> Host a party (basketball preselected) -> room created with `gameId=harbor-vs-summit`.
2. Maya (390x844) joins and builds a manual lineup (captain + 4 flex, $41,500 / $50,000) and saves it; Leo joins from the homepage join form (name carried over) and auto-picks.
3. Shared display at 960x480 shows the lobby join code/QR, then live play.
4. Host starts at 4x from the phone's host controls.
5. Three calls answered on both phones; all six showed server receipts, e.g. "✓ Harbor Hawks accepted at 4:07:01 AM" (`c3-maya-pick-0.png`).
6. Display celebrated baskets with captions ("Two for the Hawks.", `c4-display-celebration-0.png`); 17 distinct celebration states observed over the game.
7. Final: API `SUM 56 HAR 57 phase final`; display score strip matches; display shows the winner (Leo, 84.4) before season standings (`c5-display-final.png`); Maya's phone moved to the Results tab (`c6-maya-final.png`).
8. No page errors on any of the three pages.

Not covered by this run: a spoken command through a real microphone, restart mid-question, 32 clients. Note for C: all QA rooms default to season `demo-season`, so repeated runs add same-named participants to that season (A's identity rules, not a UI defect).

## Task status

| Task | Status | Evidence |
|---|---|---|
| P00.3 | Done | Motion patch from `design/play-motion` applied cleanly onto `bc00daa` (`9f68e1a`); `fly.toml` and plan docs left in the original checkout. Web 503 tests passed at that point. |
| P05.1 | Done | One hero, Host/Join panels, HomeNav (Play / How it works / Season). No scroll at 960x480 and 1280x800; on 390x844 the primary submit stays above the fold. `home-host-960x480.png`, `home-join-390x844.png`. |
| P05.2 | Done (gated) | Host form sends `gameId=harbor-vs-summit`; football omits it. `GAME_NOT_SUPPORTED` shows "Basketball isn't available on this server yet"; an older server that silently makes football is reported, not followed. |
| P05.3 | Done | Team/position filters, stable sort (projected points when `projectedPoints` exists, salary, name), captain cost, remaining cap, draft kept across views. |
| P05.4 | Done (client) | `usePickReceipt`: requestId per pick, reused on retry; accepted only when the response shows that pick (or A's `receipt`); `PICKS_LOCKED` -> "Not accepted before closing"; lost response -> refetch before retry. Server receipt lookup endpoint is A's Phase 04. |
| P05.5 | Done | Phone tabs Game / My lineup / Standings / Results; phase-driven default; `?view=season`. |
| P05.6 | Existing + kept | Saved seat restore, explicit rejoin on 401; no tokens in URLs or screens (tests assert). |
| P05.7 | Done | Invalid code -> `/?join=CODE` keeps the code; over-cap keeps selection; failed save keeps lineup; stale snapshot notice. |
| P06.1-P06.4, P06.6, P06.7 | Done | `/room/:code/display` compact/medium/tv; RoomNav; BasketballCourt; RoomStandings pagination (32 reachable); `toDisplayModel` strips private fields; arrows/Escape/Backspace. 6 fixture states x 3 sizes, no document scroll or clipped view content. |
| P06.5 / P07.4 | Done (MCP side) | `ui://benchwarmers/room-board.html` (same single-file bundle, room mode by result shape); `room_status`/`room_ask` carry `_meta.ui`. The household `/display/:household` simulator still renders household boards only; a room mode inside that simulator was not built (the native `/room/:code/display` covers the compact room screen). |
| P06.8 | Done | Simulator preset "Compact 960x480 (Show 5 target)" on both simulators (household and room); still labeled "Simulated smart display". |
| P07.1-P07.3 | Done | `server/src/room/commands.ts` typed commands; actor binding; sport-aware MCP descriptions; new `room_ask` tool (tool count 22 -> 23). |
| P07.5-P07.8 | Done (lease route pending A) | Spoken replies to spoken requests; mic cancels speech; captions; browser-limit messages; `useRoomAnnouncements`; `server/src/room/playback.ts` lease + router. |
| P08.1 | Done | Via P00.3. |
| P08.2-P08.6 | Done | SVG ball/hoop/confetti, unseen-score-event trigger, bounded queue, synthesized sound with explicit enable/mute/volume, reduced-motion banner. |
| P08.7 | Done | Winner/tied winners first; Season after 6 s (host earlier); reload quiet. |
| P10.6, P10.8 | Connected (points rooms) | Merged A's `77d16d0`; UI/voice/MCP use A's service. Browser run on a points-enabled rehearsal server (authored test probabilities, outside the repo): phone commit 25 on Harbor Hawks -> won (+30); simulator voice 'put 10 points on Two' -> offer read with stake/return/max loss, plain 'yes' ignored, 'confirm' committed -> lost (-10); settled net +20, bank 132.5, public snapshot has no bank. Script/captures `docs/qa/worker-b/points/`. Points stay off by default (A's gate). |
| P11.5, P11.7, P13.4, P13.5 | Connected (gated rooms) | Merged A's `fc66bf6` (calls) and `1e96ec5` (pregame). Browser run on a rehearsal server with commitments + pregame on (`docs/qa/worker-b/calls/`): lobby winner pick 'HAR' recorded, 'No market reference: these are fictional teams'; composer filled from 'Hawks score next, 25 points', featured deadline first, offer reviewed, call created; phone shows 'Your call' + Player calls; shared screen has a Calls tab and caption; public snapshot has the call with accepted counts and no bank/quote data. One intermittent `POST /calls` 500 seen (request to A below). Previously dormant status: | Screens and tests done against the plan's contracts (`CommitPoints`, `BankPanel`, `CreateCall`, `Calls`, `PregamePick`); hidden until the snapshot carries the fields. Exact field/route requests: `CONTRACT_REQUESTS.md`. Dev preview `/preview/points`. Voice commitment phrases parse to commit commands that refuse without mutating until A's P10.7 service exists. Not connected: A's services do not exist yet. |
| P14.2-P14.6 | Dropped (owner decision) | No Alexa and no physical device: the simulated experience is the device story. Replaced by the room smart-display simulator `/display/room/:code` (real MCP `tools/list` + `room_ask`, presets incl. 960x480, explicit Speaking-as). See `DEVICE_AND_TRACKING.md`. |
| P15.3-P15.4 | Done (prototype + assessment) | Bounded ball tracking in `BasketballCourt`; benefit assessment in `DEVICE_AND_TRACKING.md`. |

## Owned paths changed

`web/src/home/*`, `web/src/room/*` (new: `RoomDisplay*`, `RoomNav`, `RoomStandings`, `RoomResults`, `BasketballCourt`, `PredictionReceipt`, `DisplayVoice`, `useRoomAnnouncements`, `sport.ts`, `fixtures/basketball.ts`, `display.css`), `web/src/fx/*` (new: `celebrations.ts`, `BasketballCelebration.tsx`, `basketball.css`, `audio.ts`, `AudioControls.tsx`, `playbackLease.ts`), `web/src/display/*`, `web/src/App.tsx`, `web/src/shell/RouteStatus.tsx`, `web/public/audio/ATTRIBUTION.md`; server `server/src/room/{assistant,commands,mcp,playback}.ts`, `server/src/mcp/{server,widgetHtml}.ts`, `server/src/mcp/widget/src/*`; tests under `web/src/**` and `server/test/room/{basketball-assistant,playback,mcp}.test.ts`, `server/test/mcp/{room-board,http}.test.ts`.

No root scripts, manifests, lockfile, deployment config, or A-owned files were edited (the `d6a1098` merge brings A's own files unchanged).

## Requests

**To Worker A (exact):**
1. Done by A (`72b648f`). The takeover race A found in `playbackLease.ts` is fixed in `df6acc1` (two-browser check passes). Original request: register the playback router in `routes.ts`: `router.use('/:code/playback', createPlaybackRouter(leases, (code, token) => /* true iff token is this room's host credential */))` with one shared `new PlaybackLeases()`. A read-only host check on `RoomStore` (e.g. `isHost(code, token): boolean`) is needed for the takeover path. Until then the client labels sound "This browser only".
2. Done on your side (`fdfea9c`): the phone uses `receipt` and `GET /receipts/:requestId`; voice and `room_predict` send stable request ids (derived when a client omits one).
3. Basketball `recentPlays` kinds `score` / `final` drive celebrations and announcements; please keep those names.
4. `projectedPoints` on `RoomPlayer` (your in-progress name) is what the lineup sorts by.

**To Worker A (new):** an intermittent `500 INTERNAL` on `POST /api/rooms/:code/calls` was seen once in four browser runs (not reproducible over plain HTTP or in-process). `routes.ts` logs only '[room] request failed', so please log the error/stack server-side to diagnose. The client now treats any 5xx as unconfirmed and retries with the same request id.

**To Worker C:** `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md`, `docs/MCP_HOSTS.md` still say 22 tools; it is 30 now (adds `room_ask`, commitment, call and pregame tools). No dependency or script request.

## Commands and observed results (latest run)

- `npx vitest run --root web`: 598 passed.
- Server after A's points merge: 61 files, 861 passed (maxWorkers=6).
- `npx vitest run --root server --maxWorkers=6`: 52 files, 831 passed (includes A's basketball suites).
- `npm run typecheck` (server, widget, web): passed. `npm run build:widget -w server`: passed.
- Chromium (Playwright, headless): homepage 5 viewports; display 6 fixture states x 960x480 / 1280x800 / 1920x1080; live football room display + Escape focus; phone 360x800 join -> auto-lineup -> live pick "✓ Touchdown accepted", no horizontal overflow; celebration timed frames (score already updated at overlay mount, ball reaches rim ~1.1 s, label ~1.1-2.0 s, removed by ~2.2 s; reduced motion 1.4 s static banner; focus unchanged; pointer-events none).

## Simulated smart display (room)

`docs/qa/worker-b/connected/sim-qa.cjs` against a real basketball room: `tools/list` -> 23 tools; guest "What's the score?"; host "start the game" via `room_ask`; seat pick "Harbor Hawks accepted" confirmed by the server's `me.currentPick`; trace contains no credentials; no page errors. Captures: `sim-compact-pick.png`, `sim-large.png`, `sim-celebrate.png`.

## Source and limits

- Fixture mode is dev-only and shows a "Fixture" badge. Fixture captures prove layout, not a connected game.
- No real microphone, speaker, Echo device, or Alexa console was used. Speech tests use fake recognizers/synthesis; they prove command behavior only.
- Sound is synthesized (Web Audio); no licensed assets.
- Accessibility checks done: keyboard tab/arrow/Escape paths, focus restore, reduced motion, captions independent of sound, 44 px targets on new controls. Not done: screen reader pass, 200% zoom pass on the display.
