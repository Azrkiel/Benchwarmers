# Orchestration plan (lead session)

Spec: `plan.md` (status-marked). Resume state: `docs/HANDOFF.md`. This file says **how** the work is split across subagents:
lead procedure, ownership, and ready-to-paste phase-manager briefs for the remaining work.

## 1. Model
- **Lead** (the main Claude Code session) owns the contract (`server/src/shared/types.ts`), `server/src/index.ts` integration,
  merges, pushes, and this file. It never trusts a report: it re-runs checks on the branch before merging.
- **Phase managers** (`subagent_type: xvant-phase-manager`) each own one phase in their own git worktree + branch, split it into
  tasks, hand each to a `general-purpose` worker (model chosen by the model-router mod), check + commit each result, and report.
- Workers never spawn agents. Managers never push, merge, or touch files outside their owned list.

## 2. Ownership (current)
| Area | Owner |
|---|---|
| `web/src/tv/**` (TV view) | **Codex** (user's decision, 2026-10-20). Claude must not edit. Codex works in its own clone `C:\Users\jiang\Benchwarmers` on port 5173. |
| `web/src/device/**` (simulated device page) | **Claude**, on `phase/4b-device` (user's decision, 2026-10-20). User will compare with Codex's frontend. |
| Contract `server/src/shared/types.ts`, `server/src/index.ts` mounts | Lead |
| Everything else (server, MCP, AI, assistant, voice ID, docs) | Claude phases below |

## 3. Lead procedure (per wave)
1. `git checkout dev && git pull`. Commit any contract change needed by more than one phase **before** spawning.
2. Per phase: `git worktree add -b phase/<name> "$LOCALAPPDATA/Temp/bw-lanes/<name>" dev` then `npm ci` inside it
   (Agent `isolation: "worktree"` is not used; create worktrees manually).
3. Spawn every phase of the wave in **one message**, `run_in_background: true`, `subagent_type: xvant-phase-manager`,
   prompt = the phase brief from §5 (fill in the base commit). `model: opus` only where noted; default sonnet.
   Don't run more than 2–3 opus managers at once — three in parallel hit the 5-hour usage limit on 2026-10-20.
4. On each report, verify the branch, not the prose:
   `git -C <wt> log --oneline dev..HEAD`, `git -C <wt> diff --name-only dev..HEAD` (only owned files), `git -C <wt> status --short`,
   then re-run the brief's acceptance commands yourself.
5. Merge into `dev` with `--no-ff`, run `npm run typecheck && npm test` from root, push `dev` and the phase branch.
   `docs/FRICTION_LOG.md` append conflicts are expected: keep both sides (strip conflict markers).
6. If a manager dies (rate limit, crash): its worktree keeps uncommitted work. Resume the **same** agent with SendMessage after the
   reset, telling it what is committed and what is uncommitted. Push committed phase branches as a backup.
7. After each merge, update the status table in `plan.md` and `docs/HANDOFF.md`. Near the usage limit: write the handoff first.
8. Remove merged worktrees (`git worktree remove --force <path>`).

## 4. Brief template (fill every line)
```
Phase: <name> (<wave>)
Goal: <one sentence: what is true when done>
Worktree: C:\Users\jiang\AppData\Local\Temp\bw-lanes\<name>   Branch: phase/<name>   Base: dev at <commit>
Read first: CLAUDE.md, docs/HANDOFF.md, docs/ORCHESTRATION.md (this brief), plan.md section <n>.
Owned files (the only files you may change): <list>
Contract (read-only): <list>
Test command: <cmd> (from worktree root)   Typecheck: <cmd>
Spec details the lead decided: <numbered list>
Acceptance checks (run exactly these at the end): <cmd>: <expected>
Notes: <merged facts that matter>
Commit after each task on phase/<name>: `phase <n>: <task>`, ending with a blank line and
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
```
Environment facts every brief may need: Node 22 (bundled, on PATH); run npm from Git Bash; ports: server 3001, Codex's web 5173
(use 5175+ for your own Vite); stop servers only by exact PID after checking the command line; Avast breaks `/mcp` on loopback
unless the server forces chunked framing (already done in `server/src/mcp/http.ts` — keep it); CRLF working copies.
Helpers: `tools/screenshot.mjs`, `tools/voice-test.mjs`, `tools/tts-clips.ps1` (usage on line 1 of each).

## 5. Remaining phases (ready-to-paste briefs)

Waves: **A** = 4a + 7b (parallel, disjoint files) · **B** = 2b manual MCP checks (after 4a) · **C** = 4b device page (assigned to Claude) · **D** = 6 polish · **3b** real Bedrock whenever AWS creds exist.

### 4a — Assistant backend (`phase/4a-assistant`, wave A, model: opus)
- Goal: `POST /api/assistant` turns a text utterance (+ optional voice-ID speaker) into MCP tool calls against our own `/mcp`
  and returns `AssistantResponse`, in two modes: `ASSISTANT_MODE=offline` (rule-based router, zero AWS) and `bedrock`
  (Converse tool-use loop).
- Owned: `server/src/assistant/**`, `server/test/assistant/**`, `server/src/index.ts` (mount only, in the slot above the `/api`
  router), `docs/FRICTION_LOG.md` (append).
- Read-only: contract (`AssistantRequest`, `AssistantResponse`, `ToolCallTrace`, `UiResourcePayload`, `SpeakerHint`),
  `server/src/mcp/**` (tool names, input schemas, structuredContent `{view, code, state, season}`), `server/src/ai/bedrock.ts`
  (usage counters, JSON helpers), `server/src/game/**`.
- Spec:
  1. `mcpClient.ts`: `@modelcontextprotocol/client` `Client` + `StreamableHTTPClientTransport` to `http://127.0.0.1:${PORT}/mcp`
     with `Authorization: Bearer ${MCP_TOKEN}` via `requestInit`. Cache `tools/list`. Injectable for tests.
  2. `offlineRouter.ts` (pure where possible): maps the plan §8 demo utterances to tools + args: "set up a watch party for tonight's
     game with the Sunday Crew" → `setup_watch_party`; "who's available at center?" → `list_available_players {position:'C'}`;
     "I'm Maya, draft Big Mo" / "draft Big Mo" → `draft_player`; "put me down for the Hawks scoring first" / "Priya takes the over"
     → `make_pick`; "how's my roster doing?" → `get_my_roster`; "who's winning (in our house)?" → `get_leaderboard`; "why did that
     one go the other way?" → `explain_last_result`; "how am I doing this season?" → `get_season_standings`; "start the game" →
     `start_watch_party`; "what's the score?" → `get_game_status`. Member name priority: explicit "I'm X"/"X takes" in the text >
     `speaker.memberName` (voice ID) > ask "Who's picking?" (reply only, no tool call). Household from `request.household`.
     Unknown intent → helpful reply listing what you can say.
  3. `bedrockLoop.ts`: tools/list → Converse `toolConfig` (JSON schema from each tool's inputSchema); system prompt from the
     `watch_party_host` prompt + household/speaker context; loop Bedrock → toolUse → MCP `callTool` → toolResult, max 3 rounds,
     then final text. BedrockRuntimeClient injectable; on any Bedrock error fall back to the offline router for that turn and set
     `mode: 'offline'`. Keep reply short and speakable (voice).
  4. Response: `toolCalls` trace (name, args, ok, summary, ms); `uiResource` = the last called tool that has
     `_meta.ui.resourceUri` (uri, toolName, toolInput, raw toolResult) so the device can render the MCP App; `partyCode` from
     tool results (e.g. after setup). Log per-turn latency.
  5. `routes.ts`: express router for `POST /api/assistant` with zod validation of `AssistantRequest`; 400 on bad input.
  6. Tests (vitest, real server on an ephemeral port + real MCP endpoint, mocked Bedrock client): every utterance in item 2 in
     offline mode (correct tool + args + non-empty reply), speaker-hint path ("draft Big Mo" with speaker Maya → Maya's roster),
     missing-speaker ask path, uiResource present for UI tools, Bedrock loop with a scripted mock (toolUse → toolResult → final
     text), Bedrock failure → offline fallback, 3-round cap.
- Acceptance: `npm run typecheck -w server` 0; `npm test -w server` all green; live: start server on 3015 with a temp DATA_FILE,
  `curl -s -X POST localhost:3015/api/assistant -H "content-type: application/json" -d '{"text":"I'\''m Maya, draft Big Mo","household":"garcias","partyCode":"DEMO"}'`
  → 200 JSON with `mode:"offline"`, a `draft_player` tool call, and `uiResource.uri` `ui://benchwarmers/board.html`. Stop by PID.

### 7b — Voice ID tuning (`phase/7b-voiceid-tuning`, wave A, model: sonnet)
- Goal: voice ID fast and accurate enough for live turns: WavLM accepts true speakers, embed < 3 s per utterance.
- Owned: `web/src/voiceid/**`, `web/vite.config.ts` (additive: headers), `docs/VOICE_ID.md`, `docs/FRICTION_LOG.md` (append).
  Never touch `web/src/tv/**`.
- Facts: real-model run (tools/voice-test.mjs, TTS David vs Zira, 3-clip centroid): same-speaker 0.788–0.974, cross 0.245–0.409;
  default threshold 0.85 rejected a true clip. First load ≈3 min (102 MB), embed ≈7.4 s/clip single-thread WASM in headless Chrome.
  MFCC: same 0.978–0.987 vs cross 0.930–0.947.
- Spec: (1) WavLM default threshold 0.70, margin 0.05 (MFCC keeps 0.90/0.02); (2) crop each clip to its loudest ≤3 s window after
  silence trim before embedding (enrollment clips too); (3) try multi-threaded WASM: `server.headers` + `preview.headers` with
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (not require-corp: HF model
  downloads lack CORP) and set `env.backends.onnx.wasm.numThreads`; keep it only if the model still loads and nothing else breaks
  (note: the device page will embed an MCP App iframe — record any risk in VOICE_ID.md); (4) identify returns an instant MFCC guess
  while WavLM is still loading; (5) update tests + VOICE_ID.md with the numbers.
- Acceptance: `npm run typecheck -w web` 0; `npm test -w web` green; `powershell -ExecutionPolicy Bypass -File tools/tts-clips.ps1 -Out <tmp>`
  then `npx vite --port 5176` (web) and `node tools/voice-test.mjs <tmp> http://localhost:5176/voice-lab wavlm` → all 4 held-out
  clips score highest for their own speaker and ≥ 0.70, and printed perClipMs < 3000. Stop Vite by PID.

### 2b — Manual MCP host checks (`phase/2b-mcp-hosts`, wave B, model: sonnet)
- Goal: evidence the MCP server + widget work in real hosts (for the demo video and judges).
- Owned: `docs/MCP_HOSTS.md` (new; steps + screenshots under `docs/img/`), `docs/FRICTION_LOG.md`, `server/src/mcp/widget/**`
  (only fixes found during checks).
- Steps: server on 3001; `npx @modelcontextprotocol/inspector` → Streamable HTTP `http://localhost:3001/mcp` + Bearer header →
  run the Checkpoint 2 flow; clone `https://github.com/modelcontextprotocol/ext-apps` to a temp dir, run `examples/basic-host`
  against our server and screenshot the widget (draft, tonight, season) at ~800 px and ~1280 px wide; cloudflared quick tunnel
  (`~/Downloads/cloudflared-windows-amd64.exe tunnel --url http://localhost:3001`) and an `initialize` POST through it.
- Acceptance: MCP_HOSTS.md with screenshots of all three widget tabs in basic-host and the Inspector tool list; tunnel initialize
  returns protocolVersion 2025-11-25.

### 4b — Device page (`phase/4b-device`, wave C, model: opus) — assigned to Claude 2026-10-20
- Goal: plan §8 `/device/:household`: neutral smart-display frame, wake/mic button (Web Speech API) + typed fallback, transcript,
  spoken reply (`speechSynthesis`), "Show agent trace" toggle, MCP App rendered in the widget area via
  `@modelcontextprotocol/ext-apps/app-bridge` (follow ext-apps `examples/basic-host`; fallback: native card from
  `structuredContent`), voice ID (EnrollPanel in a settings drawer; `useUtteranceCapture` alongside recognition →
  `identify()` → `speaker` in `AssistantRequest`), party code from `AssistantResponse.partyCode` or `GET /api/crews/sunday-crew/current`.
- Owned: `web/src/device/**`, `web/package.json` (deps), lock via npm only. Not `web/src/tv/**`.
- Acceptance: typecheck/test/build green; Checkpoint 4: two headless pages (`/device/garcias`, `/device/sams-place`) — a typed pick
  in one shows in the other's widget within ~2 s (verify with tools/screenshot.mjs); season question answers after server restart.

### 3b — Real Bedrock run (`phase/3b-bedrock-live`, any time, lead or sonnet) — blocked on 🧑 AWS creds
- Set `AI_MODE=bedrock ASSISTANT_MODE=bedrock BEDROCK_MODEL_ID=<haiku inference profile> AWS_REGION=…`; run a full party
  (SPEED=8) + a few assistant turns; record token counts/costs and any schema-retry events in docs/AWS.md; fix prompt issues in
  `server/src/ai/**` / `server/src/assistant/**`.

### 6 — Polish + submission (`phase/6-polish`, wave D, model: sonnet)
- Owned: root `package.json` (`demo` script, e.g. `concurrently` server SPEED=4 + web + printed cloudflared command; no bash-only
  syntax), `README.md`, `docs/{PRODUCT_FEEDBACK,DEMO_SCRIPT,SUBMISSION}.md`, `scripts/**`.
- README: what/why, architecture diagram, MCP protocol 2025-11-25, Windows/macOS/Linux run steps, env table, how to connect
  Inspector / basic-host / tunnel, demo mode, voice ID, known gaps (Alexa+ Private Preview onboarding, OAuth/OIDC, Node ≥22).
  PRODUCT_FEEDBACK per tool from FRICTION_LOG. DEMO_SCRIPT ≤2:50 per plan §10. SUBMISSION: all Devpost fields.
- Acceptance: fresh clone in a temp dir → `npm ci && npm run demo` → `/healthz` 200 and `/tv/DEMO` renders; then PR `dev` → `main`.

## 6. History (session 1, 2026-10-20)
Wave 1: 1-engine (opus), 3-ai (sonnet), 5-tv (opus) in parallel → merged; lead wired AI worker. 5b TV polish (worker).
Wave 2: 2-mcp (opus), 7-voiceid (opus) → rate-limited mid-run, resumed, merged. All phase branches are on origin.
Session 2: wave A 4a (opus) + 7b (sonnet) → merged (lead fixed a Bedrock-fallback double-mutation bug); 2b (sonnet) + 4b (opus)
in parallel → 4b hit the usage limit, resumed via SendMessage, merged. Remaining: 6 polish, 3b real model run.
