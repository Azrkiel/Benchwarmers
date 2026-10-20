# Orchestration plan (lead session)

Spec: `plan.md`. This file maps the plan onto phase branches, owned files and waves.
Base branch: `dev` (cut from `main`). Each phase: branch `phase/<name>`, worktree under
`%TEMP%\bw-lanes\<name>`, merged into `dev` by the lead after verification. `main` gets `dev` via PR at the end.

```
main ── dev (contract commit)
 wave 1:  phase/1-engine   phase/3-ai   phase/5-tv          (parallel)
          -> merge -> lead integration: AI worker <-> store, index.ts
 wave 2:  phase/2-mcp      phase/7-voiceid                  (parallel)
 wave 3:  phase/4-device   (assistant loop + device page + MCP App bridge + voice-ID hookup)
 wave 4:  phase/6-polish   (README, docs, demo script, submission drafts)
```

Deviations from plan.md (decided by the lead):
- Node 22 (installed) instead of 24. MCP SDK v2 works; Local Inspector package is not on public npm (friction log).
- No AWS credentials on the build machine yet → Bedrock code is built and unit-tested with a mocked client;
  `AI_MODE=fallback` is the default. A rule-based **offline assistant router** (`ASSISTANT_MODE=offline`) drives the
  same MCP tools so the device demo works with zero AWS. With credentials, `ASSISTANT_MODE=bedrock` uses Converse tool-use.
- Extra phase 7: **voice ID**. Each household member enrolls a few seconds of speech on the device; an in-browser
  speaker-embedding model identifies who is talking, so "draft Big Mo" works without "I'm Maya".
- Extra REST: `GET /api/crews/:id/current` → `{ code }` (latest party for a crew) so the TV and devices follow a party
  created by voice.
- `Household.color`, `Game.periods`, `WatchParty.householdIds/createdAt` added to the plan's types.

## Phase briefs

### Phase 1 — engine, store, content, REST (`phase/1-engine`)
Goal: plan.md §5 complete: pure engine, JSON-persisted store, full scripted game, fallback props, seed, REST, tests, play script.
Owned: `server/src/game/**` (engine.ts, store.ts, seed.ts, and the `events` array of `games/harbor-vs-summit.json` —
rosters are fixed), `server/src/api/**`, `server/src/index.ts`, `server/src/ai/fallback/props.json`,
`server/test/game/**`, `server/test/api/**`, `server/scripts/play-party.ts`.
Notes:
- Store implements `AiSink` from the contract (lifecycle events + setters) so the AI worker can plug in later.
- New parties get the 8 fallback props from `ai/fallback/props.json` immediately (each with a hand-written explanation
  that matches the scripted outcome). The first prop opens at t=0 so it can be picked during the draft.
- Server ticks every 500 ms: resolves props, emits lifecycle events, flips `live`→`final` at durationSec, accumulates season stats once.
- REST per plan + `GET /api/crews/:id/current`. `POST /api/parties/:code/reset` restores the party (and season stats) to seed.
- index.ts: Express app factory `createApp()` exported (tests use supertest-free `fetch` against an ephemeral port), `/healthz`, `/api`. Port from `PORT` (3001).

### Phase 3 — AI content + Bedrock (`phase/3-ai`)
Goal: plan.md §7 except store wiring: providers implementing `AiContentProvider`, background worker over `AiSink`, guardrails, docs.
Owned: `server/src/ai/**` except `ai/fallback/props.json`, `server/test/ai/**`, `docs/AWS.md`.
Notes: `bedrock.ts` uses `ConverseCommand`, zod-validated JSON, one retry then fallback, small `maxTokens`, logs token
counts. Worker is started with `startAiWorker(sink, provider)`; never in a request path. Tests use a fake `AiSink` and a
mocked Bedrock client. No AWS credentials exist here — never call AWS in tests.

### Phase 5 — TV view (`phase/5-tv`)
Goal: plan.md §9: `/tv/:code` 10-foot UI with Draft / Live / Rosters / Final modes, polling, FLIP rank animations, kiosk.
Owned: `web/src/tv/**`, `web/src/lib/fixtures/**`, `web/src/lib/usePartyState.ts`.
Notes: works against `PartyStateResponse` only. `?fixture=drafting|live|final` renders committed fixtures without a
server (for development and tests). `/tv/latest?crew=sunday-crew` follows `GET /api/crews/:id/current`.

### Phase 2 — MCP server + MCP App (`phase/2-mcp`, wave 2)
Goal: plan.md §6: stateless Streamable HTTP MCP at `/mcp` with bearer auth, 11 tools, prompt, resource, MCP App widget.
Owned: `server/src/mcp/**`, `server/test/mcp/**`, `server/src/index.ts` (mount only), `server/package.json` (scripts),
additive helper methods in `server/src/game/store.ts`.

### Phase 7 — voice ID (`phase/7-voiceid`, wave 2)
Goal: in-browser speaker identification: enroll members, identify the speaker of an utterance, `/voice-lab` page.
Owned: `web/src/voiceid/**`, `web/package.json`, `docs/VOICE_ID.md`.

### Phase 4 — simulated device (`phase/4-device`, wave 3)
Goal: plan.md §8: `/api/assistant` (Bedrock tool loop or offline router, both via an MCP client to our `/mcp`),
`/device/:household` page with mic, TTS, transcript, agent trace, MCP App rendered through app-bridge, voice-ID speaker hints.
Owned: `server/src/assistant/**`, `server/test/assistant/**`, `server/src/index.ts` (mount only), `web/src/device/**`, `web/package.json`.

### Phase 6 — polish + submission (`phase/6-polish`, wave 4)
Goal: plan.md §10: `npm run demo`, README, PRODUCT_FEEDBACK, DEMO_SCRIPT, SUBMISSION, final e2e smoke.

## Status
See `docs/HANDOFF.md` (kept current after every merge).
