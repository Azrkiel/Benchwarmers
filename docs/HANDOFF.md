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
| 1 engine/store/REST | phase/1-engine | wave 1 — in progress |
| 3 AI/Bedrock | phase/3-ai | wave 1 — in progress |
| 5 TV view | phase/5-tv | wave 1 — in progress |
| 2 MCP + widget | phase/2-mcp | wave 2 — not started |
| 7 voice ID | phase/7-voiceid | wave 2 — not started |
| 4 device + assistant | phase/4-device | wave 3 — not started |
| 6 polish/submission | phase/6-polish | wave 4 — not started |

## Human-only items (🧑)
- AWS account + Bedrock model access + `aws configure` (none on the build machine yet). Set `AI_MODE=bedrock`,
  `ASSISTANT_MODE=bedrock`, `BEDROCK_MODEL_ID`, `AWS_REGION` once available.
- Optional: Node 24, Alexa+ Local Inspector access, OBS recording, YouTube upload, Devpost submission.

## Challenges + workarounds so far
- No AWS creds → fallback/offline modes are first-class; Bedrock paths tested with mocks.
- `@alexa-ai/addon-local-inspector` 404 on npm → MCP Inspector + basic-host + own device sim.
- Node 22 instead of 24 → fine for MCP SDK v2 (protocol 2025-11-25 confirmed in `@modelcontextprotocol/core`).
- TypeScript resolved to 7.0.2 (native compiler); typecheck works.
