# Handoff — resume here

Last updated: 2026-10-20 (session 1, lead = Claude Code orchestrator)
Deadline: Fri 2026-10-23 12:00 PM PT (submit by 10:00 AM PT).

## How to resume
1. `git fetch && git checkout dev && npm install` (root; npm workspaces `server`, `web`).
2. Read `docs/ORCHESTRATION.md` (phases, owned files, waves) and the status table below.
3. Unfinished phase branches are pushed to origin as `phase/<name>`; check `git log dev..origin/phase/<name>`.
4. Continue with the first phase not marked merged.

## Status
| Phase | Branch | Status |
|---|---|---|
| 0 contract/scaffold | dev | done (types, rosters, web scaffold, CLAUDE.md, friction log) |
| 1 engine/store/REST | phase/1-engine | merged (92 tests; play script; REST) |
| 3 AI/Bedrock | phase/3-ai | merged (71 tests; mocked Bedrock) + lead wired worker in index.ts main() |
| 5 TV view | phase/5-tv, phase/5b-tv-polish | merged (83 web tests; verified against real server via headless CDP screenshot) |
| 2 MCP + widget | phase/2-mcp | wave 2 — in progress |
| 7 voice ID | phase/7-voiceid | wave 2 — in progress |
| 4 device + assistant | phase/4-device | wave 3 — not started |
| 6 polish/submission | phase/6-polish | wave 4 — not started |

## Human-only items (🧑)
- AWS account + Bedrock model access + `aws configure` (none on the build machine yet). Set `AI_MODE=bedrock`,
  `ASSISTANT_MODE=bedrock`, `BEDROCK_MODEL_ID`, `AWS_REGION` once available.
- Optional: Node 24, Alexa+ Local Inspector access, OBS recording, YouTube upload, Devpost submission.

## Facts learned (wave 1)
- REST state with `since` == current version returns **204 no body**.
- `DATA_FILE` resolves against cwd (`npm start -w server` → `server/data/store.json`).
- Prop windows: fb-k opens 60(k-1), locks +40, resolves +60 (game s). fb-1 open during draft.
- PropView hides explanation/correctOptionId until resolved.
- Seeded parties emit `party_created` before the worker subscribes → main() warms scouting notes at startup.
- Smoke: SPEED=80 full party via REST → final 57-56, recap + benchwarmer (Big Mo) + scouting notes present.

## Challenges + workarounds so far
- 2026-10-20 ~16:00 ET: hit the 5-hour session limit mid wave 2; both managers died with 429. Their worktrees kept
  partial work (phase/2-mcp had uncommitted http.ts/server.ts/tests). Resumed the same agents after reset (17:40 ET).
  Lesson: managers commit per task, lead pushes phase branches as backups.
- Headless `chrome --screenshot` fires before polling data arrives and `--virtual-time-budget` hangs on a polling page
  → scratchpad CDP helper (launch headless Chrome with remote debugging, wait N ms, Page.captureScreenshot).
- Open item: store.getState only sends picks for active + last-resolved props → locked-prop card lacks "who picked"
  (asked phase 2 to add it, since it owns store.ts additions).
- CRLF: repo files get CRLF on Windows (autocrlf); string-replace edits must normalise line endings.
- No AWS creds → fallback/offline modes are first-class; Bedrock paths tested with mocks.
- `@alexa-ai/addon-local-inspector` 404 on npm → MCP Inspector + basic-host + own device sim.
- Node 22 instead of 24 → fine for MCP SDK v2 (protocol 2025-11-25 confirmed in `@modelcontextprotocol/core`).
- TypeScript resolved to 7.0.2 (native compiler); typecheck works.
