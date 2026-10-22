# Benchwarmers — conventions for agents

Alexa+ add-on (hackathon): one-night fantasy draft + live pick'em by voice. Spec: `plan.md`.
Orchestration + phase status: `docs/ORCHESTRATION.md`. Resume point: `docs/HANDOFF.md`.

## Layout
- `server/` Node 22+, TypeScript strict, Express 5, ESM (`"type": "module"`, NodeNext → import local files with `.js` suffix).
  - `src/shared/types.ts` — **the contract**. Read-only for phases; only the lead edits it.
  - `src/game/` engine (pure), store (memory + JSON file), seed, `games/harbor-vs-summit.json`.
  - `src/api/` REST under `/api`. `src/mcp/` MCP server (Streamable HTTP, stateless) + widget.
  - `src/ai/` AI content (fallback JSON + Gemini + Bedrock). `src/assistant/` device assistant loop.
  - Tests: `server/test/**/*.test.ts` (vitest). `npm test -w server`, `npm run typecheck -w server`.
- `web/` Vite + React 19 + react-router 7. Routes: `/tv/:code` (original TV, default), `/tv2/:code` (scorebook redesign, `web/src/tv-broadcast`), `/lounge/:code`, `/watch/:code`, `/control/:code`, `/welcome`, `/device/:household`, `/voice-lab`. `extension/` = YouTube overlay (MV3).
  - Look: Lounge palette/type/logo app-wide — tokens `web/src/brand/brand.css` (`--lg-*`), logo `web/src/brand/Brand.tsx`. Use them for new UI.
  - Import contract types via `@shared/types`. Dev proxy: `/api`, `/mcp` → `http://localhost:3001`.
- `docs/` FRICTION_LOG, PRODUCT_FEEDBACK, AWS, DEMO_SCRIPT, SUBMISSION, ORCHESTRATION, HANDOFF.

## Fixed ids (seed data; UIs and tests rely on them)
- Crew `sunday-crew` "Sunday Crew". Households: `garcias` "The Garcias" (Austin): members `maya` Maya, `leo` Leo;
  `sams-place` "Sam's Place" (Seattle): `sam` Sam, `priya` Priya.
- Demo party code `DEMO` (game `harbor-vs-summit`), created by seed, status `drafting`.
- Ports: server 3001, web 5173. (8000 is taken on this machine.)

## Rules
- TypeScript strict; vitest; **cross-platform npm scripts** (Windows PowerShell; `cross-env`, no bash-only syntax).
- No real money / wagers / "bet" language, no Amazon/Alexa logos in our UI. Committed demo and seed data stays fictional (no real teams or leagues); real games come only from the runtime importer (`server/src/live`, `POST /api/games/import`, owner request 2026-10-22), cached under gitignored `server/data/imported-games/`. Never commit real ESPN payloads.
- MCP tools must answer < 500 ms and never call Bedrock synchronously (AI runs in the background worker).
- `AI_MODE=fallback` and `ASSISTANT_MODE=offline` must always work with zero AWS credentials.
- Root `.env` loads at server startup; shell variables win. Gemini keys stay server-side. Setup: `docs/GEMINI.md`.
- When a tool/SDK/doc misbehaves, append to `docs/FRICTION_LOG.md` using the template there.
- Commits: `phase N: <summary>` (one per task is fine). Never weaken a test to get green.
- Windows: Node on PATH is a bundled v22; use Git Bash for npm commands with `--`.
