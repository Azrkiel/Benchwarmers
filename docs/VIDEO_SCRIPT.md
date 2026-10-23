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

## Feature coverage (every claim gets a shot)

Each feature the README, homepage and submission claim, and the beat that shows it. All of these were rehearsed end to end on 2026-10-23 with `node tools/video/rehearse.mjs` (see "Rehearse the take" below).

| Feature | Beat | What must be visible or audible |
|---|---|---|
| Host a party from the homepage | 0:20 | **Host a party** → basketball → "Friday Basketball" → room code |
| **Scan the QR code to join** | 0:20 | Shared display lobby: **"Scan to join"** QR + big room code. Leo points his phone camera at it |
| Group join, two cities | 0:20 | Lobby **Room leaders** shows Maya and Leo; "N of N lineups ready" |
| Lineup under a salary cap, by voice | 0:45 | "Your balanced lineup is saved at $50,000 of $50,000." |
| Captain by nickname, by voice | 0:45 | "Moses Adeyemi is your captain. Lineup cost $49,750." |
| Same lineup on the phone | 0:45 | **My lineup** → "Lineup saved" |
| Host controls by voice | 1:05 | `Start the game` → clock runs |
| **The display calls out the plays (spoken + captioned)** | 1:05–1:50 | "Foxes ball. Which team scores next?" · "Two for the Hawks. Maya takes the lead." · "Final. Maya wins the night." Needs **Enable sound** on the shared display |
| Live call on the server's clock | 1:15 | **Featured call · Which team scores next?** with "Closes in 0:0x" and a timer bar |
| Pick by voice, bound to Maya's seat | 1:15 | Reply "Harbor Hawks accepted."; phone shows **✓ Your pick** |
| Pick by phone | 1:15 | Leo taps Summit Foxes; display "1 pick" each, "2 of 2 answered" |
| Celebrations + live standings | 1:15–1:50 | BUCKET/THREE fires, Room leaders reorder |
| Personal question | 1:50 | `What's my rank?` → "Maya, you are number 1 of 2 with … points." |
| Final winner + season table | 1:50 | Winner card, **Season standings**; phone Results shows the season |
| Season memory | 1:50 | `Who's leading the season?` → "Maya leads the season with … points." |
| Self-hosted MCP, 30 tools, fast | 2:15 | MCP calls panel: `tools/list ✓ 30 tools`, `room_ask ✓ … ms` |
| MCP App board in a host | 2:15 | `docs/img/basic-host-tonight-1280.png` or a live host |
| Offline, no cloud keys | 2:15 | Diagram "Works offline with no cloud keys" |

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
**On screen:** Maya's phone: homepage, **Host a party**, basketball, room name "Friday Basketball", and the room code appears. Cut to the shared display lobby: **"Scan to join"** with the QR code and the big room code. Leo points his phone camera at the QR, lands on the join page, types "Leo" and taps **Join room**. Back on the shared display, **Room leaders** now lists Maya and Leo.

The QR encodes the address the shared display was opened on. Open the display on `https://benchwarmers.fly.dev` or the LAN address `npm run demo` prints, **not** `localhost`, or Leo's phone can't open it. Typing the code on the homepage (**Join a party**) works too; use it as the fallback.

**VO:**
> "Maya hosts a room. Leo scans the code on the TV from across the country, and anyone else on either couch can do the same. Everyone builds a five-player lineup, a captain plus four flex players, under a salary cap."

### 0:45–1:05 · Agentic lineup by voice (Scene B)
**On screen:** Smart display, speaking as Maya.

**Say (or type, and caption it "typed"):**
1. `Build a balanced lineup for me`
2. `Make Big Mo my captain`

**Expected:** the replies read "Your balanced lineup is saved at $50,000 of $50,000." and "Moses Adeyemi is your captain. Lineup cost $49,750." Big Mo is Moses Adeyemi's nickname; the nickname needs the fix on this branch (before it, the live room answered "I couldn't find a player called big mo"). Two `room_ask ✓` rows appear in the MCP calls panel. Cut to Maya's phone: **My lineup** shows the same five players and "Lineup saved".

**VO:**
> "Or Maya just asks. One sentence and the add-on picks five players that fit the cap. 'Make Big Mo my captain.' Every request is a real MCP tool call to our own server, checked by the same rules as the phone."

### 1:05–1:15 · Tip-off (Scene B → Scene A)
**Say:** `Start the game`

**On screen:** Shared display: the clock starts and the court graphic is live. The first call, **"Which team scores next?"**, opens **at tip-off**, and the display says it out loud: *"Foxes ball. Which team scores next?"* Have `Harbor Hawks` ready to say straight away.

**VO:**
> "Maya's the host, so she can start the game by voice. The TV calls the action as it happens."

### 1:15–1:50 · The live call (Scene A + B, the key shot)
**On screen:** Featured call **"Which team scores next?"** with its countdown ("Closes in 0:08").

**Say, inside the window, speaking as Maya:** `Harbor Hawks`

**Expected:** the reply is "Harbor Hawks accepted." Maya's phone shows **✓ Your pick** on Harbor Hawks. Leo taps Summit Foxes on his phone. The shared display shows 1 pick on each side and "2 of 2 answered", then "Locked · Waiting for the play". The Hawks score, **BUCKET** fires, and the display announces *"Two for the Hawks. Maya takes the lead."* The scripted game plays the same way every take, so this result is repeatable.

**Call-outs need sound on.** The shared display only speaks after someone clicks **Enable sound** on it (bottom right). Only one screen per room speaks; if another tab holds the sound, click **Play here**. Without it you get the caption line only. Capture desktop audio in OBS. The voice is the browser's text-to-speech, not an Alexa device, so don't call it Alexa in captions.

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

## Graphics and transitions

Everything is in `docs/video/`. Open `graphics.html` in a browser to preview each graphic and play its animation. The rendered files are in `docs/video/renders/`.

| Where in the script | File | How to use it |
|---|---|---|
| 0:00–0:12 cold open, and B-roll for "the game is on" | `game.mp4` (32 s: Q1 of Harbor Hawks vs. Summit Foxes at 4×, ending 13–13) | Open on 6–8 s of it (the "BUCKET!" at about 12 s works well), then cut to the shared display. Source: `docs/video/game.html` |
| 0:12–0:20 title card | `title.mp4` (4.5 s; animates in, holds, then the text lifts out) | Put it on its own track. Start the VO line as the tagline lands, about 1 s in |
| 0:20 Maya and Leo on their phones | `lt-maya`, `lt-leo` (4 s each) | Overlay them as each phone first appears |
| Every Scene B shot | `lt-sim` | Overlay it the first time the smart display appears. Once is enough |
| Any cut that skips game time | `lt-sped` | Required wherever you shorten the replay |
| Only if a request was typed | `lt-typed` | Overlay it on that request |
| 2:15–2:40 under the hood | `diagram.mp4` (7 s build, then hold the last frame) | Freeze the last frame for the rest of the beat. Cut to the MCP calls panel at about 2:28 |
| 2:40–2:50 close | `end.mp4` (5 s) | Hold it to the end |
| Between beats | `wipe` (1 s, cut at 0.5 s) | Use it at 0:20, 0:45, 1:50 and 2:15. Don't use it on every cut |
| Fast cuts inside a beat | `whip` (0.6 s, cut at 0.3 s) | Smart display → shared display, for example |

**Gameplay footage.** Use `game.mp4`, not footage from a commercial game. The rules forbid third-party copyrighted footage, and re-editing someone else's game doesn't change who owns it. `game.mp4` is drawn from scratch, and its plays, scores and ticker come from `server/src/game/games/harbor-vs-summit.json`. That file is the household `DEMO` game. A room replay can score differently, so don't cut it right against a room score on screen. Use it as atmosphere, not as the source of a specific result.

**Formats.** Each overlay comes in three versions:
- `.webm` keeps transparency. It works in OBS, DaVinci Resolve, Premiere and Shotcut.
- `-green.mp4` is for editors that only chroma-key, like CapCut and Clipchamp. Key out the green.
- `.png` is the still at the overlay's key moment.

**Stinger in OBS.** Go to Scene Transitions → Stinger, choose `wipe.webm`, and set the transition point to 500 ms (`whip.webm`: 300 ms).

**Live in OBS.** Add a Browser source at 1920×1080 pointing at `docs/video/graphics.html?scene=lt-sim&alpha=1`. Turn on "Refresh browser when scene becomes active" so the animation replays.

**Re-render after edits.** Run `node tools/video/render.mjs`, or name the scenes to render, like `node tools/video/render.mjs title end`. It needs ffmpeg and the root `playwright` devDependency.

## Before you record

- [ ] Fresh room for every take. Never reset a shared production room. (`npm run demo` locally, or `https://benchwarmers.fly.dev`.)
- [ ] Set the replay speed from the host phone (**Host controls** → Replay speed). Measured on 2026-10-23: at **4x the whole game runs about 60 s** from tip-off to "Final", and each call stays open only the 8-second minimum. **2x** (about 2 minutes) gives you a calmer call window; 4x fits the beat without cuts. **1x** (about 2.5 minutes) gives every basket its own call-out and celebration; at 2–4x the display's 1-second refresh can catch several baskets at once, shown as the latest basket plus "+N more". Keep the full raw capture, and caption any cut "Replay sped up".
- [ ] Click **Enable sound** on the shared display before the take so it calls out the plays, and check OBS is capturing desktop audio.
- [ ] Open the shared display on the production or LAN address so the lobby QR works from a real phone. Scan it once with the phone you'll use on camera.
- [ ] Read the **live** tool count from `tools/list` in your take. Say that number. `docs/img/inspector-tools.png` is an older 22-tool build, so don't show it as current.
- [ ] Rehearse each phrase once. `Build a balanced lineup for me` and `Make Big Mo my captain` are covered on the real basketball catalog by `server/test/room/basketball-assistant.test.ts`. Say a pick only while the call is open; otherwise you'll hear "That call closed".
- [ ] If speech fails, type the phrase and caption it **"typed"**. Don't imply the voice was recognized when it wasn't.
- [ ] **Known open issue:** the last-score animation can cover the winner card on the first final (`docs/qa/worker-c/INTEGRATION_FINDINGS.md`). Wait for the animation to clear before you cut to the final card, or check the fix first. On 2026-10-23 at 4x the winner card was clear when "Final" appeared. At 1x the game-winning dunk's animation fades over the card for about half a second; cut just past it (the demo cut does).

## Rehearse the take

`node tools/video/rehearse.mjs [baseUrl] [outDir]` drives three browsers (Maya's phone, Leo's phone, the 1920×1080 shared display) plus the simulated smart display through this whole script against a running server, and saves a still per beat plus `captions.json` (every call-out the display made) and `meta.json` (room code, QR URL, page errors). Run it against a fresh `npm run demo` before you record. It types the phrases; it doesn't test your microphone. Defaults: `http://localhost:3001`, output in `tools/video/rehearsal/` (gitignored).
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
