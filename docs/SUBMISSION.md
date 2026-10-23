# Benchwarmers: Devpost submission draft

Copy each section into the matching Devpost field. Items marked **TODO (human)** need a person. Items marked **UNVERIFIED** were never tested on the real thing; keep that wording (or cut the claim) when pasting.

Hackathon: Build, Ship, Shape. Deadline **Fri 2026-10-23 12:00 PM PT**. Submit by **10:00 AM PT**.

---

## Project name

Benchwarmers

## Tagline

A one-night fantasy draft and live pick'em for game night, played by voice, with a leaderboard on the big screen.

(Short alternative: Fantasy sports for the whole couch. Just say who you want.)

## Track

**Alexa+**: an add-on delivered as a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) plus an MCP App widget.
Mini challenges: **AWS Builder** (Amazon Bedrock). **Open Source**: optional, see the note below.

---

## Inspiration

Watching a game with friends is better when everyone has something riding on it, but most fantasy apps are built for season-long leagues, phone screens and spreadsheets. Casual fans, kids and relatives in another city get left out. We wanted the opposite: a game that starts and finishes in one evening, needs no app install, and is played by talking, like you'd talk across the couch.

Two more things pushed the design. People in a room should not have to announce who they are before every request ("I'm Maya, draft..."), so we added on-device voice ID. And the people watching together are often in different cities, so one watch party has to span households.

## What it does

Benchwarmers is a free-to-play, one-night fantasy league plus live pick'em for watching sports. There is no money, no wagers and no real teams. Teams and players are fictional.

- **Mini draft.** Before tip-off, each person drafts 3 players by voice ("Who's available at center?", "Draft Big Mo"). If someone else already took the player, the assistant offers alternatives. Drafted players score from game events.
- **Live pick'em.** During the game, short predictions open and lock on a shared clock (over/under, who scores first, and so on). People answer by voice. Night score = draft points + pick points.
- **Household-aware.** Several people share one speaker. Each has their own picks and streaks. With voice ID, the device can tell who is talking without being told.
- **Watch parties across cities.** Two households (we demo Austin and Seattle) join one party and see each other's picks on a shared leaderboard.
- **Remembers you.** Streaks and season standings persist, so "How am I doing this season?" still works after the server restarts.
- **Agentic.** "Set up a watch party with the Sunday crew" runs several tool calls: create the party, add the crew, schedule props.
- **Visual.** An MCP App widget (draft board, tonight leaderboard, season table) renders in the conversation view of a screen device.
- **Big-screen view.** A TV page (`/tv/:code`) shows the draft board, live standings with rank animations, rosters and a final podium with a recap.

## How we built it

- **MCP server** (Node 22, TypeScript strict, Express 5, official MCP TypeScript SDK). Spec **2025-11-25**, Streamable HTTP, stateless transport, bearer auth. **22 tools**. Watch party (11): `setup_watch_party`, `join_watch_party`, `start_watch_party`, `get_game_status`, `explain_last_result`, `get_my_roster`, `draft_player`, `list_available_players`, `get_leaderboard`, `get_season_standings`, `make_pick`. Football rooms (11): `room_create`, `room_join`, `room_host`, `room_list`, `room_status`, `room_player_pool`, `room_set_lineup`, `room_auto_lineup`, `room_predict`, `room_leaderboard`, `room_season`. Also a `watch_party_host` prompt and two resources, `benchwarmers://rules` and `benchwarmers://room-rules`. Tools answer in under 500 ms.
- **MCP App widget** (`@modelcontextprotocol/ext-apps`), a single-file 246 kB HTML bundle served as a `ui://` resource.
- **Game engine.** Pure functions: server-owned clock, prop lifecycle, three resolvers, streaks, draft with auto-fill, fantasy scoring, standings and tiebreaks, season roll-up. The engine, not the model, decides who is right. State is a JSON file store, so sessions survive restarts.
- **Amazon Bedrock** (Converse API, Claude Haiku tier) in two places. (1) A background worker writes prop wording, plain-language explanations, the end-of-night recap and scouting notes, validated with zod, with one retry and a deterministic fallback. (2) A device assistant loop (`POST /api/assistant`) does tool use against our own `/mcp` through an MCP client, at most 3 rounds. Tools never call Bedrock synchronously, which is how we keep the latency budget.
- **Offline path.** `AI_MODE=fallback` and `ASSISTANT_MODE=offline` run the whole demo with zero AWS credentials: committed JSON content and a rule-based router for the demo utterances.
- **Simulated Alexa+ device** (`/device/:household`): speech in and out, typed fallback, an agent trace toggle, and the real MCP App widget rendered through the app bridge in a sandboxed iframe. Two browser windows act as two households.
- **Voice ID** (`web/src/voiceid/`): 16 kHz capture, WavLM x-vector (`Xenova/wavlm-base-plus-sv`) in a Web Worker through transformers.js, an MFCC fallback and instant first guess, per-member enrollment, nearest-centroid match with threshold 0.70 and margin 0.05. Everything runs on the device; audio and embeddings never go to the server. Output is a `SpeakerHint` passed to the assistant.
- **Process.** Contract-first (one shared types file), per-phase branches with file ownership, parallel agents for backend, TV view and voice ID. `docs/ORCHESTRATION.md` has the details.

Verified numbers (from `docs/HANDOFF.md`):

| Check | Result |
| --- | --- |
| Server tests | 519 passing |
| Web tests | 274 passing |
| MCP tools | 11 |
| MCP protocol negotiated | 2025-11-25 (Inspector, ext-apps basic-host, and a cloudflared tunnel initialize) |
| Voice ID embed time | 0.9-2.1 s per clip (was 7.4 s before tuning) |
| Voice ID separation (headless Chrome, TTS voices) | held-out own-speaker 0.80 or higher |
| Checkpoint 4 (two device windows, headless) | sync 0.98 s; season answer correct after server restart |

## Challenges we ran into

- **No Alexa+ hardware or Local Inspector.** The Local Inspector package is not on the public npm registry (E404). We tested with MCP Inspector, the ext-apps basic-host, a cloudflared tunnel, and our own simulated device.
- **Antivirus rewrote loopback HTTP.** Avast Web Shield corrupted responses on paths ending in `/mcp` (broken chunked encoding). We added a `forceChunked` middleware, and it also intermittently freezes the test runner, so the server suite flakes about 1 run in 8 on that machine.
- **MCP SDK defaults.** `createMcpExpressApp()` turns on DNS-rebinding Host validation that blocks tunnel hostnames, so we mount our own with an optional `ALLOWED_HOSTS`.
- **Voice ID in a browser is slow.** First WavLM load was about 3 minutes and 7.4 s per clip on single-thread WASM. Fixes: crop to the loudest 3 s, COOP/COEP headers for threaded WASM, an instant MFCC guess while WavLM loads. Result: 0.9-2.1 s per clip.
- **Cross-origin isolation vs the MCP App sandbox.** The spec wants a second-origin sandbox proxy for the widget; COEP for voice ID blocks that, so the device uses a single srcdoc iframe. This is a known trade-off, not a spec-complete host.
- **Windows rough edges.** CRLF breaking scripted edits, headless Chrome screenshots firing before polling data arrives, and a hardware-specific port clash.
- **Rate limits for the build itself.** We hit the 5-hour usage limit mid-build with too many parallel agents and had to resume them after reset.

Full detail is in `docs/FRICTION_LOG.md` (and the per-tool write-up in `docs/PRODUCT_FEEDBACK.md`).

## Accomplishments that we're proud of

- A real MCP 2025-11-25 server with 22 tools, a prompt, two resources and an MCP App, passing 742 server tests and 483 web tests, and checked in three independent MCP clients.
- A whole party that plays end to end offline in one command (`npm run play -w server` prints standings and "Benchwarmer of the night: Big Mo"), so judges need no AWS account.
- Two households staying in sync within about 1 s (0.98 s in Checkpoint 4) with identical lock times from a server-owned clock.
- On-device speaker recognition that removes "I'm Maya" from every request, without sending any audio off the device.
- The engine decides correctness and the model only writes words, so a hallucinating model cannot change a score.

## What we learned

- Design for the latency budget first: pre-generate with a background worker and let tools read cached state.
- Keep the model out of the source of truth. Bedrock writes, the engine judges.
- An offline fallback is a feature for demos and judges, not just a safety net. Keep it working at all times.
- Hosts differ. A widget that renders in one MCP host needs to be checked in another, which is why we used three.
- Contract-first with strict file ownership let parallel agents merge with almost no code conflicts.
- On-device ML is feasible in a browser tab, but model load time and WASM threading decide whether it is usable live.

## What's next

- Run against **real Bedrock** (`AI_MODE=bedrock`, `ASSISTANT_MODE=bedrock`) and log token counts.
- Try the add-on on a real Alexa+ device or the Alexa+ Private Preview, including real auth (OAuth) instead of a static bearer token.
- Test voice ID with real microphones and real people, and re-enroll pre-tuning profiles.
- Real broadcast sync: swap the scripted fictional game for an official data feed, where rights allow.
- Split the engine and resolvers into a standalone MIT package (Open Source mini).
- Host the ORT WASM files locally for fully offline voice ID, and shrink the widget and `get_leaderboard` payload (about 34 kB).

## Built with

- Model Context Protocol (spec 2025-11-25, Streamable HTTP)
- MCP Apps (`@modelcontextprotocol/ext-apps` 2.0.3)
- MCP TypeScript SDK (server and client)
- Amazon Bedrock (Converse API, `@aws-sdk/client-bedrock-runtime`, Claude Haiku tier)
- Node.js 22, TypeScript, Express 5
- React 19, Vite, react-router 7
- zod, vitest
- transformers.js / ONNX Runtime Web, WavLM (`Xenova/wavlm-base-plus-sv`), Web Speech API
- cloudflared (tunnel for host testing)
- MCP Inspector
- Google Gemini API (optional dev provider for testing the assistant and content; see `docs/GEMINI.md`; not part of the Bedrock path)
- Claude Code (built largely with agents)

## Links

- Repo (public, MIT): https://github.com/Azrkiel/Benchwarmers
- Demo video: **TODO (human): paste public YouTube/Vimeo URL here after upload** (< 3 min, English, public)
- Devpost project page: **TODO (human): paste URL after creating the draft**
- Docs in repo: `docs/AWS.md`, `docs/MCP_HOSTS.md`, `docs/VOICE_ID.md`, `docs/FRICTION_LOG.md`, `docs/HANDOFF.md`

---

## Track: Alexa+ (add-on via MCP)

How Benchwarmers fits the track:

- It is an add-on shaped as a **self-hosted MCP server**, spec **2025-11-25**, Streamable HTTP, with bearer auth. Missing or bad token returns 401 without `WWW-Authenticate`. Stateless, GET and DELETE return 405.
- It keeps **state across sessions** (streaks, season standings, crews) and runs a **multi-step agentic flow** (set up a party, invite the other household, schedule props).
- It ships an **MCP App** (`ui://` widget) for screen devices.
- Tools respond in under 500 ms; Bedrock work happens in the background.
- UI uses fictional teams and no Amazon or Alexa logos. "Alexa+ add-on" appears only in text and narration.

Verified: protocol negotiation and tool calls through MCP Inspector, ext-apps basic-host (widget rendered at about 800 px and 1280 px), and a cloudflared tunnel `initialize` returning 2025-11-25 (`docs/MCP_HOSTS.md`).

**UNVERIFIED:** a real Alexa+ device or the Alexa+ Private Preview, the widget rendering in a real Alexa host, and voice ID with a real microphone and real people (our test used synthetic TTS voices in headless Chrome). The simulated device is our own page, not Amazon's.

## Mini challenge: AWS Builder (Amazon Bedrock)

What is done (code and tests):

- Bedrock Converse wrapper (`server/src/ai/bedrock.ts`): zod-validated JSON output, one retry, token and latency counters (`getAiUsage()`), safe fallback on error.
- Background worker that generates props, explanations, the recap and scouting notes (`server/src/ai/worker.ts`), guardrails (no money language, fictional teams).
- Device assistant loop (`server/src/assistant/`): Bedrock Converse tool use against our MCP server, at most 3 rounds, falls back to the offline router and never repeats a state-changing call.
- Mocked-Bedrock tests: 71 for the AI layer, 105 for the assistant.
- Cost guard: fallback is the default, per-game caching, small `maxTokens`, planned $5 budget alarm.

What is NOT done (be explicit in the form):

- **Never run against real Bedrock.** There is no AWS account, no Model access and no `BEDROCK_MODEL_ID` set yet. Request and response shapes are modeled on the Converse API and mocked, so real behavior (permissions, inference-profile quirks, tool-use output, empty final text) is unverified.
- The Gemini provider exists only so we could exercise live model behavior before AWS; it does not count as the AWS integration.

Suggested wording for the field: "Benchwarmers uses Amazon Bedrock (Converse API, Claude Haiku-tier) for AI-written game content and for a tool-using assistant over our MCP server. The integration is implemented and tested with mocked Bedrock responses; the offline fallback keeps the demo runnable without AWS." Only change this to "live" after the proof below exists.

Proof checklist for the human (see `docs/AWS.md` Setup):

1. [ ] Create or sign in to an AWS account. Set a **$5 AWS Budgets alarm**.
2. [ ] Bedrock console -> Model access -> enable a Claude Haiku-tier model.
3. [ ] `aws configure` (key, secret, region such as `us-east-1`).
4. [ ] `aws bedrock list-inference-profiles --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic')].inferenceProfileId"`; pick the Haiku profile id.
5. [ ] In root `.env`: `AI_MODE=bedrock`, `ASSISTANT_MODE=bedrock`, `AWS_REGION`, `BEDROCK_MODEL_ID=<profile id>`. Restart the server.
6. [ ] Run Checkpoint 3: create and start a party, confirm AI-written props, an explanation after a resolve, a recap at the end. Run a spoken turn through the device page and confirm `mode: "bedrock"` in the assistant response.
7. [ ] Capture proof: screenshot of the server log with token counts (`AI_LOG` on), the Bedrock invocation metrics or CloudWatch page, and the assistant trace showing `mode: bedrock`. Add token counts to `docs/AWS.md`.
8. [ ] Fix whatever breaks and add a `docs/FRICTION_LOG.md` entry. Then update the wording above.
9. [ ] If time runs out, ship with the honest wording above and keep fallback as the default.

## Mini challenge: Open Source (optional)

Not done yet. The whole repo is public under MIT, but the game engine (`server/src/game/engine.ts` and resolvers) has not been split into its own package or repo. The plan was a separate MIT repo `sports-replay-engine` with its own tests. This is first on the cut list; do not claim the mini challenge unless the split is published before submission.

---

## Human TODO checklist

Deadline Fri 2026-10-23 12:00 PM PT. **Aim to submit by 10:00 AM PT.**

Before recording
- [x] Gemini commits published on `dev`; `dev` merged to `main` (PR #1). Merge phase 6 the same way.
- [ ] Confirm the repo is public with the MIT license showing in GitHub's About panel.
- [ ] Fresh-clone test: README steps -> working demo in under 15 minutes (`npm ci`, `npm run typecheck && npm test`, `npm run play -w server`). Re-run the server tests if they flake.
- [ ] AWS: do the proof checklist above (or decide to ship with the honest wording).
- [ ] Optional: try the Alexa+ Local Inspector or Private Preview if you can get access. Do not claim it otherwise.

Video
- [ ] Record with OBS, using `docs/DEMO_SCRIPT.md` (target under 2:50, hard limit 3:00). Scene: TV view large, Austin and Seattle device windows side by side. Use a headset mic. Take 2-3 takes.
- [ ] Check content: fictional teams only, no third-party trademarks, no copyrighted music or footage, no Amazon or Alexa logos in our UI, no money or "bet" language.
- [ ] Say "Alexa+ add-on" in narration only. Show the MCP Inspector or basic-host segment as proof of the real protocol.
- [ ] Upload to YouTube or Vimeo as **public**, English. Open the link while signed out to check.
- [ ] Paste the URL into **Links** above.

Devpost
- [ ] Create the project page and paste the sections above. Paste the page URL into **Links**.
- [ ] Select track **Alexa+** and the mini challenge **AWS Builder**. Select Open Source only if the engine split is published.
- [ ] Add the repo link, the video link, and a few screenshots (TV view, device with widget, Inspector tools list; images are in `docs/img/`).
- [ ] Attach the AWS proof from the checklist if available.
- [ ] Add product feedback per tool (`docs/PRODUCT_FEEDBACK.md`, from the friction log) for the feedback bonus.
- [ ] Re-read the **UNVERIFIED** statements and make sure the form does not overclaim real Bedrock, a real Alexa+ device, real-mic voice ID, or a widget in a real Alexa host.
- [ ] Submit by **10:00 AM PT Fri 2026-10-23**, then reopen the public page signed out and click every link.
