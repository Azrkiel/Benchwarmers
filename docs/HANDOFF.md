# Handoff — Benchwarmers (resume here)

## 0. Session 4 (2026-10-22) — everything merged onto `dev`
- Merged `feature/tv-football` (Codex: football field + pick bonuses on the original TV) and Codex's **uncommitted** redesign from `C:/Users/jiang/Benchwarmers` (`design/tv-broadcast`, snapshotted as branch `codex/wip-snapshot` without touching that working tree).
- **Two UIs, original is default** (user prefers it): `/tv/:code` = original TV (`web/src/tv`). `/tv2/:code` = Codex scorebook redesign (`web/src/tv-broadcast`). Also from Codex: `/welcome`, `/lounge/:code`, `/watch/:code` (YouTube embed + overlay preview), `/control/:code` (dev controller), `web/src/overlay` (shared CrewOverlay), `extension/` (MV3 overlay on real youtube.com; `npm run build:extension`, load `extension/dist` unpacked; backend fixed at 127.0.0.1:3001; run `npm run dev:overlay -w server`).
- TV pages are lazy route chunks (both `tv.css` files share class names); the scorebook palette/font is scoped to `html.theme-scorebook` via `useScorebookTheme()`, so device/voice-lab/original TV keep their look.
- Fix: Vite COOP/COEP headers (voice ID) blocked the `/watch` YouTube iframe (`ERR_BLOCKED_BY_RESPONSE`). Headers are now per-request via a small Vite plugin and skipped for `/watch*`; `/device` and `/voice-lab` still report `crossOriginIsolated=true`.
- Verified live: server 673/673, web 389/389, typecheck server/web/extension, `vite build`; REST + MCP (11 tools, <500 ms, 401 without bearer) + offline assistant + basketball and football replays + web proxy; Playwright Chromium screenshots of every route; extension on real youtube.com (drafts → Roster, picks → counts, native fullscreen, video playing).
- **Codex's clone is still dirty on its old base.** To continue there: commit/discard locally, then `git fetch && git checkout dev && git reset --hard origin/dev`. Its TV work now lives in `web/src/tv-broadcast` (edit there, not `web/src/tv`).
- **Lounge look everywhere (later on 2026-10-22, user request):** the Lounge (design B) palette, DM Sans / DM Serif Display type, and bench-stool logo are now app-wide. Shared tokens + `@font-face` in `web/src/brand/brand.css` (`--lg-*` on `:root`), logo in `web/src/brand/Brand.tsx` (`BenchMark`, `BrandLockup`). New Lounge-style home (`web/src/home/`). Original TV, device pages, voice lab, MCP widget, scorebook TV/watch/control/welcome, and the YouTube overlay were re-skinned (layouts unchanged). Household colors in seed + fixtures are now Lounge orange `#EDA77B` (Garcias) and lavender `#B9B3E3` (Sam's Place); old `server/data/*.json` stores keep the old colors until deleted.

## 1. Metadata
- Written: 2026-10-20 18:05 ET, end of Claude Code session 1; updated in session 2 after waves A–D (4a, 7b, 2b, 4b, 6 merged); updated 2026-10-21 in session 3 after Phase 8 (8a, 8b, 8c merged). Lead model: Claude Opus 5.5 (orchestrator); phase managers opus/sonnet, workers via model-router.
- Repo: https://github.com/Azrkiel/Benchwarmers (public, MIT). Working branch: **`dev`** (all merged work). `main` = dev as of PR #2 (phase 6); Phase 8 is on `dev` only until the next PR.
- Spec: `plan.md` (now marked up with ✅/🟡/⬜ status per phase). Orchestration + file ownership: `docs/ORCHESTRATION.md`.
- Deadline: **Fri 2026-10-23 12:00 PM PT; submit by 10:00 AM PT** (Devpost "Build, Ship, Shape", Alexa+ track + AWS Builder mini).

## 2. Current task
Build the whole Benchwarmers hackathon project from `plan.md`: an Alexa+ add-on (one-night fantasy draft + live pick'em by voice) =
self-hosted MCP server (2025-11-25, Streamable HTTP) + MCP App widget + Bedrock content + simulated Alexa+ device + big-screen TV view,
plus the user's extra ask: **pure voice recognition (voice ID) so people don't have to say "I'm Maya"**.
User's latest direction (2026-10-20 evening): **Claude works on the backend; Codex works on the TV view/frontend** (user will compare).

## 3. Reproducible state
- `dev` and `main` pushed; `main` updated via PR #1 (and PR #2 for phase 6). Gemini commits (from `feature/gemini-provider`, worktree `C:/Users/jiang/Benchwarmers-gemini`) are published. Codex's TV redesign (`design/tv-broadcast` in `C:/Users/jiang/Benchwarmers`) is NOT merged — uncommitted there. Phase branches pushed: `phase/1-engine`, `phase/2-mcp`, `phase/3-ai`,
  `phase/5-tv`, `phase/5b-tv-polish`, `phase/7-voiceid`, `phase/7b-voiceid-tuning`, `phase/4a-assistant`, `phase/2b-mcp-hosts`, `phase/4b-device`, `phase/6-polish` (all merged into dev).
- Uncommitted: none after this commit. Phase worktrees under `%LOCALAPPDATA%\Temp\bw-lanes\` were removed after merge.
- Running: nothing of ours. **Port 5173 is in use by Codex's separate clone** (`C:\Users\jiang\Benchwarmers`, `vite --host 127.0.0.1`) — don't kill it; use another web port (e.g. `npx vite --port 5175`).
- Resume commands (Git Bash):
  ```bash
  cd ~/Downloads/xvant/Benchwarmers && git checkout dev && git pull && npm ci
  npm run typecheck && npm test          # expect: server 672 passed, web 278 passed (vitest maxWorkers 6; ~1-in-10 Avast loopback stall remains; re-run)
  npm run play -w server                 # full scripted party → standings table, "Benchwarmer of the night: Big Mo"
  npm run play -w server -- --game riverton-vs-ironwood   # football: IRN 20 – RIV 24, "Benchwarmer of the night: Plow"
  cd server && PORT=3001 SPEED=4 npx tsx src/index.ts   # REST /api, MCP /mcp (Bearer dev-token-change-me), /healthz
  ```
- Seed/test data: crew `sunday-crew`; households `garcias` (Austin: maya, leo) and `sams-place` (Seattle: sam, priya); party `DEMO` (drafting).
  `POST /api/parties/DEMO/reset` restores DEMO + season stats to seed. `DATA_FILE` is resolved against cwd (default `data/store.json`).
- Env (`.env.example`): `PORT, SPEED, MCP_TOKEN, DATA_FILE, AI_MODE=fallback|bedrock, AWS_REGION, BEDROCK_MODEL_ID, ASSISTANT_MODE=offline|bedrock, ALLOWED_HOSTS`.

## 4. Completed this session (honest status)
| Item | Status |
|---|---|
| Phase 0: scaffold (npm workspaces server/web), contract `server/src/shared/types.ts`, CLAUDE.md, .env.example, friction log | tested (typecheck) |
| Phase 1: engine (clock, prop lifecycle, 3 resolvers, streaks, draft + auto-fill, fantasy scoring, standings/tiebreaks, season), JSON store implementing `AiSink`, 60-event game, 8 fallback props, seed, REST, play script | tested (92 tests) + manually verified (live server smoke, SPEED=80 full party) |
| Phase 3: Bedrock Converse wrapper (zod, 1 retry, token log), fallback + Bedrock providers, prop validation, guardrails, background worker, scouting.json, docs/AWS.md | tested with mocked Bedrock (71 tests); fallback path manually verified; **never called real Bedrock** |
| Lead integration: AI worker started in `index.ts main()`, scouting notes warmed at startup | manually verified (recap, explanations, scouting notes appear in state) |
| Phase 5: TV view `/tv/:code` (draft/live/rosters/final, FLIP, pops, kiosk, fixtures, `/tv/latest`) + 5b polish (locked-prop card, pops over court) | tested (83 web tests) + manually verified against real server (headless screenshots) |
| Phase 2: MCP server — 11 tools (`setup_watch_party, join_watch_party, start_watch_party, get_game_status, explain_last_result, get_my_roster` + UI tools `draft_player, list_available_players, get_leaderboard, get_season_standings, make_pick`), prompt `watch_party_host`, resource `benchwarmers://rules`, bearer auth, fuzzy matcher, MCP App widget (single-file 246 kB HTML) | tested (210 new tests incl. Checkpoint-2 flow, latency <500 ms, protocol 2025-11-25) + curl-verified 401/initialize; **widget never opened in a real MCP host** |
| Phase 7 (user's add): voice ID — 16 kHz capture, WavLM x-vector in a worker (transformers.js) + MFCC fallback, enrollment, matching, `useVoiceId`, `useUtteranceCapture`, `EnrollPanel`, `/voice-lab`, docs/VOICE_ID.md | tested (94 web tests) + real-model run in headless Chrome with TTS voices (separates speakers); **not tried with a real mic / real people** |
| Phase 4a (session 2): `POST /api/assistant` — MCP client to own /mcp, offline router (all plan §8 utterances), Bedrock Converse tool loop ≤3 rounds, fallback to offline (no repeat of state-changing calls) | tested (105 tests, mocked Bedrock) + live curl on :3015 verified by lead |
| Phase 7b (session 2): voice ID tuning — threshold 0.70/margin 0.05, 3 s crop, COOP/COEP threaded WASM, instant MFCC guess (`engine`, `provisional` on IdentifyOutcome) | tested (188 web) + real-model run re-run by lead: own-speaker ≥0.80, 2.1 s/clip |
| Phase 2b (session 2): MCP Inspector (11 tools, Checkpoint 2 via CLI), ext-apps basic-host screenshots (3 tabs × 800/1280 px), cloudflared tunnel initialize → 2025-11-25; season-row fix | manually verified (docs/MCP_HOSTS.md, docs/img/) |
| Phase 4b (session 2): device page `/device/:household` (speech in/out, typed, trace, app-bridge widget in srcdoc sandbox + fallback card, voice ID + screen speaker picker) | tested (86 web tests) + Checkpoint 4 headless (`tools/device-sync.mjs`): sync 0.98 s, season after restart; **real mic / Web Speech / live voice ID untested** |
| plan.md marked up with status | written |
| Phase 8 (session 3): lead contract `195c5ac` (sport, football positions/stats, drive state, `driveResult` resolver, `PropOdds`, `Pick.gameT`, `PickScore`, bonus constants) | typecheck + all tests green |
| 8a: `tools/odds/build_drive_odds.py` (stdlib; nflverse 2015–2025, 64,085 drives) → `server/src/game/odds/drive_odds.json` (17 buckets; two-minute 1–40 merged), `getOdds`/`driveOddsProp` | tested (15 tests) + script run, sanity checks pass |
| 8b: `scorePick` (streak × odds × speed × contrarian, cap ×5, roundHalf), `picks[].score`, `lastPickScore`, same-option re-pick keeps gameT, bonus copy in MCP text/rules/recap | tested + live: Leo lone+early call 19 pts |
| 8c: football game `riverton-vs-ironwood` (12 drives, 8 drive props ff-1..ff-8 with odds, built by `server/scripts/build-football-props.ts`), football engine/clock/statLine, AI skip + drive explanations, MCP/assistant football words + drive status, widget + device fallback card: drive-odds line + bonus chips, `play --game` | tested (667 server / 278 web) + live assistant run (Maya 17.5 bold+early, Sam 15.5); basketball play output unchanged |

## 5. What went well and why
- **Contract-first + file ownership** (types, rosters, web scaffold committed before any manager started) → 3 parallel phases merged with zero code conflicts (only `docs/FRICTION_LOG.md` append conflicts).
- **Detailed phase briefs with lead-decided conventions** (option ids `three|two|ft|other`, `home|away|none`, `over|under`; AiSink; fixed ids) → AI, engine and TV built in parallel and fit on first merge.
- **Verify the branch, not the report**: lead re-ran typecheck/tests/scope on every branch before merging; real-server smoke tests caught the "worker missed seeded parties" gap.
- **Fixture mode for UI** (`?fixture=`) let the TV be built without the server.
- **CDP screenshot/eval harness** (now committed: `tools/screenshot.mjs`, `tools/voice-test.mjs`, `tools/tts-clips.ps1`) gave real-browser verification without the user's Chrome.

## 6. What went badly and why
- **Hit the 5-hour usage limit mid wave 2** → both managers died with 429; MCP had uncommitted files. Resumed the same agents after reset via SendMessage; worked, but cost time. Cause: three opus managers + workers in parallel.
- **Avast Web Shield (wsc_proxy) corrupts loopback HTTP on paths ending in `/mcp`**: rewrites Content-Length responses into broken `transfer-encoding: chunked` → `HPE_INVALID_CHUNK_SIZE` / hangs. Workaround: `forceChunked` middleware in `server/src/mcp/http.ts`. Do not remove it.
- Headless `chrome --screenshot` fires before polling data arrives; `--virtual-time-budget` hangs on a polling page → wrote the CDP helper.
- CRLF (`core.autocrlf=true`) breaks naive string-replace edits → normalise `\r\n` before replacing.
- WavLM in browser is slow (≈3 min first load, ≈7.4 s per clip on single-thread WASM) — too slow for live voice turns as-is.

## 7. Dead ends already tried
- `@alexa-ai/addon-local-inspector` from public npm → E404. Don't retry; use MCP Inspector + ext-apps basic-host + own device sim.
- `createMcpExpressApp` default host validation → blocks cloudflared tunnel Host headers; replaced by our own mount with optional `ALLOWED_HOSTS`.
- `Xenova/unispeech-sat-base-plus-sv` → transformers.js 4.3.1 doesn't map it to an x-vector model; use `Xenova/wavlm-base-plus-sv`.
- Hunting a "first-load pop" bug on the TV: two agents found no code path; it was real events arriving while the clock ran. Don't re-investigate.

## 8. Decisions, rationale, invariants (do not break)
- `server/src/shared/types.ts` is **the contract** — only the lead edits it; web imports it as `@shared/types`.
- MCP tools never call Bedrock synchronously (<500 ms rule). AI only via the background worker (`startAiWorker({sink: store, provider})`).
- `AI_MODE=fallback` / `ASSISTANT_MODE=offline` must work with zero AWS credentials (judges and the demo depend on it).
- `GET /api/parties/:code/state?since=<current version>` → **204 with no body**. `PropView` hides `explanation`/`correctOptionId` until resolved.
- Picks in state cover active + locked + last-resolved props.
- MCP auth: missing/bad bearer → 401 **without** `WWW-Authenticate` (Alexa+ expectation). Stateless transport, GET/DELETE → 405.
- Fallback props: fb-k opens at 60(k−1), locks +40, resolves +60 game-seconds; fb-1 is open during the draft (gameT=0).
- Voice ID stays on-device (no audio/embeddings to the server); output is `SpeakerHint` → `AssistantRequest.speaker`.
- TV view (`web/src/tv/**`) is Codex's now — Claude must not edit it.
- No real money/"bet" language, no real teams, no Amazon/Alexa logos in UI.

## 9. Assumptions made
- Node 22 is acceptable for judges (README should say ≥22; plan asked for 24).
- `us.`/`global.` Haiku inference profile + Converse tool-use will behave like the mocked shapes in tests (unverified: no AWS).
- ext-apps `App` widget renders correctly in basic-host / Alexa hosts (only unit-tested render functions).
- Chrome allows Web Speech recognition and a parallel `getUserMedia` capture at the same time (needed for voice ID during an utterance; unverified).
- WavLM model license (UniSpeech repo, CC BY-SA 3.0) is fine since weights are downloaded from Hugging Face at runtime, not redistributed.

## 10. Known issues
- Widget bundle 246 kB; `get_leaderboard` structuredContent ≈34 kB. `get_game_status` has no widget `_meta` (can't drive the tonight view in hosts).
- Widget HTML (`server/src/mcp/widget/dist`) is gitignored and built by `npm run build:widget -w server` (server `pretest` runs it) — `npm run demo` must build it or `/mcp` serves "Widget not built".
- Device: single srcdoc iframe (opaque origin) instead of ext-apps' second-origin sandbox proxy (COEP for voice ID blocks it). Vite proxy truncates the 202 for `notifications/initialized` → one harmless `ERR_INCOMPLETE_CHUNKED_ENCODING` per page (likely forceChunked; see FRICTION_LOG). Web main chunk 665 kB + transformers 543 kB.
- Voice ID: transformers.js fetches ORT wasm from jsDelivr (27 MB local copy in dist unused) — offline hosting needs `env.backends.onnx.wasm.wasmPaths`. COOP/COEP headers set only by Vite dev/preview; may block a cross-origin MCP App iframe (VOICE_ID.md §5a). `crossOriginIsolated`/thread use not confirmed. Pre-7b enrollments lack quick-MFCC profiles until re-enroll.
- Assistant: "Priya takes the over" against DEMO → `make_pick` ok:false (first open prop is scoring-first, no over/under) — routing correct. Bedrock path untested for empty forced-final text; never run on real Bedrock.
- Server test suite: ~1 in 10 runs still stalls (Avast loopback proxy freezes /mcp traffic ~10 s) — FRICTION_LOG; re-run. Worker cap `maxWorkers: 6` in `server/vitest.config.ts` is needed: uncapped (≈15 workers) the <500 ms latency asserts fail from CPU contention.
- Phase 8: no two-minute drive questions (a drive starting under 2:00 has < 30 game-seconds of window). "put me down for yes" without voice ID or a name → "Who's picking?". A drive explanation (with the historical %) arrives from the background worker a moment after resolution. `matchGame("the game")` is now ambiguous (two games) → asks which; empty / "tonight's game" → basketball.
- **TV (Codex) not football-aware** (brief with state fields: `docs/TV_FOOTBALL.md`) — loads and doesn't crash on a football party (clock, scores, statLines, drive explanation show). Gaps for Codex: (1) field panel draws a basketball court; (2) play-by-play text truncated "…"; (3) no drive context ("Otters ball at their own 25"); (4) live pick card lacks the odds line (`prop.odds.p.yes` → "Drives like this score 36% of the time"); (5) no bonus chips (`picks[].score.bonuses`, `standings[].lastPickScore`, `BONUS_COPY`); (6) football positions not shown on Top of the Bench / draft; (7) no yes/no drive-question layout. Bonuses apply to basketball too, so (5) matters for `DEMO`.
- Season `points` = pick points, `fantasyPoints` = draft points (naming is confusing but tested).
- Demo script not rehearsed live; offline router does one tool call per turn; setup creates a new party code (TV must move to `/tv/<CODE>`). See DEMO_SCRIPT findings.

## 11. Open questions for the human
- ~~Who builds the device page?~~ **Answered 2026-10-20: Claude, on `phase/4b-device`.**
- 🧑 AWS (user: "we'll figure it out when we get there"): account + Bedrock model access + `aws configure` + `BEDROCK_MODEL_ID` (Haiku-tier inference profile id) + $5 budget alarm. Needed for the AWS Builder mini challenge proof and a real `AI_MODE=bedrock` / `ASSISTANT_MODE=bedrock` run.
- ~~Phase 8: when to build it~~ — built in session 3 (2026-10-21).
- PR `dev` → `main` for Phase 8? (main last updated via PR #2.)
- Hand the TV gap list (§10) to Codex? Should the demo video show the football game?
- 🧑 Demo video (OBS), YouTube upload, Devpost submission, optional Alexa+ Local Inspector access.

## 12. Files touched (map)
- `server/src/shared/types.ts` contract · `server/src/game/` engine/store/seed/games/projections · `server/src/api/routes.ts` REST
- `server/src/ai/` bedrock/providers/propValidation/guardrails/worker + `fallback/{props,scouting}.json`
- `server/src/mcp/` server.ts (tools/prompt/resources), http.ts (mount, auth, forceChunked), match.ts (fuzzy), rules.ts, `widget/` (Vite single-file app)
- `server/src/index.ts` createApp + main (tick 500 ms, AI worker, /mcp mount; slot for /api/assistant above /api router)
- `server/test/{game,api,ai,mcp}/` · `server/scripts/play-party.ts`
- `web/src/tv/**` (Codex now) · `web/src/lib/{api.ts,usePartyState.ts,fixtures/}` · `web/src/voiceid/**` · `web/src/device/DevicePage.tsx` (placeholder)
- `docs/` FRICTION_LOG (10 entries), AWS.md, VOICE_ID.md, ORCHESTRATION.md, HANDOFF.md

## 13. Next steps (ordered; smallest first)
**How to run them:** each item has a ready-to-paste phase-manager brief in `docs/ORCHESTRATION.md` §5 (4a, 7b, 2b, 4b, 3b, 6),
plus the lead procedure (§3) and brief template (§4). Waves: A = 4a + 7b in parallel → B = 2b → C = 4b (if assigned) → D = 6.
Test helpers committed in `tools/` (screenshot.mjs, voice-test.mjs, tts-clips.ps1).
1. ✅ DONE (session 2) — **Assistant backend (phase 4a)** — `server/src/assistant/`: MCP client (`@modelcontextprotocol/client` StreamableHTTP + bearer) to our own `/mcp`; `ASSISTANT_MODE=offline` rule-based router mapping the plan §8 demo utterances to tools (uses `speaker.memberName` when no "I'm X"); `ASSISTANT_MODE=bedrock` Converse tool-use loop (tools/list → toolConfig, ≤3 rounds, reuse `ai/bedrock.ts` client); returns `AssistantResponse {reply, toolCalls, uiResource, partyCode, mode}`; mount `POST /api/assistant` in index.ts above the /api router. Done = vitest covers each demo utterance offline + mocked Bedrock loop, latency logged, typecheck green.
2. ✅ DONE (session 2) — **Voice ID tuning** — `web/src/voiceid/`: WavLM threshold 0.70, crop clips to ≤3 s, COOP/COEP headers in `web/vite.config.ts` for threaded WASM, MFCC instant first guess. Done = a two-voice test (Windows TTS David vs Zira, 3-clip enroll, 2 held-out each) accepts all 4 held-out clips and embed < 3 s/clip.
3. ✅ DONE (session 2) — **Manual MCP checks** — MCP Inspector (`npx @modelcontextprotocol/inspector`, URL `http://localhost:3001/mcp`, Bearer header) + ext-apps basic-host (`git clone https://github.com/modelcontextprotocol/ext-apps` → `examples/basic-host`) renders the widget; cloudflared tunnel (`~/Downloads/cloudflared-windows-amd64.exe tunnel --url http://localhost:3001`). Done = screenshots + friction entries.
4. ✅ DONE (session 2) — **Device page (phase 4b)**. `/device/:household`: Web Speech in/out, typed fallback, agent trace toggle, app-bridge widget render, EnrollPanel + `useUtteranceCapture` → `speaker`. Done = Checkpoint 4 (two windows sync ≤2 s; season answer after restart).
5. **Real Bedrock run** — blocked on 🧑 AWS creds. Done = Checkpoint 3 with `AI_MODE=bedrock` and token counts logged in AWS.md.
6. ✅ DONE (session 2) — **Phase 6** — `npm run demo` (server SPEED=4 + web + cloudflared hint), README (architecture, protocol 2025-11-25, run steps, env table, known gaps: Alexa+ Preview/OAuth), PRODUCT_FEEDBACK (from FRICTION_LOG), DEMO_SCRIPT, SUBMISSION; PR `dev` → `main`. Done = fresh clone → demo in < 15 min.

7. ✅ DONE (session 3, 2026-10-21; user: "continue where it's left off") — **Phase 8 — drive odds model + bonuses** — spec plan.md §10c,
   orchestration + briefs `docs/ORCHESTRATION.md` §5b. Lead contract commit `195c5ac` (all additive). Wave E merged: `phase/8a-odds`
   (64,085 drives → 17 buckets; two-minute bands 1–40 merged) and `phase/8b-bonuses` (scorePick, PickScore in state/standings,
   bonus copy; 1-of-2 contrarian = ×1 per plan's `< 0.5`). Wave F merged: `phase/8c-football` (stalled once, resumed). All worktrees removed.
   If a manager died: its worktree keeps uncommitted work → resume via SendMessage or re-brief from §5b.
   Decisions made: (a) add a **second, football** replay game that uses an NFL drive-odds table (nflverse 2015–2025 → `drive_odds.json`,
   buckets = 10-yard band × normal/two-minute, merge buckets < 200 drives); basketball `harbor-vs-summit`/`DEMO` stays; (b) **speed buckets**
   (early ×1.25 / quick ×1.10 / late ×1.0 by fraction of the open window) and **contrarian bonus** (lone call ×1.5 / minority ×1.2) apply to
   **both** games, stacked with streak and the football-only odds multiplier `clamp(0.5/p, 0.5, 2.0)`, combined factor capped ×5.
   Needs a lead contract change first (`Game.sport`, football positions, `Prop.odds`, `Pick.gameT`, per-pick bonus breakdown); TV football
   rendering is Codex's. Suggested split: one manager for the Python odds script + JSON, one for engine/game/MCP after the contract commit.
   Open: wording stays "points multiplier" (no payout/bet language).

8. **Next (smallest first):** PR dev → main (on user's ask) · Codex: TV football/bonus view from the §10 gap list · DEMO_SCRIPT: optional
   football beat ("set up a watch party for the football game…", a drive question with its %, a "Lone call" bonus) · 3b real Bedrock
   (AWS creds) · 🧑 rehearse demo, record video, Devpost (deadline Fri 2026-10-23 10:00 AM PT).

Retro: none written (use `xvant-retro` if wanted).
