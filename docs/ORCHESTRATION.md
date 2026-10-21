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

## 5b. Phase 8 — drive odds + football game + pick bonuses (session 3)

Spec: plan.md §10c. Contract committed by the lead first (`195c5ac` on dev): `Sport`, `Game.sport?`, football `Position`s and
`StatType`s (+ `FANTASY_SCORING` values, `FOOTBALL_STATS`), `GameEvent.type 'drive'` + `drive?: DriveState` + `driveResult?` +
`yards?`, resolver `driveResult {driveId, outcome:'score'|'td'}` (options `yes|no`), `Prop.odds?: PropOdds`, `Pick.gameT?`,
`PickScore`/`PickBonus`, `StandingRow.lastPickScore?`, state `picks[].score?`, `game.sport?`, constants `SPEED_BUCKETS`,
`CONTRARIAN`, `ODDS_MULTIPLIER`, `PICK_FACTOR_CAP`, `BONUS_COPY`. All optional/additive → TV and fixtures untouched.

Waves: **E** = 8a odds table ∥ 8b bonuses (disjoint files) → **F** = 8c football game (needs 8a's `driveOddsProp` and 8b's engine)
→ **G** = lead: docs/status, TV smoke on a football party (report gaps to Codex, don't edit `web/src/tv/**`), PR dev → main on ask.
3b (real Bedrock) stays blocked on AWS creds.

Lead decisions (all phase 8 briefs):
1. Wrong picks 0 points and reset the streak. `points = roundHalf(PICK_BASE_POINTS × min(PICK_FACTOR_CAP, streak × odds × speed × contrarian))`,
   `roundHalf(x) = Math.round(x * 2) / 2`.
2. Speed: `f = clamp01((pick.gameT − opensAt) / (locksAt − opensAt))`; no `gameT` → ×1. Re-picking the **same** option keeps the
   original `at`/`gameT`; only a different option counts as a change.
3. Contrarian over all party picks on that prop (every household), counted at resolution; correctness doesn't matter for share.
4. Odds only when `prop.odds` exists: `clamp(0.5 / p[optionId], 0.5, 2)`; missing/zero p → ×2. Odds > 1 earns `bold_call`.
5. `bonuses` = earned bonuses on a correct pick, biggest factor first; voice mentions at most one ("Lone call — 15 points").
6. Football game id `riverton-vs-ironwood`, `sport:'football'`, 480 game-seconds, 4 periods (same pace as basketball);
   `DEMO` stays basketball. No new seeded party: football parties come from `setup_watch_party` ("…the football game…") or
   `POST /api/parties {crewId, gameId}`.

### 8a — Drive odds table (`phase/8a-odds`, wave E, model: sonnet)
- Goal: `server/src/game/odds/drive_odds.json` built from nflverse 2015–2025 drives + a typed lookup the football game uses.
- Owned: `tools/odds/**` (script, README, gitignored `.cache/`), `server/src/game/odds/drive_odds.json`, `server/src/game/odds.ts`,
  `server/test/game/odds.test.ts`, `.gitignore` (add `tools/odds/.cache/`), `docs/FRICTION_LOG.md` (append).
- Spec: (1) `tools/odds/build_drive_odds.py`, **stdlib only** (this machine's `python` has no pip; HTTPS is intercepted by Avast but
  urllib uses the Windows store): download `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{2015..2025}.csv.gz`
  into `tools/odds/.cache/` (skip if present), stream with `gzip`+`csv`. Run with `py -3` (or uv's 3.11). README mentions
  `nflreadpy` as the alternative for teammates. (2) One row per drive (`game_id` + `fixed_drive`): first **scrimmage** play
  (skip kickoffs / no-play rows) → `yardline_100`, `half_seconds_remaining`, `fixed_drive_result`. Drop missing fields and
  end-of-half kneel drives (`qb_kneel` = 1 on the drive). (3) `scored` = Touchdown or Field goal; `td` = Touchdown (check the
  real value spellings in the data). (4) Buckets: 10-yard bands of `yardline_100` (1–10 … 91–99) × `normal` / `two-minute`
  (`half_seconds_remaining < 120`); merge any bucket with n < 200 into its neighbouring band with the same clock state until ≥ 200;
  key `"<lo>-<hi>|<clock>"`, value `{p_score, p_td, n}` (3 decimals), flat object, keys sorted. (5) Sanity checks printed and
  asserted by the script: p_score non-increasing as `yardline_100` grows (per clock state, allow ≤ 0.02 wobble), p_td ≤ p_score,
  every band 1–99 covered once per clock state. (6) `odds.ts`: load the JSON via fs like `games.ts`; `getOdds(yardline100,
  halfSecondsRemaining, type: 'score'|'td') → {p, bucket, n}` (clamp yardline to 1–99); `driveOddsProp(drive: DriveState,
  outcome: 'score'|'td'): PropOdds` → `{source:'drive_odds', bucket, n, p:{yes: p, no: 1−p}}` (3 decimals).
- Acceptance: script runs end to end and prints the checks (paste the bucket table into `tools/odds/README.md` with total drives);
  `npm run typecheck -w server` 0; `npm test -w server` green (odds tests: bucket edges 10/11, 119/120 s, merged-bucket lookup,
  p_td ≤ p_score for every key, yes+no = 1).

### 8b — Pick bonuses (`phase/8b-bonuses`, wave E, model: opus)
- Goal: speed + contrarian (+ odds when present) bonuses score every resolved pick in both games, with a per-pick breakdown in
  standings/state and spoken/MCP copy.
- Owned: `server/src/game/engine.ts` (pick scoring only), `server/src/game/store.ts` (`pick()` gameT stamp, same-option rule,
  state `picks[].score`, `lastPickScore`), `server/src/mcp/server.ts` + `server/src/mcp/rules.ts` (text only: bonus copy in
  `explain_last_result`, `get_leaderboard`, `get_my_roster`; rules section on bonuses), `server/src/ai/providers.ts` (fallback recap
  may name one bonus), `server/scripts/**`, `server/test/**` (update fixed totals deliberately), `docs/FRICTION_LOG.md`.
- Spec: lead decisions 1–5 above. `scorePick({prop, pick, partyPicks, streakBefore}) → PickScore` (pure, exported);
  `tallyPicks` uses it, sums points, returns `scores: PickScore[]` and `lastScore?`; `computeStandings` sets `lastPickScore`.
  Keep `PickTally` fields the store/season already read. Fallback recap / tool text: "Lone call ×1.5" style, no wager words.
- Acceptance: `npm run typecheck -w server` 0; `npm test -w server` green with new unit tests for every edge (`f` = 0.25 / 0.60
  exactly, f > 1 clamps, no gameT, share = 0.5 with 2 pickers → ×1, 1-of-3 → lone, 2-of-5 → minority, 1-of-2 → ×1 (share 0.5 is not < 0.5), cap
  at ×5 → 50, roundHalf, odds clamp both ends, same-option re-pick keeps gameT); `npm run play -w server` still prints
  "Benchwarmer of the night" and a standings table; live: server on 3016, a pick via `POST /api/parties/DEMO/picks` (or MCP),
  advance to resolution (SPEED=80), `GET …/state` shows `picks[].score` and `standings[].lastPickScore`. Stop by PID.

### 8c — Football replay game (`phase/8c-football`, wave F, model: opus)
- Goal: a second, fictional **football** game playable end to end (voice/MCP/widget/device) with drive props carrying
  precomputed odds; the basketball demo unchanged.
- Owned: `server/src/game/games/riverton-vs-ironwood.json` (new), `server/src/game/{games,engine,projections,store}.ts`
  (football events, fantasy, statLine, clock, `game.sport` in state), `server/src/ai/fallback/{props,scouting}.json` (football
  entries), `server/src/ai/**` (skip AI prop generation for football; drive-prop explanations naming the historical %),
  `server/src/mcp/**` (game matching "football", football position words, drive-prop option words, widget: positions, drive-prop
  odds line "Drives like this score 38% of the time", bonus chips from `picks[].score`), `server/src/assistant/**` (football
  utterances), `web/src/device/**` (fallback card: football + bonus chips), `server/scripts/**`, `server/test/**`,
  `web/src/device/**` tests, `docs/FRICTION_LOG.md`. **Not** `web/src/tv/**`.
- Spec: (1) Teams: away **Riverton Otters** (RIV), home **Ironwood Forge** (IRN); 8 players each (QB, 2 RB, 3 WR, TE, K), ids
  `riv-qb-12` style, voice-friendly nicknames, projections distinct from basketball. (2) ~10–12 drives over 480 game-seconds; each
  drive = a `drive` start event carrying `DriveState` (football half clock 0–1800 → keep it consistent with the game clock scaled
  ×7.5), plays with yards stats (receiver/rusher = `playerId`, QB = `assistPlayerId` credited the matching pass stat), and an end
  event with `driveResult` (TD = score 6 + separate `xp` score 1; FG = 3). Mix of results so yes and no both win. (3) Football
  fantasy in `eventFantasy` (per-yard stats × `yards`), football `statLine` ("212 PASS YDS, 2 TD" style), `gameClock` shows a
  football clock (Q1 15:00 counting down). (4) 8 fallback drive props: "Will the Otters score on this drive?" /"…a touchdown?",
  options `yes|no`, opens at the drive start, ≥ 30 game-seconds open before the first play, resolves at the drive end, `odds` from
  8a's `driveOddsProp` written into props.json (generated by a script in `server/scripts/`, committed output). `resolveProp`
  handles `driveResult`. (5) MCP/assistant (`matchGame` with an empty title or "tonight's game" must still pick `harbor-vs-summit`; keep it first in `GAMES`): "set up a watch party for the football game with the Sunday Crew", "who's available at
  quarterback?", "draft the Otter QB", "put me down for yes / they score / they get stopped", "Leo says no". (6) Widget + device
  fallback card show football positions, the drive-odds line, and bonus chips; basketball views unchanged. (7) TV: verify only —
  screenshot `/tv/<football code>` and list what Codex needs; never edit.
- Acceptance: typecheck 0 (server + web); `npm test` green; `npm run play -w server -- --game riverton-vs-ironwood` (add the flag)
  plays a full football party; live: setup a football party via `POST /api/assistant` offline, draft, pick, resolve at SPEED=80,
  state shows `game.sport:'football'`, odds on props, a scored pick with bonuses; widget build green.

## 6. History (session 1, 2026-10-20)
Wave 1: 1-engine (opus), 3-ai (sonnet), 5-tv (opus) in parallel → merged; lead wired AI worker. 5b TV polish (worker).
Wave 2: 2-mcp (opus), 7-voiceid (opus) → rate-limited mid-run, resumed, merged. All phase branches are on origin.
Session 2: wave A 4a (opus) + 7b (sonnet) → merged (lead fixed a Bedrock-fallback double-mutation bug); 2b (sonnet) + 4b (opus)
in parallel → 4b hit the usage limit, resumed via SendMessage, merged. Remaining: 6 polish, 3b real model run.
Then wave D 6 (sonnet) → merged; PRs #1/#2 dev → main. Phase 8 planned (plan §10c) and, session 3, built as waves E (8a ∥ 8b) → F (8c).
