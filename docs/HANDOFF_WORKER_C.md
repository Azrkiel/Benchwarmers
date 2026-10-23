# Handoff to Worker C: integrated basketball candidate

Date: 2026-10-23, ~09:00 EDT. From: Worker B (Claude), with Worker A's committed backend merged.
Branch: **`feature/basketball-integration`**. It now contains your tooling commit `3abb214` plus the full A+B candidate. Nothing was merged to `dev` or `main`, and nothing was deployed.

Read first: this file, then [docs/qa/worker-b/C_DELIVERY.md](qa/worker-b/C_DELIVERY.md) (B's delivery in your format) and [docs/qa/worker-b/DELIVERY.md](qa/worker-b/DELIVERY.md) (B's per-task table and evidence index). Plans: `docs/plans/2026-10-23-basketball-vision-implementation.md` (master, if present in your checkout) and your `docs/plans/2026-10-23-worker-c-integration.md`.

## 1. What is on this branch

| Source | Commits | What it adds |
|---|---|---|
| Worker A (backend) | `d6a1098`, `fdfea9c`, `72b648f`, `77d16d0`, `fc66bf6`, `1e96ec5` | Football adapter + additive contract and durable state; playable `harbor-vs-summit` basketball replay with durable pick receipts; playback-lease route; gated points ledger/quotes/settlement; gated player calls; gated pregame winner picks. Docs: `docs/BACKEND_CONTRACT.md`, `docs/BASKETBALL_BACKEND.md`, `docs/PLAYBACK_INTEGRATION.md`, `docs/POINTS_BACKEND.md`, `docs/PLAYER_CALLS_BACKEND.md`, `docs/PREGAME_BACKEND.md`, `docs/LIVE_BASKETBALL.md` |
| Worker B (product) | `9f68e1a`..`6640bc9` | Homepage + nav, phone views/receipts, shared display `/room/:code/display`, simulated smart display `/display/room/:code`, celebrations + sound, typed voice commands, MCP tools (30), points/calls/pregame UI |
| Worker C (you) | `3abb214` (also present as cherry-pick `a490a04`; identical content) | Your scripts, docs and evidence |

A's in-progress, **uncommitted** work (live ingestion, more points changes) is only in A's local worktree and is not on this branch.

## 2. Observed results on this candidate (B ran your suites, Windows 11, Node 22)

| Command | Result |
|---|---|
| `npm run test:integration-tools` | 12/12 pass |
| `npm run qa:basketball` | passed (all 11 checks: room-contract, join-lineup, authorization, voice-service, pause-restart, durable-receipts, lost-response-retry, request-id-conflict, lock-boundary, final-season-restart, startup) |
| `npm run qa:basketball -- --game football` | passed (same 11) |
| `npm run qa:browser -- --selectors docs/qa/worker-b/selectors.json` | passed 10/10, **with the one-step runner change in section 3** applied locally |
| `npm run typecheck` | exit 0 |
| `npm test -w web` | 604 passed |
| `npm test -w server -- --maxWorkers=6` | 895 passed (one earlier run had three 10 s timeouts under machine load; they passed on rerun and alone) |
| `npm run build` | passes; existing Vite >500 kB chunk advisory |

Reports and screenshots: `docs/qa/worker-b/c-acceptance/`. These are B's observations; please rerun in your environment and record your own.

## 3. Action needed in your runner (you own `scripts/basketball/browser.mjs`)

The homepage opens the host form only after clicking **Host a party**. Your selector adapter cannot express that click, so `qa:browser` fails at `host-ui` until you add this optional step (default `''` keeps your current behavior):

```diff
 export const defaultSelectors = {
-  roomName: '#rm-room-name', create: 'button:text-is("Create room")',
+  hostOpen: '', roomName: '#rm-room-name', create: 'button:text-is("Create room")',
@@ host-ui
       await phone.goto(server.base);
+      if (selectors.hostOpen) await click(phone, 'hostOpen');
       await phone.locator(selectors.roomName).fill('C connected browser');
```

Then run: `npm run qa:browser -- --selectors docs/qa/worker-b/selectors.json`. On Windows, set `CHROMIUM_PATH` to a local Chromium; on Linux your `/usr/bin/chromium` default works.

B's selectors map to the real UI (`displayPath` = `/room/{code}/display`, receipts in `.rm-receipt`, display scores in `.rd-team.is-home|is-away .rd-team-score`).

## 4. Product facts that change your docs and demo script

- **Device story is simulation only (owner decision, 2026-10-23).** There is no Alexa connection and no physical Echo. P14.2-P14.6 were dropped. The simulated smart display is `/display/room/:code`, with presets Compact 960x480 (default), Small 1280x800 and Large 1920x1080, plus `?clean=1` for recording. Its talk bar sends real MCP calls (`tools/list`, then `tools/call room_ask`) and shows them in an "MCP calls" panel. Browser speech stands in for mic and speaker; do not claim a real device or skill.
- **MCP tools: 30** (was 22). New: `room_ask`, `room_quote_commitment`, `room_commit_points`, `room_call_catalog`, `room_quote_call`, `room_create_call`, `room_pregame_reference`, `room_pregame_pick`. Room board widget: `ui://benchwarmers/room-board.html`. `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md` and `docs/MCP_HOSTS.md` still say 22.
- **Primary journey:** homepage -> Host a party (basketball preselected) -> phones join with code/QR -> My lineup -> host starts -> phones answer calls (server receipts) -> shared screen `/room/:code/display` celebrates baskets and announces -> winner first, then Season.
- **Gated features:** points commitments, player calls and pregame winner picks are **off** in the ordinary entry point (A's `RoomStore` flags `enableCommitments` / `enablePregame`; pricing also needs authored probabilities). B verified them only on rehearsal servers built with those flags (`docs/qa/worker-b/points/`, `docs/qa/worker-b/calls/`, scripts included). Whether to enable them for the demo is an owner/C decision; enabling needs a change in `server/src/index.ts` (A-owned).
- **Fixture mode** (`?fixture=...` on the display, `/preview/points`) is dev-only and labeled; it is not connected-game evidence.

## 5. Suggested next steps for C (your Phase 09 / checkpoints)

1. Apply the section 3 runner change and rerun all suites on this branch; record results in `docs/qa/worker-c/RESULTS.md`.
2. Update tool counts and the primary journey in `README.md`, `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md` and `docs/BASKETBALL_DEMO.md`. Use the simulator wording in section 4.
3. Decide with the owner whether the demo enables points/calls/pregame. If yes, ask A to flip the flags (and supply authored probabilities) in `server/src/index.ts`, then add a connected acceptance for them.
4. Open the PR(s) toward `dev` when your gate passes. B and A have not opened any.
5. Optional evidence: a simulator run (`/display/room/:code`) for the Alexa+ simulated-path story. B's script is `docs/qa/worker-b/connected/sim-qa.cjs`.

## 6. Known issues / requests

- **To A:** an intermittent `500 INTERNAL` on `POST /api/rooms/:code/calls` was seen once in rehearsal and not reproduced; `routes.ts` logs no stack. The client retries 5xx with the same request id.
- On the B Windows machine, the native `tsc.exe` was repeatedly removed (likely antivirus). Not a repository issue.
- The legacy football TV `/room/:code/tv` still has the older play banner that can overlap its scorebug (your finding). The basketball shared screen is `/room/:code/display`, which does not.

## 7. Where things live

- B evidence and notes: `docs/qa/worker-b/` (`DELIVERY.md`, `C_DELIVERY.md`, `CONTRACT_REQUESTS.md`, `DEVICE_AND_TRACKING.md`, `selectors.json`, `connected/`, `points/`, `calls/`, `c-acceptance/`).
- B session handoff: `.claude/handoffs/2026-10-23-worker-b.md`.
- Key B code: `web/src/home/`, `web/src/room/` (`RoomPage`, `RoomDisplay*`, `RoomSimulatorPage`, `CommitPoints`, `CreateCall`, `PregamePick`), `web/src/fx/` (celebrations, audio, lease), `server/src/room/{commands,assistant,mcp,playback}.ts`, `server/src/mcp/widget/src/roomBoard.ts`.
