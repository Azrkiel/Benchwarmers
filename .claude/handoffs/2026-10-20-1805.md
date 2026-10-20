# Handoff — Benchwarmers (resume here)

## 1. Metadata
- Written: 2026-10-20 18:05 ET, end of Claude Code session 1. Lead model: Claude Opus 5.5 (orchestrator); phase managers opus/sonnet, workers via model-router.
- Repo: https://github.com/Azrkiel/Benchwarmers (public, MIT). Working branch: **`dev`** (all merged work). `main` = only the original plan.
- Spec: `plan.md` (now marked up with ✅/🟡/⬜ status per phase). Orchestration + file ownership: `docs/ORCHESTRATION.md`.
- Deadline: **Fri 2026-10-23 12:00 PM PT; submit by 10:00 AM PT** (Devpost "Build, Ship, Shape", Alexa+ track + AWS Builder mini).

## 2. Current task
Build the whole Benchwarmers hackathon project from `plan.md`: an Alexa+ add-on (one-night fantasy draft + live pick'em by voice) =
self-hosted MCP server (2025-11-25, Streamable HTTP) + MCP App widget + Bedrock content + simulated Alexa+ device + big-screen TV view,
plus the user's extra ask: **pure voice recognition (voice ID) so people don't have to say "I'm Maya"**.
User's latest direction (2026-10-20 evening): **Claude works on the backend; Codex works on the TV view/frontend** (user will compare).

## 3. Reproducible state
- Branch `dev` @ `c79c359` + this handoff commit; pushed. Phase branches pushed: `phase/1-engine`, `phase/2-mcp`, `phase/3-ai`,
  `phase/5-tv`, `phase/5b-tv-polish`, `phase/7-voiceid` (all merged into dev; no unmerged work anywhere).
- Uncommitted: none after this commit. Phase worktrees under `%LOCALAPPDATA%\Temp\bw-lanes\` were removed after merge.
- Running: nothing of ours. **Port 5173 is in use by Codex's separate clone** (`C:\Users\jiang\Benchwarmers`, `vite --host 127.0.0.1`) — don't kill it; use another web port (e.g. `npx vite --port 5175`).
- Resume commands (Git Bash):
  ```bash
  cd ~/Downloads/xvant/Benchwarmers && git checkout dev && git pull && npm ci
  npm run typecheck && npm test          # expect: server 373 passed, web 177 passed
  npm run play -w server                 # full scripted party → standings table, "Benchwarmer of the night: Big Mo"
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
| plan.md marked up with status | written |

## 5. What went well and why
- **Contract-first + file ownership** (types, rosters, web scaffold committed before any manager started) → 3 parallel phases merged with zero code conflicts (only `docs/FRICTION_LOG.md` append conflicts).
- **Detailed phase briefs with lead-decided conventions** (option ids `three|two|ft|other`, `home|away|none`, `over|under`; AiSink; fixed ids) → AI, engine and TV built in parallel and fit on first merge.
- **Verify the branch, not the report**: lead re-ran typecheck/tests/scope on every branch before merging; real-server smoke tests caught the "worker missed seeded parties" gap.
- **Fixture mode for UI** (`?fixture=`) let the TV be built without the server.
- **CDP screenshot/eval harness** (session scratchpad `tools/shot.mjs`, `tools/voicetest.mjs`, `tools/tts.ps1`) gave real-browser verification without the user's Chrome. (Scratchpad is session-local; recreate if needed: launch headless Chrome with `--remote-debugging-port`, navigate, wait, `Page.captureScreenshot` / `Runtime.evaluate`.)

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
- Widget not yet opened in MCP Inspector / basic-host; breakpoints (≤10" / ≥11") not visually checked. Bundle 246 kB (ext-apps pulls MCP client + zod).
- Voice ID: default WavLM threshold 0.85 rejected one true clip (0.788) → should be ~0.70; embed 7.4 s/clip; transformers.js fetches ORT wasm from jsDelivr (27 MB local copy in dist unused) — offline hosting needs `env.backends.onnx.wasm.wasmPaths`.
- Season `points` = pick points, `fantasyPoints` = draft points (naming is confusing but tested).
- No `npm run demo`, README, DEMO_SCRIPT, PRODUCT_FEEDBACK, SUBMISSION yet.
- `docs/ORCHESTRATION.md` phase list predates the Codex split for frontend.

## 11. Open questions for the human
- **Who builds the device page** (`/device/:household`: mic, TTS, transcript, agent trace, MCP App via app-bridge, voice enrollment)? Claude or Codex? (User said "I'll see what you cook up and compare" — default assumption: Claude builds the backend `/api/assistant` first, then may build a device page on its own branch for comparison.)
- 🧑 AWS: account + Bedrock model access + `aws configure` + `BEDROCK_MODEL_ID` (Haiku-tier inference profile id) + $5 budget alarm. Needed for the AWS Builder mini challenge proof and a real `AI_MODE=bedrock` / `ASSISTANT_MODE=bedrock` run.
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
1. **Assistant backend (phase 4a)** — `server/src/assistant/`: MCP client (`@modelcontextprotocol/client` StreamableHTTP + bearer) to our own `/mcp`; `ASSISTANT_MODE=offline` rule-based router mapping the plan §8 demo utterances to tools (uses `speaker.memberName` when no "I'm X"); `ASSISTANT_MODE=bedrock` Converse tool-use loop (tools/list → toolConfig, ≤3 rounds, reuse `ai/bedrock.ts` client); returns `AssistantResponse {reply, toolCalls, uiResource, partyCode, mode}`; mount `POST /api/assistant` in index.ts above the /api router. Done = vitest covers each demo utterance offline + mocked Bedrock loop, latency logged, typecheck green.
2. **Voice ID tuning** — `web/src/voiceid/`: WavLM threshold 0.70, crop clips to ≤3 s, COOP/COEP headers in `web/vite.config.ts` for threaded WASM, MFCC instant first guess. Done = a two-voice test (Windows TTS David vs Zira, 3-clip enroll, 2 held-out each) accepts all 4 held-out clips and embed < 3 s/clip.
3. **Manual MCP checks** — MCP Inspector (`npx @modelcontextprotocol/inspector`, URL `http://localhost:3001/mcp`, Bearer header) + ext-apps basic-host (`git clone https://github.com/modelcontextprotocol/ext-apps` → `examples/basic-host`) renders the widget; cloudflared tunnel (`~/Downloads/cloudflared-windows-amd64.exe tunnel --url http://localhost:3001`). Done = screenshots + friction entries.
4. **Device page (phase 4b)** — only after the user answers who owns it. `/device/:household`: Web Speech in/out, typed fallback, agent trace toggle, app-bridge widget render, EnrollPanel + `useUtteranceCapture` → `speaker`. Done = Checkpoint 4 (two windows sync ≤2 s; season answer after restart).
5. **Real Bedrock run** — blocked on 🧑 AWS creds. Done = Checkpoint 3 with `AI_MODE=bedrock` and token counts logged in AWS.md.
6. **Phase 6** — `npm run demo` (server SPEED=4 + web + cloudflared hint), README (architecture, protocol 2025-11-25, run steps, env table, known gaps: Alexa+ Preview/OAuth), PRODUCT_FEEDBACK (from FRICTION_LOG), DEMO_SCRIPT, SUBMISSION; PR `dev` → `main`. Done = fresh clone → demo in < 15 min.

Retro: none written (use `xvant-retro` if wanted).
