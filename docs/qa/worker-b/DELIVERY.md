# Worker B delivery 1: product UI, shared display, voice, MCP

Date: 2026-10-23. Branch `feature/basketball-product`, worktree `C:/Users/jiang/Benchwarmers-basketball-product`.
Base `bc00daa` (origin/main). Merged Worker A checkpoint `d6a1098` (football adapter + additive contract) at `ba5236f`.
Commit range: `bc00daa..b115a59` (pushed to `origin/feature/basketball-product`).

This is a delivery of B's surfaces against A's first checkpoint. **Basketball rooms are not connected yet**: A has not registered the basketball adapter, so every basketball screen shown here uses the labeled fixture (`?fixture=`) or a football room. The connected basketball scenario is still owed after A's next delivery.

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
| P06.8 | Done | Simulator preset "Compact 960x480 (Show 5 target)"; still labeled "Simulated smart display". |
| P07.1-P07.3 | Done | `server/src/room/commands.ts` typed commands; actor binding; sport-aware MCP descriptions; new `room_ask` tool (tool count 22 -> 23). |
| P07.5-P07.8 | Done (lease route pending A) | Spoken replies to spoken requests; mic cancels speech; captions; browser-limit messages; `useRoomAnnouncements`; `server/src/room/playback.ts` lease + router. |
| P08.1 | Done | Via P00.3. |
| P08.2-P08.6 | Done | SVG ball/hoop/confetti, unseen-score-event trigger, bounded queue, synthesized sound with explicit enable/mute/volume, reduced-motion banner. |
| P08.7 | Done | Winner/tied winners first; Season after 6 s (host earlier); reload quiet. |
| P10.6, P10.8, P11.5, P11.7, P13.4, P13.5 | Not started | Waiting for A's ledger/quote/call/market services (brief: B5 after A publishes). |
| P14.2-P14.6, P15.3-P15.4 | Not started | No physical device or Alexa developer access on this machine. |

## Owned paths changed

`web/src/home/*`, `web/src/room/*` (new: `RoomDisplay*`, `RoomNav`, `RoomStandings`, `RoomResults`, `BasketballCourt`, `PredictionReceipt`, `DisplayVoice`, `useRoomAnnouncements`, `sport.ts`, `fixtures/basketball.ts`, `display.css`), `web/src/fx/*` (new: `celebrations.ts`, `BasketballCelebration.tsx`, `basketball.css`, `audio.ts`, `AudioControls.tsx`, `playbackLease.ts`), `web/src/display/*`, `web/src/App.tsx`, `web/src/shell/RouteStatus.tsx`, `web/public/audio/ATTRIBUTION.md`; server `server/src/room/{assistant,commands,mcp,playback}.ts`, `server/src/mcp/{server,widgetHtml}.ts`, `server/src/mcp/widget/src/*`; tests under `web/src/**` and `server/test/room/{basketball-assistant,playback,mcp}.test.ts`, `server/test/mcp/{room-board,http}.test.ts`.

No root scripts, manifests, lockfile, deployment config, or A-owned files were edited (the `d6a1098` merge brings A's own files unchanged).

## Requests

**To Worker A (exact):**
1. Register the playback router in `routes.ts`: `router.use('/:code/playback', createPlaybackRouter(leases, (code, token) => /* true iff token is this room's host credential */))` with one shared `new PlaybackLeases()`. A read-only host check on `RoomStore` (e.g. `isHost(code, token): boolean`) is needed for the takeover path. Until then the client labels sound "This browser only".
2. Keep `receipt` on the pick response (`RoomSnapshot.receipt`, as in your in-progress types); the client already reads it.
3. Basketball `recentPlays` kinds `score` / `final` drive celebrations and announcements; please keep those names.
4. `projectedPoints` on `RoomPlayer` (your in-progress name) is what the lineup sorts by.

**To Worker C:** `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md`, `docs/MCP_HOSTS.md` still say 22 tools; it is 23 after `room_ask`. No dependency or script request.

## Commands and observed results (latest run)

- `npx vitest run --root web`: 566 passed.
- `npx vitest run --root server --maxWorkers=6`: 45 files, 780 passed.
- `npm run typecheck` (server, widget, web): passed. `npm run build:widget -w server`: passed.
- Chromium (Playwright, headless): homepage 5 viewports; display 6 fixture states x 960x480 / 1280x800 / 1920x1080; live football room display + Escape focus; phone 360x800 join -> auto-lineup -> live pick "✓ Touchdown accepted", no horizontal overflow; celebration timed frames (score already updated at overlay mount, ball reaches rim ~1.1 s, label ~1.1-2.0 s, removed by ~2.2 s; reduced motion 1.4 s static banner; focus unchanged; pointer-events none).

## Source and limits

- Fixture mode is dev-only and shows a "Fixture" badge. Fixture captures prove layout, not a connected game.
- No real microphone, speaker, Echo device, or Alexa console was used. Speech tests use fake recognizers/synthesis; they prove command behavior only.
- Sound is synthesized (Web Audio); no licensed assets.
- Accessibility checks done: keyboard tab/arrow/Escape paths, focus restore, reduced motion, captions independent of sound, 44 px targets on new controls. Not done: screen reader pass, 200% zoom pass on the display.
