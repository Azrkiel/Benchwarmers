# Benchwarmers — Build Plan for Claude Code (Alexa+ track)

> Scope update (2026-10-23): main Alexa+ track only. Current modes are Gemini and fallback/offline. Obsolete integration plans have been removed; historical counts below describe their original runs. Use README.md for current setup.

> **STATUS (2026-10-20, Claude session 2)** — branch `dev` @ GitHub. Legend: ✅ done · 🟡 partial · ⬜ not started · 🔀 owned by Codex.
> | Phase | Status |
> |---|---|
> | 0 Environment | 🟡 done except 🧑 items (OBS, Local Inspector not on npm) |
> | 1 Engine, store, REST | ✅ merged (`phase/1-engine`) |
> | 2 MCP server + MCP App | ✅ merged (`phase/2-mcp`, `phase/2b-mcp-hosts`); verified in Inspector, ext-apps basic-host, cloudflared tunnel (docs/MCP_HOSTS.md) |
> | 4 Simulated device + assistant | ✅ merged (`phase/4a-assistant`, `phase/4b-device`); Checkpoint 4 passed headless (sync 0.98 s); real mic untested |
> | 5 TV view | ✅ merged (`phase/5-tv`, `phase/5b-tv-polish`); 🔀 further TV work is Codex's |
> | 6 Polish + submission | ✅ merged (`phase/6-polish`): `npm run demo` (fresh clone → running in ~35 s), README, DEMO_SCRIPT, PRODUCT_FEEDBACK, SUBMISSION draft; 🧑 video + Devpost links TODO |
> | 7 (added) Voice ID — no "I'm Maya" needed | ✅ merged (`phase/7-voiceid`, `phase/7b-voiceid-tuning`), wired into device page; real-mic untested |
> | 8 (added) Drive odds model — real-data odds per question + points multiplier | ✅ built session 3 (2026-10-21): 8a odds table (64,085 drives), 8b bonuses (both games), 8c football game `riverton-vs-ironwood`; TV football view is Codex's (gap list in HANDOFF) |
> Full resume notes: `docs/HANDOFF.md`. Orchestration/ownership: `docs/ORCHESTRATION.md`.

> **How to use this file:** put it at the root of an empty repo, open Claude Code there, and say:
> *"Read PLAN.md. Do Phase 0 checks, then build phase by phase. Stop at each checkpoint, run its verification, commit, and continue."*
> Items marked **🧑 HUMAN** need you. Claude Code should list them and keep working on everything else.

---

## 1. What we're building

**Benchwarmers** is an Alexa+ add-on for watching sports with friends: a free-to-play one-night fantasy league plus live "pick'em", played by voice.

- **Mini fantasy draft:** before tip-off, each person drafts 3 players from the fictional rosters by voice ("I'm Maya, draft Harbor's point guard"). Drafted players score from real game events. **Night score = draft points + live pick points.**
- **Big-screen standings:** a TV view showing who's on top, live standings, and everyone's roster, updating as plays happen.
- **Household-aware:** "I'm Sam, put me down for the Hawks." Each person on the couch has their own picks and streaks.
- **Watch-along across cities:** two households share one watch party and see each other's picks on a shared leaderboard.
- **Remembers you across sessions:** streaks, season standings, and watch-party crews persist, so "How am I doing this season?" works next week.
- **Agentic, not single-turn Q&A:** "Set up a watch party for Sunday's game with the Seattle crew" creates the party, invites the other household, and schedules props.
- **Visual on Echo Show-style screens:** an **MCP App** leaderboard / pick card renders in the conversation view.
- **No real money, ever.** No wallets or wagers. "Odds" are info-only probabilities.

**Hackathon:** Build, Ship, Shape (Devpost). Deadline **Friday Oct 23, 2026, 12:00 PM PT**. Submit by **10:00 AM PT**.
- Primary track: **Alexa+**. The submission focuses only on this track.

### What judges reward (from the rules) and how we hit it
| Judges call "obvious" | Judges call "creative" | Benchwarmers |
|---|---|---|

### Hard requirements (do not violate)
1. A **self-hosted MCP server, spec 2025-11-25 or later, over Streamable HTTP**, actually imported and called in code. Demo video must show it working.
2. Repo contains all source + setup/run instructions. **Public + MIT license.**
3. Demo video < 3 min, public on YouTube/Vimeo, English, **no third-party trademarks or copyrighted footage/music**. Use fictional teams. **Don't use Alexa/Amazon logos** in our own UI; describe it as "an Alexa+ add-on" in narration only.
4. Product feedback for every tool used. Keep `docs/FRICTION_LOG.md` from minute one (up to **10% judging bonus**).

---

## 2. Architecture

```
                         ┌───────────────────────────────────────────┐
                         │ server/  (Node 24, TypeScript, Express)   │
  MCP hosts              │  • /mcp  Streamable HTTP, stateless       │
  ─────────              │     tools + MCP App widget (ui://)        │
  • sim/ voice device ──▶│  • /api  REST for the TV view    │
  • MCP Inspector     ──▶│  • game engine: clock, props, scoring     │
  • ext-apps basic-host─▶│  • store: JSON file (persists sessions)   │
  • Alexa Local Insp. ──▶│  • ai worker ──▶ Gemini (optional)  │
    (optional)           │  • /api/assistant: text → Gemini         │
                         │      tool-use → MCP client → /mcp         │
                         └───────────────────────────────────────────┘
  web/  (Vite, one app, two routes)
   • /device/:household   simulated Alexa+ screen device: mic → /api/assistant,
                          speaks reply, renders MCP App widget via app-bridge
   • /tv/:code            big-screen TV view: leader spotlight, standings, rosters,
                          simulated broadcast (shown on any TV via HDMI / cast / browser)
```

**Key decisions:**
- **MCP tools never call model providers synchronously.** Alexa+ requires MCP round-trip latency **< 500 ms**. A background worker pre-generates props, explanations, and recaps; tools read cached state.
- **Server owns the game clock.** All clients compute game time from `serverNow`, so both households see props open and lock at the same moment.
- **Persistence:** a JSON file store (`data/store.json`), written on each change. Enough for "state across sessions" without a database.
- **Deterministic demo mode:** `AI_MODE=fallback` uses committed JSON so the demo works with zero cloud spend.
- **Two households = two browser windows** (Austin and Seattle), each a `/device/:household` page.

---

## 3. Repo layout

```
benchwarmers/
├── PLAN.md  CLAUDE.md  README.md  LICENSE (MIT)
├── server/
│   ├── src/
│   │   ├── index.ts              # /api, /mcp, /healthz
│   │   ├── shared/types.ts
│   │   ├── game/engine.ts        # pure functions, unit-tested
│   │   ├── game/store.ts         # in-memory + JSON persistence
│   │   ├── game/games/harbor-vs-summit.json
│   │   ├── api/routes.ts
│   │   ├── mcp/server.ts         # createServer(): tools, prompts, app resource
│   │   ├── mcp/http.ts           # Streamable HTTP wiring + bearer auth
│   │   ├── mcp/widget/           # MCP App View (vite singlefile → dist/benchwarmers.html)
│   │   ├── ai/gemini.ts  ai/worker.ts  ai/fallback/*.json
│   │   └── assistant/route.ts    # Gemini tool-use loop over MCP client
│   └── test/
├── web/                          # Vite + React: /device and /tv
└── docs/  FRICTION_LOG.md  PRODUCT_FEEDBACK.md  DEMO_SCRIPT.md  SUBMISSION.md
```

---

## 4. Phase 0 — Environment (Monday)

### 🧑 HUMAN steps (all free)
1. Install **Node 24** (nvm-windows), **Git**, **Chrome**, **Yarn/corepack**, **OBS Studio** (screen recording).
2. **cloudflared** for a free public HTTPS URL to your local server: `winget install Cloudflare.cloudflared`.
3. **MCP Apps skills for Claude Code** (inside Claude Code):
   ```
   /plugin marketplace add modelcontextprotocol/ext-apps
   /plugin install mcp-apps@modelcontextprotocol-ext-apps
   ```
4. *(Optional, free)* **Amazon Developer account** → try the **Alexa+ Local Inspector** Getting Started guide (needs Node 24+, `@alexa-ai/addon-local-inspector`). It renders your MCP widget inside Alexa device frames, which is great footage for the video. If access is gated, skip it.
5. *(Optional)* **Amazon Devices Builder Tools** for docs search in Claude Code:
   `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli`

### 🤖 Claude Code tasks
- Scaffold the layout, `LICENSE` (MIT), `.gitignore` (ignore `data/`, `.env`), `.env.example`, `CLAUDE.md` with conventions:
  - TypeScript strict; vitest; **cross-platform npm scripts** (Windows PowerShell; use `cross-env`, no bash-only syntax).
  - No real money, real teams/leagues, or Amazon/Alexa logos.
  - Append to `docs/FRICTION_LOG.md` (template §11) whenever a tool, SDK, or doc misbehaves.
  - Commit at each checkpoint: `phase N: <summary>`.
- Verify: `node -v` (>=22), `cloudflared --version` if using a tunnel.

**Checkpoint 0:** checks pass or blockers logged with workarounds.

> **Status 🟡:** scaffold, MIT, .gitignore, .env.example, CLAUDE.md, FRICTION_LOG done. Node is v22 (not 24; MCP SDK fine).
> `@alexa-ai/addon-local-inspector` → npm E404 (logged). MCP Apps Claude Code plugin not installed (not needed: ext-apps cloned for reference).

---

## 5. Phase 1 — Game engine, store, REST (Monday night)

### Types (`shared/types.ts`)
```ts
type Player = { id: string; teamId: string; name: string; number: number;
                position: 'PG'|'SG'|'SF'|'PF'|'C'; nickname?: string };          // fictional
type Team = { id: string; name: string; short: string; color: string; roster: Player[] };
type StatType = 'pts2'|'pts3'|'ft'|'reb'|'ast'|'stl'|'blk'|'tov';
type GameEvent = { t: number; type: 'score'|'play'|'foul'|'timeout'|'period';
                   team?: 'home'|'away'; points?: number; text: string; tags: string[];
                   playerId?: string; stat?: StatType; assistPlayerId?: string };
type Game = { id: string; title: string; home: Team; away: Team; durationSec: number;
              scheduledFor?: string; events: GameEvent[] };
type DraftPick = { partyId: string; memberId: string; playerId: string; round: 1|2|3; at: number };
type FantasyRow = { memberId: string; playerId: string; points: number; statLine: string };
type PropOption = { id: string; label: string; probability?: number };       // info only
type ResolverSpec =
  | { kind: 'nextScoreType'; afterT: number }
  | { kind: 'teamScoresFirst'; afterT: number; untilT: number }
  | { kind: 'totalPointsOver'; atT: number; line: number };
type Prop = { id: string; gameId: string; question: string; options: PropOption[];
              opensAt: number; locksAt: number; resolvesAt: number; resolver: ResolverSpec;
              correctOptionId?: string; explanation?: string; source: 'ai'|'fallback' };
type Member = { id: string; name: string; avatar: string };
type Household = { id: string; name: string; city: string; members: Member[] };
type Crew = { id: string; name: string; householdIds: string[] };              // persists
type WatchParty = { id: string; code: string; crewId: string; gameId: string;
                    startedAt?: number; status: 'scheduled'|'drafting'|'live'|'final'; version: number };
type Pick = { partyId: string; memberId: string; propId: string; optionId: string;
              at: number; source: 'voice'|'screen' };
type SeasonStats = { memberId: string; points: number; bestStreak: number;
                     currentStreak: number; correct: number; total: number; partiesPlayed: number;
                     fantasyPoints: number; nightsWon: number; bestDraftPick?: string };
type StandingRow = { memberId: string; name: string; household: string; rank: number;
                     prevRank: number; total: number; draftPoints: number; pickPoints: number;
                     streak: number; roster: FantasyRow[] };
```

### Engine rules (pure, unit-tested)
- `gameT = clamp((now - startedAt)/1000 * SPEED, 0, durationSec)`; `SPEED` env (demo: 4).
- Prop lifecycle `upcoming → open → locked → resolved`; picks only while open; latest pick per member wins until lock.
- Resolution evaluates `ResolverSpec` against events.
- Pick scoring: 10 pts × streak multiplier (1 → 1.5 → 2 cap); wrong answer resets the streak.
- **Draft rules:** party status `drafting` until tip-off. Each member drafts **3 players**; a player can be owned by only one member per party (first come, first served; no snake order, keeps voice simple). Undrafted slots at tip-off are auto-filled with the best remaining player by position ("the bench fills in for you", on brand).
- **Fantasy scoring** (computed from events up to `gameT`): 2PT = 2, 3PT = 3, FT = 1, REB = 1.2, AST = 1.5, STL = 3, BLK = 3, TOV = −1. Put the table in one config object.
- **Standings:** `total = draftPoints + pickPoints`; keep `prevRank` so the TV can animate movement. Tiebreak: draft points, then earliest last pick.
- **Season stats** accumulate across parties (the cross-session hook), including nights won and best draft pick.
- `version` bumps on any state change.

### Content
- Scripted game *Harbor Hawks vs. Summit Foxes*: ~8 game-minutes (2 real minutes at SPEED=4), ~60 events, **every scoring/stat event attributed to a player** so fantasy points move.
- Fictional rosters: 8 players per team with names, numbers, positions, and a fun nickname each (helps voice drafting: "draft Big Mo"). Script the game so 2–3 players have big nights and one drafted star has a cold night (drama for the video).
- 8 hand-written fallback props (all resolver kinds) with plain-language explanations; fallback recap template.
- Seed: crew "Sunday Crew" = *The Garcias (Austin)*: Maya, Leo + *Sam's Place (Seattle)*: Sam, Priya. Seed a few past parties so season stats aren't empty.

### REST (`/api`) for the web app
`GET /parties/:code/state?householdId=&since=` (score, clock, recent events, active/last prop, picks, **standings with rosters**, **draft board**, ticker, `serverNow`, `version`) · `POST /parties/:code/draft` · `POST /parties/:code/picks` · `POST /parties/:code/start` · `POST /parties/:code/reset` · `GET /crews/:id/season` · `GET /healthz`.

> **Status ✅** (phase/1-engine): engine.ts, store.ts (AiSink, tick, JSON persistence, reset), seed.ts, 60-event game, 8 fallback props with
> outcome-matched explanations, REST incl. extra `GET /api/crews/:id/current` and `POST /api/parties`, `npm run play -w server`.
> Deviations: `since`==version → 204; PropView hides answer until resolved; picks also sent for locked props.

**Checkpoint 1:** `npm test` green (lifecycle, lock enforcement, each resolver, streaks, draft ownership + auto-fill, fantasy scoring per stat, standings ranks/tiebreaks, season accumulation, persistence round-trip). A Node script plays a full party with scripted picks and prints standings.

---

## 6. Phase 2 — MCP server + MCP App (Tuesday) ← the core of the submission

### Packages (MCP TypeScript SDK v2 — required peers of MCP Apps)
```powershell
cd server
npm i @modelcontextprotocol/server@^2 @modelcontextprotocol/node@^2 @modelcontextprotocol/express@^2 `
      @modelcontextprotocol/client@^2 @modelcontextprotocol/ext-apps zod@^4.2 cors express
npm i -D vite vite-plugin-singlefile cross-env tsx typescript
```
- **Verify protocol version:** find the SDK's supported-protocol-versions constant and confirm **2025-11-25** (or later) is included. Write the exact version into README. If not, log friction and pick the SDK release that supports it.

### HTTP (`mcp/http.ts`)
- Stateless Streamable HTTP: per request, `createServer()` + `new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` → `server.connect(transport)` → `transport.handleRequest(req, res, req.body)`; close both on `res.on('close')`. Mount with `createMcpExpressApp`, `app.all('/mcp', ...)`.
- **Auth like Alexa+ expects:** require `Authorization: Bearer <MCP_TOKEN>`; missing/invalid → **401 with no `WWW-Authenticate` header**. README notes real Alexa+ onboarding uses OAuth/OIDC and Private Preview access (known gap).
- Latency test: every tool < 500 ms (vitest timing).

### Tools — descriptions written so an LLM host routes voice requests correctly
| Tool | Input | Behavior |
|---|---|---|
| `setup_watch_party` | `{crewName, gameTitle?, when?}` | **multi-step:** resolves crew, picks game, creates party, queues AI prop generation, returns invite summary + code |
| `join_watch_party` | `{code, householdName}` | adds household to the live party |
| `list_available_players` | `{code, team?, position?}` | undrafted players with nickname, position, a one-line AI scouting note |
| `draft_player` | `{code, memberName, player}` | fuzzy-matches name/nickname/number/position+team ("Harbor's point guard"); rejects if taken and suggests 2 alternatives — **MCP App UI** (draft board) |
| `get_my_roster` | `{code, memberName}` | roster with live fantasy points + stat lines |
| `start_watch_party` | `{code}` | closes the draft (auto-fills empty slots) and starts the clock |
| `get_game_status` | `{code}` | score, clock, last 3 plays, active prop + seconds to lock |
| `make_pick` | `{code, memberName, choice, propId?}` | fuzzy-matches choice to option ("the over", "Hawks"); defaults to active prop; `source:'voice'` |
| `get_leaderboard` | `{code}` | tonight's standings (draft + pick points) — **MCP App UI** |
| `get_season_standings` | `{crewName, memberName?}` | cross-session stats — **MCP App UI** (same widget, season tab) |
| `explain_last_result` | `{code}` | cached plain-language explanation |

- Also register one **MCP prompt** (`watch_party_host`) describing how to run a party, and a **resource** `benchwarmers://rules`.
- Errors are friendly tool errors ("Picks are locked. The next question opens in about 20 seconds.").
- Ambiguous `memberName` → ask which household. (Pitch: Alexa voice ID could fill this in automatically.)

### MCP App widget (`mcp/widget/`)
- Use the installed `add-app-to-server` skill, or the quickstart pattern:
  `registerAppTool(server, 'get_leaderboard', { ..., _meta: { ui: { resourceUri: 'ui://benchwarmers/board.html' } } }, handler)` and `registerAppResource(server, uri, uri, { mimeType: RESOURCE_MIME_TYPE }, readHtml)`.
- View (`App` from `@modelcontextprotocol/ext-apps`): set `app.ontoolresult` before `app.connect()`. One widget, three tabs chosen by which tool returned: **Draft board** (available/taken players), **Tonight** (standings, active pick card with countdown), **Season**. Household badges, streak flames. Buttons call `app.callServerTool('make_pick', ...)` so people can tap a pick too.
- Bundle with Vite + `vite-plugin-singlefile`. Must look right at Alexa's two breakpoints (≤10" and ≥11" screens): large type, high contrast, no hover-only UI.

### Test it
```powershell
npx @modelcontextprotocol/inspector         # http://localhost:3001/mcp + Bearer header
git clone https://github.com/modelcontextprotocol/ext-apps; cd ext-apps; npm i; cd examples/basic-host; npm start
#   → http://localhost:8080 renders the widget
cloudflared tunnel --url http://localhost:3001   # free public HTTPS URL
# optional: addon-local-inspector https://<tunnel>/mcp   (renders in Alexa device frames)
```

> **Status ✅** (phase/2-mcp): 11 tools (5 with UI via registerAppTool), prompt `watch_party_host`, resource `benchwarmers://rules`,
> bearer auth (401 without WWW-Authenticate), protocol 2025-11-25 verified, fuzzy matcher (crew/household/member/player/choice),
> widget built by `npm run build:widget -w server` (single 246 kB HTML). Checkpoint 2 flow + latency <500 ms are automated tests.
> Not done: manual run in MCP Inspector / basic-host / cloudflared tunnel. Note: http.ts forces chunked framing (Avast proxy bug, see FRICTION_LOG).

**Checkpoint 2:** In MCP Inspector: `setup_watch_party` → `draft_player` ×3 for Sam and Maya (including a conflict on the same player) → `start_watch_party` → `make_pick` for both → `get_leaderboard` shows draft + pick points. Widget renders in basic-host. Latency test green.

---

## 7. Phase 3 — Generated content

Content uses Gemini or committed fallback templates. Generated questions are validated, text passes guardrails, and a background worker keeps model calls out of the MCP request path. See [Gemini setup](docs/GEMINI.md).

## 8. Phase 4 — Simulated Alexa+ device `web/device` (Wednesday)

The rules allow a simulated Alexa+ experience in a web app; ours also drives the **real** MCP server, so we qualify on both paths.

- `/device/:household` — a generic smart-display frame (our own neutral design, no Amazon branding): wake button + mic, transcript, spoken reply, and a **widget area**.
- Voice in: Web Speech API (Chrome on Windows). Typed input fallback box (for reliability while recording).
- `POST /api/assistant {text, household, history}` → `assistant/routes.ts`:
  - Connect the MCP client to our own server; use the offline router or optional Gemini function calls.
  - Limit generation to three tool rounds and preserve completed results during fallback.
  - Return `{ reply, toolCalls[], uiResource? }` (when a called tool has `_meta.ui.resourceUri`, include it).
- Voice out: `speechSynthesis`.
- **Render the MCP App** in the widget area with `@modelcontextprotocol/ext-apps/app-bridge` (follow `examples/basic-host`). Fallback if time runs short: show the leaderboard as a native React card.
- "Show agent trace" toggle listing tool calls (judges like seeing the agentic flow).
- Demo utterances: "Set up a watch party for tonight's game with the Sunday Crew" · "Who's available at center?" · "I'm Maya, draft Big Mo" · "I'm Sam, put me down for the Hawks scoring first" · "How's my roster doing?" · "Priya takes the over" · "Who's winning in our house?" · "Why did that one go the other way?" · "How am I doing this season?"

> Historical device milestone: `POST /api/assistant` connects the simulated device to our own MCP server. The device includes speech input/output, typed input, an agent trace, and the
> MCP App in a sandboxed srcdoc iframe via app-bridge (live-refreshed from polled state) + native fallback card, voice ID / screen
> speaker picker. Checkpoint 4 passed in headless Chrome (pick in Garcias → Sam's Place iframe in 0.98 s; season answer after restart).

**Checkpoint 4:** Two Chrome windows (Austin and Seattle devices): a voice pick in one appears in the other's widget within ~1–2 s; the season question answers from persisted stats after a server restart.

---

## 9. Phase 5 — Big-screen TV view `web/tv` (Thursday morning)

A web page built for a TV across the room ("10-foot UI"): 1920×1080 layout, huge type, high contrast, readable from the couch. Polls `/api/parties/:code/state?since=` every 1 s; keeps `serverOffset` for smooth countdowns. Present it as the big-screen view of the add-on, not as a Fire TV app.

### Layout
```
┌───────────────────────────────────────────────┬──────────────────────────┐
│  SCOREBOARD  Harbor Hawks 48 – 45 Summit Foxes │  👑 TOP OF THE BENCH     │
│  Q3 4:12                                       │  Maya (Austin)  142.5    │
├───────────────────────────────────────────────┤  roster: Big Mo 31.2 ... │
│                                               ├──────────────────────────┤
│   simulated court (SVG) + play-by-play         │  STANDINGS               │
│   "Big Mo hits a 3! (+3 for Maya)"             │  1 ▲ Maya     142.5 🔥3  │
│                                               │  2 ▼ Sam      138.0      │
│                                               │  3 ─ Priya    120.5      │
├───────────────────────────────────────────────┤  4 ▲ Leo       97.0      │
│  LIVE PICK: Next score a 3? ⏱ 0:12  Yes 41% │ No 59%  │  friends ticker  │
└───────────────────────────────────────────────┴──────────────────────────┘
```

### Modes (auto-rotate every 20 s when nothing is happening; jump to the relevant one on events)
1. **Draft night** (status `drafting`): draft board grid of all 16 players; drafted ones flip to show owner's avatar + household color; "on the clock" banner when someone is talking.
2. **Live** (layout above): leader spotlight with crown, standings with **▲▼ rank-change animations** (FLIP animation on reorder), draft vs pick points as a split bar per person, fantasy point pop-ups ("+3 Maya") on player events.
3. **Rosters:** 4 columns, one per member: their 3 players with live stat lines and points; the worst performer gets a 🪑 "benchwarmer" tag.
4. **Final:** podium (1–2–3), AI recap text, "Benchwarmer of the night" (lowest drafted player), season standings table.

### Getting it onto a real TV (free)
- HDMI cable from the laptop, Chrome full-screen (F11); or
- Chrome → **Cast… → Cast tab** to any Chromecast / Google TV; or
- Open the cloudflared URL in a smart TV's built-in browser.
- Add a `?kiosk=1` param: hides the cursor, disables scrollbars, auto full-screen on first click.

> **Status ✅** (phase/5-tv + 5b): Draft/Live/Rosters/Final modes, fixtures (`?fixture=`), `?mode=`, `?kiosk=1`, `/tv/latest?crew=`,
> FLIP standings, pops, locked-prop card. Verified against the real server. 🔀 Further TV changes belong to Codex.

**Checkpoint 5:** `/tv/DEMO` runs a full party: draft board fills as people draft by voice, standings reorder with animations during the game, final podium shows the recap.

---

## 10. Phase 6 — Polish + submission (Thursday afternoon → Friday 10 AM PT)

- `npm run demo` (root): starts server (SPEED=4, seeded data) + web + prints the cloudflared command. `POST /reset` between takes.
- **README:** what/why, architecture diagram, MCP protocol version, run steps on Windows/macOS/Linux, env table, how to connect MCP Inspector / basic-host / Local Inspector, demo mode, known gaps (Alexa+ Preview onboarding, OAuth).
- **Recording (free):** OBS on Windows. Scene: TV view (large), Austin device and Seattle device (small, side by side). If you can get the TV view onto a real TV (dorm/common room), shoot 10 seconds of it on your phone for the intro. Use a USB headset mic for clean speech recognition. Record 2–3 takes; keep the best.
- **docs/DEMO_SCRIPT.md** (≤ 2:50):
  1. 0:00–0:20 Problem: friends in different cities can't share the game night.
  2. 0:20–0:45 "Set up a watch party…" → agent trace shows multi-step tool calls; invite appears in Seattle.
  3. 0:45–1:10 Draft night: "Who's available at center?" → "Draft Big Mo" → Sam tries to draft the same player and gets alternatives; draft board fills on the TV view.
  4. 1:10–1:50 Live: voice picks from both households, synced lock, fantasy pop-ups ("+3 Maya"), standings reorder on the TV view.
  5. 1:50–2:15 Final podium + AI recap ("Benchwarmer of the night"); "How am I doing this season?" (cross-session memory).
  6. 2:15–2:30 Same server in MCP Inspector / Local Inspector: real MCP 2025-11-25 over Streamable HTTP, MCP App widget.
  7. 2:30–2:50 Architecture slide (MCP + MCP Apps + optional Gemini) and the "official broadcast sync" vision line.
- **docs/PRODUCT_FEEDBACK.md** per tool (MCP TS SDK v2, MCP Apps/ext-apps, MCP Inspector, Alexa+ docs/Local Inspector, cloudflared): used for / worked / needs work / onboarding / build again? Draft from the friction log.
- **docs/SUBMISSION.md:** all submission fields drafted for the main Alexa+ track only.
- **Repo public with MIT license** visible in GitHub's About panel (no collaborator invites needed).

> Historical milestone: submission polish and the combined demo launcher were the remaining tasks.

**Done:** fresh clone → README → working demo in < 15 minutes; video public; submitted by Friday 10:00 AM PT.

---

## 10b. Phase 7 (added by the user) — voice ID instead of saying your name
> **Status ✅ merged + tuned.** `web/src/voiceid/`: mic capture @16 kHz, WavLM x-vector (`Xenova/wavlm-base-plus-sv`, q8, in a
> worker via transformers.js) with MFCC fallback, per-household enrollment (localStorage), nearest-centroid + margin match →
> `SpeakerHint` for `AssistantRequest.speaker`; `/voice-lab` calibration page; docs/VOICE_ID.md. Real-model check passed
> (same 0.79–0.97 vs cross 0.25–0.41). Tuned (phase/7b): threshold 0.70 / margin 0.05,
> loudest-3 s crop, COOP same-origin + COEP credentialless → threaded WASM, instant MFCC guess while WavLM loads; 0.9–2.1 s/clip
> (was 7.4), held-out own-speaker ≥0.80. Wired into the device page (phase/4b).

## 10c. Phase 8 (added by Kevin, 2026-10-20) — Drive odds model

> **Status ✅ built 2026-10-21** (phases 8a/8b/8c, see docs/ORCHESTRATION.md §5b). No two-minute drive questions (too little game time). Source: "Drive Odds Model Plan" (Oct 20, 2026, Kevin Jiang). Estimated effort 2–3 h.
>
> **Open questions (lead, before building):**
> 1. ~~Sport mismatch~~ **Decided 2026-10-20 (user): add a second, football replay game** that uses the NFL odds table; the basketball
>    game `harbor-vs-summit` stays as is (and stays the default `DEMO`). Implications for the build:
>    - Contract (lead): `Player.position` gains football positions (or becomes sport-specific), `Game` gets `sport: 'basketball' | 'football'`,
>      props gain optional `odds {p, multiplier}`; drive state (`yardline_100`, half clock) on football events.
>    - Engine: football event types (drive start/end, TD, FG, punt, turnover), football fantasy scoring, drive props
>      ("Will they score on this drive?" / "…a touchdown?") resolved from `fixed_drive_result`-style events; odds precomputed into the
>      replay JSON per prop (no live lookup).
>    - New fictional game file `server/src/game/games/<football-game>.json` (fictional teams/players, ~8 per team, nicknames for voice).
>    - MCP tools/widget, assistant router, device fallback card: show football positions and drive props; `setup_watch_party` takes a game.
>    - TV view (`web/tv/**`) is Codex's — football rendering there needs Codex; until then the TV must at least not break on a football game.
> 2. ~~Bonuses that don't exist yet~~ **Decided 2026-10-20 (user): define and add them** — speed buckets + contrarian bonus, see
>    "Scoring bonuses" below. They apply to **both** games (basketball and football), not only drive props.
> 3. **Wording.** Rules say no real money / wager language: call it a **points multiplier**, not a payout, in UI and voice copy.
>    Real-league data is fine as a statistics source; the UI still shows only fictional teams.
> 4. **Contract.** A per-question probability + multiplier on `Prop`/`PropView` is a change to `server/src/shared/types.ts` (lead-owned).

### Goal
Build a lookup table that answers "how often do drives like this one end in points?" and save it as a JSON file. The game server
reads it to put a percentage on each question and adjust the points multiplier. Fits in one evening.

### 1. Get the data
nflverse play-by-play data: free, every play since 1999, hosted on GitHub.
- Seasons **2015–2025**: recent enough to reflect how the game is played now, tens of thousands of drives.
- Tool: a Python script using the `nflreadpy` package. Fallback: download the season files directly from the nflverse-data releases
  on GitHub.

### 2. Reduce to one row per drive
Group plays by game and drive, keep the first play of each drive, and pull:

| Column | What it holds |
|---|---|
| `yardline_100` | Yards from the end zone where the drive starts |
| `half_seconds_remaining` | Time left in the half |
| `fixed_drive_result` | How the drive ended: touchdown, field goal, punt, turnover, end of half, … |

Drop drives with missing fields and kneel-down drives at the end of a half (they skew the numbers).

### 3. Label outcomes
- `scored`: the drive ended in a touchdown or field goal.
- `td`: the drive ended in a touchdown.

Both labels → "Will they score?" and "Will they get a touchdown?" with no extra work.

### 4. Bucket and count
- Field position: 10-yard bands, from own 1–10 up to the opponent's red zone.
- Clock: two states — `normal`, and `two-minute` (under 120 s left in the half).
- Per bucket store `p_score`, `p_td`, `n` (drives). Buckets with fewer than ~200 drives merge into a neighbour so a thin sample
  doesn't distort the odds.
- Skip score difference for now: it helps accuracy but multiplies the bucket count; not worth it before the deadline.

### 5. Sanity checks
- [ ] Scoring odds rise steadily as the drive starts closer to the end zone. A band that breaks the pattern → look for a filtering bug.
- [ ] Touchdown odds are always ≤ scoring odds.
- [ ] Spot-check two or three buckets against what you'd expect from watching football.

### 6. Output and wiring
Write `drive_odds.json`, shaped like:
```json
{ "40-49|normal": { "p_score": 0.42, "p_td": 0.25, "n": 1234 } }
```
- Game server: add `getOdds(yardline_100, half_seconds_remaining, type)` to look up the right bucket.
- Demo: precompute the odds for each question in the replay JSON so nothing is calculated live (keeps MCP tools < 500 ms).
- Points multiplier for correct picks stacks with the speed buckets and the contrarian bonus (see open question 2):

  `multiplier = clamp(0.5 / p_pick, 0.5, 2.0)`

  e.g. a 25 % pick → ×2.0, a 50 % pick → ×1.0, an 80 % pick → ×0.625.

### Scoring bonuses (speed buckets + contrarian), stacked with streak and odds
Today a correct pick scores `PICK_BASE_POINTS (10) × STREAK_MULTIPLIERS[streak]` (`[1, 1.5, 2]`, `server/src/shared/types.ts`, tallied in
`tallyPicks` in `server/src/game/engine.ts`). Phase 8 adds three more factors. Wrong picks still score 0 and reset the streak.

**1. Odds multiplier** (football drive props only; every other prop = ×1.0)
`odds = clamp(0.5 / p_pick, 0.5, 2.0)`, where `p_pick` is the precomputed probability of the option the member picked
(`p_score` / `1 − p_score`, `p_td` / `1 − p_td`). Stored on the prop in the replay JSON; never computed live.

**2. Speed bucket** — reward calling it early. `f = (pickGameT − opensAt) / (locksAt − opensAt)` using the game clock at the time of
the member's **last** change to that pick (changing your mind moves you to a later bucket).

| Bucket | When (`f`) | Factor | Copy (voice/UI) |
|---|---|---|---|
| Early | `f ≤ 0.25` | ×1.25 | "Early call" |
| On time | `0.25 < f ≤ 0.60` | ×1.10 | "Quick call" |
| Late | `f > 0.60` | ×1.00 | — |

**3. Contrarian bonus** — reward going against the room. Computed at resolution over everyone in the party who picked that prop
(all households). `share` = fraction of pickers who chose the same option as this member.

| Case | Condition | Factor | Copy |
|---|---|---|---|
| Lone call | only picker of that option and ≥ 3 pickers total | ×1.50 | "Lone call" |
| Minority | `share < 0.5` and ≥ 2 pickers total | ×1.20 | "Against the room" |
| Crowd | otherwise (incl. a single picker) | ×1.00 | — |

**Stacking and caps**
`points = round_half(PICK_BASE_POINTS × streak × odds × speed × contrarian)`, with the combined factor `streak × odds × speed ×
contrarian` capped at **×5** (max 50 points per pick) so one lucky pick can't decide the night. `round_half` rounds to the nearest 0.5.
- Example: Maya is on a 2-pick streak (×2), picks "No score" on a drive where `p_pick = 0.35` (odds ×1.43), at `f = 0.2` (×1.25),
  and she is the only one of 4 pickers on that side (×1.5): factor 5.36 → capped ×5 → **50 points**.
- Example: Leo, no streak (×1), basketball prop (×1), late (×1), with the crowd (×1): **10 points**, same as today.

**Build notes (when Phase 8 is built)**
- Contract (lead): `Pick` gains `gameT` (game clock at last change; `at` is wall-clock ms today, `opensAt`/`locksAt` are game
  seconds); `Prop` gains optional `odds: Record<optionId, number>` (p per option); `PickTally`/standings expose a per-pick breakdown
  `{base, streak, odds, speed, contrarian, points}` so the TV, widget and assistant can say *why* ("Early call ×1.25, Lone call ×1.5").
- Engine: extend `tallyPicks`; contrarian needs all picks for the prop (the party's picks, not only the member's).
- Existing tests with fixed pick totals (play script "Benchwarmer of the night", season seed) will change — update expectations
  deliberately, don't weaken them; add unit tests for each bucket edge (`f = 0.25`, `0.60`; `share = 0.5`; 2 vs 3 pickers; cap).
- Assistant/voice: mention at most one bonus per reply ("Lone call — 15 points").
- No wager language: "points", "multiplier", "call" — never "payout", "odds boost", "bet".

### Later: questions mid-drive
The same data supports questions asked partway through a drive: use every play instead of only the first play of each drive, and add
down and distance to the bucket key → "3rd and 7 at midfield — will they score?" A nice touch for the pitch if there's time Thursday.

## 11. Friction log template
```md
### [YYYY-MM-DD HH:MM] <short title>
- Tool/SDK + version:
- Task attempted:
- Steps taken:
- Expected vs actual:
- Severity: Blocker | Major | Minor
- Workaround:
- Suggestion: <specific, actionable>
```

## 12. Cut list (drop in this order)
2. TV view Rosters mode + auto-rotation → Draft, Live, and Final modes only
3. app-bridge rendering in the sim → native React card (keep the real MCP App shown in basic-host)
4. Local Inspector
5. AI-generated props and scouting notes → committed fallback content
6. Rank-change animations → static reorder
7. Season standings (last resort; it's a key "state across sessions" point)
- **Don't cut:** the draft and the TV standings view. They're the hook and the most visual part of the video.

## 13. Reference links
- Hackathon: https://amazonappdev2026.devpost.com/ (rules, resources)
- Alexa+ MCP toolkit: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview · quickstart: …/mcp-toolkit-quickstart · Local Inspector: …/mcp-toolkit-local-inspector
- MCP Streamable HTTP (2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
- MCP Apps + quickstart + basic-host: https://apps.extensions.modelcontextprotocol.io/api/ · https://github.com/modelcontextprotocol/ext-apps
