# Benchwarmers: demo video script (Alexa+ track, target 2:50)

Build, Ship, Shape on Devpost. Primary track: **Alexa+**. Hard limits from the rules: under 3:00, English, public on YouTube or Vimeo, fictional teams only, **no Alexa or Amazon logos** on screen (say "an Alexa+ add-on" in the narration only), and no copyrighted footage or music. The safest choice is no music, or a track you made yourself.

This script follows the **current room flow** on `main`: homepage, two phones, shared display and the simulated smart display at `/display/room/:code` with its MCP calls panel. That is the scenario C's acceptance evidence covers. Do not splice in clips from the legacy household flow (`/device/garcias`) as if they were the same night. An optional swap beat is at the end.

## What the judges score, and the shot that shows it

| Alexa+ judges reward | Shot that shows it |
|---|---|
| A self-hosted MCP server (2025-11-25, Streamable HTTP) that is visibly working | MCP calls panel: `tools/list`, `room_ask`, response times in ms |
| Agentic, not single-turn Q&A | One sentence builds a whole lineup under the cap; "start the game" drives the room |
| Keeps state across sessions | Season standings after the night; the same room after a server restart |
| Media and cards (MCP Apps) | Smart display board and the `ui://` widget in an MCP host |
| Voice-first, household-aware | "Speaking as Maya": the pick lands on Maya's seat and nobody else's |
| Fast (Alexa+ wants MCP under 500 ms) | `room_ask ✓ 16 ms` in the panel; AI content runs in a background worker |

## Screen setup (OBS)

- **Scene A, "Living room":** shared display `/room/<CODE>/display` full screen (F11) at 1920x1080.
- **Scene B, "Smart display":** `/display/room/<CODE>` at **Compact 960x480**, with **MCP calls** open on the right. Use this for every voice beat.
- **Scene C, "Phones":** two phone-size browser windows (separate profiles) side by side: Maya (host) and Leo.
- **Scene D, "Under the hood":** MCP calls panel close-up, then the MCP host widget (`docs/img/basic-host-tonight-1280.png` is the fallback still).
- Lower-third captions on: **"Simulated smart display"** whenever Scene B is on screen, and **"Replay sped up"** wherever you cut time.

---

## Script

### 0:00–0:12 · Cold open (Scene A)
**On screen:** Shared display mid-game. The "BUCKET" celebration fires, then Room leaders reorder (Maya jumps ahead of Leo).

**VO:**
> "Maya's in Austin. Leo's in Seattle. Same game, two cities, and until tonight, a group text full of score updates."

### 0:12–0:20 · Title card
**On screen:** Benchwarmers logo (red bench mark). Text: *"Game night, by voice. Free to play. Fictional teams."*

**VO:**
> "This is Benchwarmers, an Alexa+ add-on that turns watching a game with friends into one shared game night."

### 0:20–0:45 · Host and join (Scene C)
**On screen:** Maya's phone: homepage, **Host a party**, basketball, room name "Friday Basketball", and the room code appears. Leo's phone: types the code and joins. Both seats show on the shared display lobby.

**VO:**
> "Maya hosts a room. Leo joins with the code from across the country. Everyone builds a five-player lineup, a captain plus four flex players, under a salary cap."

### 0:45–1:05 · Agentic lineup by voice (Scene B)
**On screen:** Smart display, speaking as Maya.

**Say (or type, and caption it "typed"):**
1. `Build a balanced lineup for me`
2. `Make Big Mo my captain`

**Expected:** the reply confirms the lineup and the captain. Two `room_ask ✓` rows appear in the MCP calls panel. Cut to Maya's phone: **My lineup** shows the same five players and "Lineup saved".

**VO:**
> "Or Maya just asks. One sentence and the add-on picks five players that fit the cap. 'Make Big Mo my captain.' Every request is a real MCP tool call to our own server, checked by the same rules as the phone."

### 1:05–1:15 · Tip-off (Scene B → Scene A)
**Say:** `Start the game`

**On screen:** Shared display: the clock starts and the court graphic is live.

**VO:**
> "Maya's the host, so she can start the game by voice."

### 1:15–1:50 · The live call (Scene A + B, the key shot)
**On screen:** Featured call **"Which team scores next?"** with its countdown ("Closes in 0:08").

**Say, inside the window, speaking as Maya:** `Harbor Hawks`

**Expected:** the reply accepts the pick. The shared display shows "Harbor Hawks · 1 pick". Leo picks Summit Foxes on his phone. The call closes, the Hawks score, **BUCKET** fires and Maya moves to #1.

**Then say:** `What's my rank?` → *"Maya, you are number 1 of 2 with … points."*

**VO:**
> "During the game, quick calls open and close on the server's clock. Maya says 'Harbor Hawks'. Her pick is locked to her seat with a receipt, and it shows up on every screen in both cities. The Hawks score, and the standings update live. No money involved, just points and bragging rights."

### 1:50–2:15 · Final and season memory (Scene A)
**On screen:** Final card: winner name and points, then **Season standings**. Optional 3-second cut: restart the server and reload, and the same final and season are still there.

**Say:** `Who's leading the season?`

**VO:**
> "When the final buzzer goes, the room crowns a winner, and the night rolls into a season table. Restart the server and it's all still there. Next week, 'who's leading the season?' still knows the answer."

### 2:15–2:40 · Under the hood (Scene D)
**On screen:** MCP calls panel close-up: `tools/list ✓ 30 tools`, `room_ask ✓ 16 ms`. Then the board widget rendered inside an MCP host. Optionally a 3-box diagram: Voice → MCP server → Game engine, with an AI worker on the side.

**VO:**
> "Under the hood: a self-hosted MCP server on spec 2025-11-25 over Streamable HTTP, with 30 tools and an MCP App board that renders in the conversation. The server owns the game, so a model never decides a result. AI content is generated ahead of time in a background worker, with Bedrock or Gemini, so tool calls come back in milliseconds, well under Alexa+'s 500-millisecond budget. And the whole demo runs offline, with zero cloud credentials."

### 2:40–2:50 · Close (title card)
**On screen:** *"Benchwarmers · github.com/azrkiel/benchwarmers · MIT"*

**VO:**
> "Next stop: a real Alexa+ device in the living room. Benchwarmers. Your couch, their couch, one game night."

**Narration total is about 330 words**, which fits in 2:50 at a relaxed pace with room for the spoken commands.

---

## Before you record

- [ ] Fresh room for every take. Never reset a shared production room. (`npm run demo` locally, or `https://benchwarmers.fly.dev`.)
- [ ] Set the replay speed to 3–4x from the host phone so a question window and the final both fit. Keep the full raw capture, and caption any cut "Replay sped up".
- [ ] Read the **live** tool count from `tools/list` in your take. Say that number. `docs/img/inspector-tools.png` is an older 22-tool build, so don't show it as current.
- [ ] Rehearse each phrase once. `Build a balanced lineup for me` and `Make Big Mo my captain` are covered by `server/test/room/basketball-assistant.test.ts`. Say a pick only while the call is open; otherwise you'll hear "That call closed".
- [ ] If speech fails, type the phrase and caption it **"typed"**. Don't imply the voice was recognized when it wasn't.
- [ ] **Known open issue:** the last-score animation can cover the winner card on the first final (`docs/qa/worker-c/INTEGRATION_FINDINGS.md`). Wait for the animation to clear before you cut to the final card, or check the fix first.
- [ ] Keep these out of the shot: room/host credentials, bookmarks, notifications, the browser profile name.
- [ ] Wording: say "points", "calls", "picks". Never say "bet", "odds", "wager" or "payout". Use no real team names and no Alexa or Amazon logos.

## Backup stills already in the repo (for B-roll or a fallback)

| Beat | File |
|---|---|
| Cold open / celebration | `docs/qa/worker-b/connected/c4-display-celebration-1.png` |
| Shared display, live call | `docs/qa/abc-integration-2026-10-23/shared-display-1920.png` |
| Smart display + MCP calls panel | `docs/qa/worker-c/integrated-2026-10-23/screens/simulator-mcp-seat.png` |
| Phone lineup (salary cap) | `docs/qa/worker-b/connected/c1-maya-lineup.png` |
| Phone pick with countdown | `docs/qa/worker-b/connected/c3-maya-pick-0.png` |
| Final / winner | `docs/qa/worker-b/connected/c5-display-final.png` |
| MCP App widget in a host | `docs/img/basic-host-tonight-1280.png` |

## Optional swap beat (separate clip, legacy household flow)

If you want the "one sentence sets up the whole night" moment, record it as its own labeled clip and **replace** 0:20–0:45 with it. Don't add it on top, or you'll go over 3:00. On `/device/garcias`, say `Set up a watch party for tonight's game with the Sunday Crew`. One tool call creates the party and invites Sam's Place in Seattle (`docs/DEMO_SCRIPT.md` §1). Caption it as a separate scenario.
