# Demo script (<= 2:50)

## Worker C: basketball recording candidate

Use [basketball demo operations](BASKETBALL_DEMO.md) and [C's observed results](qa/worker-c/RESULTS.md) first. The older household script below remains a separate legacy scenario. Do not combine its evidence with basketball room claims. The current main baseline does not yet supply the additive basketball room contract; rehearse and pass the full connected candidate before recording it.

| Time | Connected basketball take | Evidence to show |
| --- | --- | --- |
| 0:00–0:20 | Explain the shared game night; create basketball from the real homepage | Actual room code and game identity, no fixture flag |
| 0:20–0:50 | Join from two separate phone profiles; choose captain/flex and save | Service-confirmed lineup, salary cap, two distinct seats |
| 0:50–1:15 | Open the compact shared display and start from the host phone | Same room and score across the three connected screens |
| 1:15–1:45 | Make a call inside a real question window; ask the room score | Accepted server receipt and actual tool/assistant reply; describe typed input as typed |
| 1:45–2:10 | Show score/standings and one accessible celebration | Score remains readable; use sound only if actually enabled and observed |
| 2:10–2:35 | Show the same room's final and season result after a rehearsed restart | Same standings/season from the authoritative service, no double accounting |
| 2:35–2:50 | Show actual MCP tools/list and state the limits | Count tools from this candidate; simulation, provider and hardware limits stated plainly |

These times are a shot budget, not a promise that the server replay ends within 2:50. Rehearse its real duration. Keep the full original capture and disclose any time compression; do not splice a fixture or a different room's final into a purported continuous live take. If the final arrives later, shorten narration or extend the recording rather than altering the authoritative clock.

Before recording: use a new isolated season, warm widget/web builds, verify `qa:basketball` and full `qa:browser`, grant actual browser microphone permission only if testing speech, and run the exact spoken phrases yourself. Headless or typed checks do not prove microphone accuracy. Keep credentials, private backups, browser storage and notifications out of the shot. Uploading, publishing and submission remain owner actions. Use a fresh room for another take; never reset a shared production party.

## Legacy household recording script

Benchwarmers: a voice-driven fantasy pick'em for a game-night watch party. Two households (Austin, Seattle) play one party on a shared TV view, talking to a simulated Alexa+ device. The assistant is a rule router in front of our own MCP server.

Every utterance below is traced to a router test or rule in the appendix. Tested phrasing is quoted exactly. Anything marked **untested phrase** runs the same code path as a tested one but was not run as that exact string. Rehearse it once before a take.

## 0. Pre-recording checklist

### Production laptop setup (2026-10-23)

- Use `https://benchwarmers.fly.dev` for the take. `/display/garcias` and `/device/garcias` load the real MCP widget through the same-origin host; no browser token setup is needed. Type `Who's winning?` before recording to check the Tonight tab.
- The laptop is the TV: use F11 at the normal browser zoom (1920x1080 panel, 125% Windows scaling -> 1536x864 CSS pixels). Use `/room/<CODE>/tv` for football rooms or `/tv/<CODE>` for household parties.
- Show `/display/garcias` and call it a **simulated smart display**. Small is 1280x800; `?size=large` selects 1920x1080; `?clean=1` hides the outer controls after setup. Keep the controls visible for typed input.
- Keep the MCP Inspector proof segment around 15 seconds and say **22 tools**. For Inspector use your local server and its configured bearer; the production `/mcp` remains protected.
- Draft Big Mo only once per take. A fresh party or reset is needed before another take; avoid resetting a shared production party during another person's demo.
- Recording, the public video upload, and the Devpost form remain owner steps. Keep the UNVERIFIED wording in `SUBMISSION.md`: no real Alexa+ device/host, no real-microphone voice-ID proof, and no live Bedrock proof.

### Local rehearsal setup
- [ ] Node 22+ (HANDOFF says >= 22). `npm ci` at repo root.
- [ ] Choose a free port; leave existing servers alone. This example uses **3031**.
  PowerShell: `$env:PORT=3031; npm run demo`
- [ ] `npm run demo` (root) builds the widget and web, then serves both from one Express process (`SPEED=4`). `WEB_PORT` is not used. Ctrl+C stops this demo server.
- [ ] Check `http://localhost:3031/healthz`. Check `POST http://localhost:3031/mcp` returns 401 without the bearer.
- [ ] Avast on this machine can stall loopback `/mcp` (HANDOFF §6). If `/mcp` hangs, re-run the take, do not debug live.
- [ ] `ASSISTANT_MODE` unset or `offline`. Offline needs zero AWS creds. Bedrock is **not** part of this demo.
- [ ] `AI_MODE` unset or `fallback`. Props and recap come from fallback content.

### Browser and mic
- [ ] Chrome only. Web Speech recognition is not in Firefox (`voice-id` notes, VOICE_ID §9). Use Chrome for both device windows.
- [ ] Mic permission granted to the recording origin in Chrome before recording (site settings > microphone): production or `localhost:3031` for this local setup.
- [ ] USB headset, not the laptop mic. Set Windows default input to the headset.
- [ ] Dry run in the same Chrome profile: both device pages capturing at once. HANDOFF §9 lists "Chrome shares the mic between Web Speech and getUserMedia" as **unverified**. Confirm in the dry run.

### Voice ID
- [ ] Open `/voice-lab` on the recording origin. Choose household **garcias**. Wait for the model to load. First load is slow (102 MB download, VOICE_ID §3). Once cached it is about 20 s (VOICE_ID §5a). Warm it before the take and keep the same browser profile.
- [ ] Enroll **Maya** and **Leo** (Garcias) with the three sentences in `EnrollPanel` (each clip needs >= 1.5 s speech).
- [ ] Enroll **Sam** and **Priya** on `household=sams-place` the same way.
- [ ] Test "Who's talking?" a few times at the device distance, with the TV audio on. Note whether Maya is recognised. If it is not, use the fallbacks in section 3.

### Data and reset
- [ ] For an isolated local rehearsal, set `PORT=3031` and run `npm run demo:reset` before each take. It posts `/api/parties/DEMO/reset`, restoring DEMO and season stats. For a shared production take, create a fresh party instead of resetting another person's party.
- [ ] Setup creates a new party every time it runs (`store.createParty`). Reset does not delete those. Device pages pick the newest non-final party for the crew (`store.getCurrentPartyCode`). Reset re-stamps DEMO (`seedState(now)`), so DEMO should win again. Confirm with the party chip after reset.

### Recording
- [ ] OBS. Scene: TV view large (`/tv/<CODE>`), Austin smart display (`/display/garcias`) and Seattle device (`/device/sams-place`). Use F11 and normal browser zoom. The simulated display scales itself to fit.
- [ ] Hide bookmarks, notifications and the Settings drawer unless the shot needs it.
- [ ] Record 2 to 3 takes. Keep the best. Do not edit a live game in one take into several; see the live beat timing (section 2, beat 4).
- [ ] Optional: 10 s of the TV on a real screen for the intro (plan §10). Not required.
- [ ] Typed fallback box visible in each device (`Type a message…`). Use it if speech fails.

### Fallback plan
- Speech does not start, or the transcript is wrong: type the same utterance in the device box. Typed turns send the on-screen speaker pick (`source: 'screen'`, `confidence 1`, `useSpeaker.ts`). Pick the person on the speaker bar first.
- Voice ID returns nothing: the router replies `Who's picking? Say your name first, like: I'm Maya, draft Big Mo.` (test `missing speaker`). Then say or type `I'm Maya, draft Big Mo`.
- Server or `/mcp` hangs: reset (`npm run demo:reset`) and re-take. If a live pick was missed (window closed), see section 2 beat 4.
- Nothing works in the browser: keep the terminal output of the tool calls, or use `tools/screenshot.mjs` for stills of the TV state. It is for stills only, not recording.

## 1. Shot list

Run `npm run demo:reset` before the take. Timestamps follow plan §10. Utterances are typed or spoken exactly as shown.

| Time | On screen | Voice or typed | Expected result | Tool |
|---|---|---|---|---|
| 0:00–0:20 | Title card or TV view, DEMO | none (narration) | Problem: friends in two cities cannot share game night | none |
| 0:20–0:45 | Austin device (`/device/garcias`), agent trace on | **Voice**: `Set up a watch party for tonight's game with the Sunday Crew` | Reply: `Your watch party for Harbor Hawks vs. Summit Foxes for tonight is set. The code is <CODE>. I invited …` Trace shows one call. Seattle reload picks up the new code | `setup_watch_party` `{crewName:'Sunday Crew', when:'tonight'}` |
| 0:20–0:45 | Seattle device (`/device/sams-place`) | Reload page, no utterance | Party chip shows the new `<CODE>`. Invite line names Sam and Priya | none (`GET /api/crews/sunday-crew/current`) |
| 0:20–0:45 | TV | Open `/tv/<CODE>` | TV shows the new party's draft board | none |
| 0:45–1:10 | Austin device | **Voice or typed**: `Who's available at center?` | Draft board widget, centers listed | `list_available_players` `{position:'C'}` |
| 0:45–1:10 | Austin device | **Voice with Maya enrolled, no name**: `Draft Big Mo` (voice ID hint = Maya). Fallback: typed `I'm Maya, draft Big Mo` | `Big Mo` on Maya's roster. Draft board fills on TV | `draft_player` `{memberName:'Maya', player:'Big Mo'}` |
| 0:45–1:10 | Seattle device | **Typed**: `I'm Sam, draft Big Mo` (**untested phrase**, same path as the Maya draft) | `PLAYER_TAKEN`: `Big Mo is already on Maya's team. Try … or …` with two alternatives | `draft_player` `{memberName:'Sam', player:'Big Mo'}` |
| 1:10–1:50 | Seattle device, TV | **Voice or typed**: `I'm Sam, put me down for the Hawks scoring first` (inside the fb-1 window, see section 2) | `Got it, Sam: Hawks.` with lock countdown. Pick appears in the Austin widget within about 1–2 s (Checkpoint 4 measured 0.98 s) | `make_pick` `{memberName:'Sam', choice:'Hawks'}` |
| 1:10–1:50 | Austin device | **Voice or typed**: `Priya takes the over` (**only** inside the fb-3 window, see section 2; **known quirk**: fails in fb-1) | Inside fb-3: `Got it, Priya: Over.` Inside fb-1: `not one of the choices` | `make_pick` `{memberName:'Priya', choice:'the over'}` |
| 1:10–1:50 | TV | none | Scoreboard and pop-ups (`+3 Maya`) and standings reorder. Pop-ups and FLIP are built (HANDOFF §4); not yet seen in a take | none |
| 1:10–1:50 | Austin device | **Voice or typed**: `Who's winning in our house?` | Leaderboard widget | `get_leaderboard` `{code}` |
| 1:50–2:15 | TV | none, let the game reach its end (about 2:00 after start at SPEED=4) | Final view with podium. `Benchwarmer of the night` from state (`store.ts` ~616). AI recap from fallback content | none |
| 1:50–2:15 | Austin device | **Voice or typed**: `How am I doing this season?` with Maya as speaker, or type `I'm Maya, how am I doing this season?` | Season standings widget with Maya's row | `get_season_standings` `{memberName:'Maya'}` |
| 2:15–2:30 | Browser: MCP Inspector, bearer header set | none (narration) | 22 tools listed. Protocol 2025-11-25 over Streamable HTTP. Widget renders from `_meta.ui` | none (not a router call) |
| 2:30–2:50 | Architecture slide | none (narration) | Architecture: MCP server + MCP App widget + Bedrock (not run in this demo). Vision line | none |

Optional inserts (only if time):
- Agent-trace toggle is on the Austin device at beat 2. Show `Show agent trace` (`data-testid="trace-toggle"`) listing each call. In offline mode it lists one call per turn (see quirks).
- The Garcias `explain` line (`Why did that one go the other way?`, test `10 explain`) can replace `Who's winning…` if beat 4 is short.

### Beat-by-beat narration

**0:00–0:20 Problem.** "Friends in two cities want the same game night. Today they text scores. Benchwarmers puts the game on one TV, and each house talks to it by voice."

**0:20–0:45 Set up.** "I just say 'set up a watch party.' The assistant calls our MCP server. The code is on the screen, and Seattle picks it up." Turn on the trace toggle. Point at the one call.

**0:45–1:10 Draft.** "Who's available at center? Big Mo. The draft board fills on the TV. Sam tries the same player and gets alternatives." Then the voice ID moment: "Draft Big Mo," no name. Show that the router attributed it to Maya. If the hint is wrong or missing, say so on screen and use the fallback. Do not claim recognition the take does not show.

**1:10–1:50 Live.** "Sam calls the first basket, Hawks. The pick lands in both houses within a second. Then a pick by Priya." Use the window timing in section 2. "Who's winning in our house?" then cut to the TV standings.

Bonus chips: Sam's pick at about 0.5 s lands in the first 25% of the fb-1 window, so once fb-1 resolves Hawks his row carries an `early_call` chip (x1.25, 12.5 points; checked in state, `picks[].score.bonuses`). `Why did that one go the other way?` ends `Sam's early call earned 12.5 points.` Say "points multiplier", never a wager word. Only fires if Sam picks inside the first 2.5 s of the window and Hawks is right. Details and captured replies: section 4.

**1:50–2:15 Final.** "The final whistle gives a podium and a recap. And here's the season question: 'how am I doing this season?' That answer persists across server restarts." Verified: season persistence across restart (HANDOFF §4 / Checkpoint 4 note).

**2:15–2:30 Protocol.** "Same server, plain MCP. This is the MCP Inspector: 22 tools, Streamable HTTP, protocol 2025-11-25. The widget is an MCP App."

**2:30–2:50 Architecture.** "MCP server, MCP Apps widget, and Bedrock for the assistant loop and recap. This demo runs offline, with no AWS account, so Bedrock is wired but not exercised here." Then the vision line: "official broadcast sync": "the same party state could drive an official broadcast overlay." Mark it as a vision line, not a built feature.

## 2. Live-beat timing (SPEED=4)

- Game clock: `gameT = realSeconds x SPEED` (`engine.computeGameT`). Game length 480 s (`harbor-vs-summit.json`), so the game ends about 120 real seconds after start (`store.ts` ~399 sets `final` at `gt >= durationSec`).
- Fallback props open every 60 game seconds = 15 real seconds. Each is open for 40 game seconds = 10 real seconds, then locked until its resolve point.

| Prop | Opens (real s from start) | Locks | Resolves | Options (label) |
|---|---|---|---|---|
| fb-1 "Who scores first?" | 0 (open during draft) | 10 | 15 | `Hawks` / `Foxes` |
| fb-2 next basket | 15 | 25 | 30 | three / other |
| fb-3 over/under | 30 | 40 | 45 | `over` / `under` |
| fb-4 | 45 | 55 | 60 | home / away / none |
| fb-5 | 60 | 70 | 75 | three / two / ft |
| fb-6 over/under | 75 | 85 | 90 | over / under |
| fb-7 | 90 | 100 | 105 | home / away / none |
| fb-8 over/under | 105 | 115 | 120 | over / under |

- `make_pick` answers the open prop (`store.ts` ~320 picks the open prop with the earliest lock, `server.ts` ~555). Outside an open window the tool errors `PICKS_LOCKED`.
- So: **scoring first** only inside 0-10 s after start. **Over/under** only inside 30-40 s (or 75-85, 105-115). Start the live beat with `Start the game` (test `6 start the game`). Then say the pick line inside the window. Watch the TV's open-prop card and its lock countdown; do not rely on memory.
- `start_watch_party` ends the draft: `The draft is closed. The game has already tipped off.` (`engine.ts` ~208). Draft all picks before the start line.
- Record the live beat as one continuous run after `Start the game`. Splice only the cut-away shots.

## 3. Known quirks (know before the take)

1. **One tool call per turn in offline mode.** `runOffline` makes exactly one `callTraced` (`offlineRouter.ts` ~167-190). Do not say "multi-step tool calls" in narration. The multi-step Bedrock loop (≤3 rounds) is not run in this demo.
2. **`Priya takes the over` fails in fb-1.** Test 9 expects `ok:false` and `not one of the choices` because the open prop is scoring-first. Works only in an over/under window (section 2). This is timing, not a routing bug (HANDOFF §10).
3. **Setup creates a new party code.** Put the TV on `/tv/<CODE>` after the setup line. The device page adopts the code from the setup response on the Austin device only. Seattle must reload to see it (`resolvePartyCode` runs on mount).
4. **No wake word.** The mic button says "Tap to talk"; tap it, then speak.
5. **Voice ID is TTS-verified only.** Real people and a real mic are not tested (HANDOFF §4). Same-voice scores were 0.80 to 0.97, cross-voice 0.25 to 0.70 with Windows TTS (VOICE_ID §5a). Expect misses. Use the fallbacks.
6. **Typed turns use the screen pick, not voice ID.** Spoken turns use voice ID, falling back to the screen pick (`useSpeaker.finish`).
7. **Season answer needs a finished night.** Before the party is final, the season answer reflects only seeded stats.
8. **Widget and `/mcp`.** If `/mcp` returns "Widget not built", the widget build step did not run. Re-run `npm run demo`.

## 4. Optional football + bonus beat (alternate take, <= 0:40)

Second game `riverton-vs-ironwood` (Riverton Otters at Ironwood Forge, fictional football). Drive questions carry a historical % (from the drive table), and correct picks earn points multipliers (Early/Quick call, Lone call, Against the room, Bold call; README "Second game"). `DEMO` stays basketball.

**When to use it.** Either swap it for the 1:10-1:50 live beat of section 1 (the 2:50 is already full, so it replaces that beat, it does not add to it), or record it as a separate short clip. Do not splice it into the basketball take. Run `npm run demo:reset` first, as for any take. The setup line creates a new football party, so put the TV on `/tv/<CODE>` after it.

Every reply below is copied from a live run (server from this branch, `SPEED=4`, offline assistant, simulated voice ID `{confidence: 0.9, source: 'voice-id'}`). The code (`WUDJ`), the clock text and the lock countdown change per run. The rest does not.

### Shot list (football)

Clock T starts at `Start the game`. Draft the other 11 players off camera first (see the draft note below the table).

| Time | On screen | Voice or typed | Expected result (captured reply) | Tool |
|---|---|---|---|---|
| 0:00-0:08 | Austin device, trace on, then TV `/tv/<CODE>` | **Voice or typed**: `Set up a watch party for the football game with the Sunday Crew` | `Your watch party for Riverton Otters at Ironwood Forge is set. The code is WUDJ. I invited The Garcias in Austin and Sam's Place in Seattle: Maya, Leo, Sam and Priya. Everyone drafts 3 players, then I'll open the first question: Will the Otters score on this drive? Say 'draft Slingshot' to start, or 'start the party' when everyone's ready.` | `setup_watch_party` `{crewName:'Sunday Crew', gameTitle:'football'}` |
| 0:08-0:14 | Austin device, draft board widget | **Voice or typed**: `Who's available at quarterback?` | `Top available: Slingshot, Riverton quarterback. Colt 'Slingshot' Mason winds up like a catapult and lets it fly. Big arm, big grin, and an occasional adventurous throw. Hammer, Ironwood quarterback. Jack 'Hammer' Calloway drives the ball hard into tight windows. Confident, loud, and fun to cheer for.` | `list_available_players` `{code, position:'QB'}` |
| 0:14-0:18 | Austin device | **Typed**: `I'm Maya, draft Slingshot` (one draft shown, the rest off camera) | `Maya drafted Slingshot, Riverton's quarterback. That's 1 of 3.` | `draft_player` `{code, memberName:'Maya', player:'Slingshot'}` |
| 0:18-0:20 | Austin device, TV | **Voice or typed**: `Start the game` | `Kickoff! Everyone had a full roster.` TV shows "Will the Otters score on this drive?" with its historical % (36%) | `start_watch_party` `{code}` |
| T+0.8 s (about 0:21) | Austin device | **Voice (Maya enrolled) or typed**: `put me down for yes` (speaker Maya; typed fallback `I'm Maya, put me down for yes`, **untested phrase**) | `Got it, Maya: Yes. Locks in about 7 seconds.` | `make_pick` `{code, memberName:'Maya', choice:'yes'}` |
| T+1.3 s | Austin device | **Voice or typed**: `Leo says no` | `Got it, Leo: No. Locks in about 7 seconds.` | `make_pick` `{code, memberName:'Leo', choice:'no'}` |
| T+3.7 s | Seattle device | **Typed**: `I'm Sam, put me down for no` (**untested phrase**) | `Got it, Sam: No. Locks in about 4 seconds.` | `make_pick` `{code, memberName:'Sam', choice:'no'}` |
| T+4.1 s | Seattle device | **Voice or typed**: `Priya says no` (**untested phrase**; speaker Priya on voice ID) | `Got it, Priya: No. Locks in about 4 seconds.` | `make_pick` `{code, memberName:'Priya', choice:'no'}` |
| T+10.25 s (about 0:30) | TV | none | ff-1 resolves Yes (touchdown). Maya's row jumps to 26.5 pick points; her last pick carries `lone_call`, `bold_call`, `early_call` (state: `standings[].lastPickScore.bonuses`) | none |
| 0:30-0:35 | Austin device | **Voice or typed**: `Why did that one go the other way?` | `Will the Otters score on this drive? The answer was Yes. Drives starting at their own 25 with time on the clock score about 36% of the time - this one ended in a touchdown. Got it right: Maya. Maya's lone call earned 26.5 points.` | `explain_last_result` `{code}` |
| 0:35-0:40 | Austin or Seattle device | **Voice or typed**: `Who's winning in our house?` | `Maya leads with 36.3 points: 9.8 draft, 26.5 from picks. Sam is second with 10.4. Leo is third with 0.9. Maya's lone call earned 26.5 points.` | `get_leaderboard` `{code}` |

Optional, if the take has 5 s of slack: `What's the score?` after the resolve returned `Forge 0, Otters 7, Q1 9:35. Otters ball at their own 25, 1st quarter. Latest: Drive over: touchdown for the Otters.` (`get_game_status` `{code}`). Mid-window the same call adds the open question and its percentage: `Forge 0, Otters 0, Q1 13:15. Otters ball at their own 25, 1st quarter. Latest: Otters take over at their own 25. Kickoff is in the air. Open question: Will the Otters score on this drive? Drives like this score 36% of the time. Locks in about 4 seconds.`

**Draft note.** The 12-player draft is 12 router turns (about 0.1 s each). Run it before the take, off camera, then show only Maya's. Replies follow `<Name> drafted <nickname>, <Team>'s <position>. That's N of 3.`, and `<Name>'s roster is full.` on the third. Used: Maya Slingshot, Velcro, Boots; Leo Freight, Sky, Laser; Sam Hammer, Flash, Moose; Priya Plow, Glue, Anvil. Nicknames in the game file: Riverton Slingshot, Freight, Sparky, Velcro, Flash, Gadget, Moose, Boots; Ironwood Hammer, Plow, Zig, Sky, Glue, Wildcat, Anvil, Laser. Starting without drafting (basketball prints `The bench filled in 12 players`) was **not run for football**; do not rely on it.

### What the captured state shows

- `GET /api/parties/WUDJ/state` while ff-1 is open: `game.clock` `Q1 12:58`, `activeProp.odds` `{source:'drive_odds', bucket:'71-80|normal', n:25892, p:{yes:0.355, no:0.645}}`, one yes and three no picks.
- After ff-1 resolves (`correctOptionId: 'yes'`), `picks[].score`. The contract field is named `odds`; on screen and in narration say "historical %".

| Pick | gameT at pick | `speed` | `contrarian` | `odds` | factor | points | `bonuses` |
|---|---|---|---|---|---|---|---|
| Maya yes | 3.3 | 1.25 | 1.5 | 1.408 | 2.64 | 26.5 | `lone_call`, `bold_call`, `early_call` |
| Leo no | 4.8 | 1.25 | 1 | 0.775 | 0.97 | 0 (wrong) | none |
| Sam no | 14.5 | 1.1 | 1 | 0.775 | 0.85 | 0 (wrong) | none |
| Priya no | 16.1 | 1.1 | 1 | 0.775 | 0.85 | 0 (wrong) | none |

- `standings[].lastPickScore` carries the same object per member. Maya: `pickPoints` 26.5, `total` 36.3 (9.8 draft). Early call is the first 25% of the open window (game seconds 2 to 9.5), Quick call the first 60% (to 20). Bold call is `0.5 / p` of the option picked: x1.41 on the 35.5% side, x0.78 on the 64.5% side.
- Maya was the only yes among 4 pickers, so Lone call (x1.5) applied. With 2 yes and 2 no, only Against the room (under half the pickers) could apply, and not to either side.
- Basketball shows a chip too. In a fresh `DEMO`-style party, `I'm Sam, put me down for the Hawks scoring first` about 0.5 s after `Start the game` (Priya on the Foxes) scored `bonuses: ['early_call']`, `speed` 1.25, 12.5 points (Hawks was right). Replies: `Who scores first? The answer was Hawks. Hawks got there first: Jet Reyes floated in a layup off a Dime Cho pass for the first points of the night. Got it right: Sam. Sam's early call earned 12.5 points.` for `Why did that one go the other way?`, and `Sam leads with 15.5 points: 3 draft, 12.5 from picks. Leo is second with 6. Priya is third with 3.5. Sam's early call earned 12.5 points.` for `Who's winning in our house?` (that run had no drafts, so the draft points are the bench fill).

### Narration (no wager words)

**0:00-0:14.** "Same assistant, different game. I say 'set up a watch party for the football game' and it picks Riverton at Ironwood. Who's available at quarterback? Slingshot and Hammer."

**0:20-0:30.** "Every drive is a question: will the Otters score? Drives like this one score about 36% of the time. That's the historical percentage from 64,000 real drives. Maya says yes. The room says no. A call on the less likely side, made early and made alone, earns points multipliers on top of the streak."

**0:30-0:40.** "Maya's lone call earned 26.5 points. 'Why did that one go the other way?' gets the reason and the bonus, and the house leaderboard shows it." Never say bet, payout or odds boost. Say "points multiplier" and "historical percentage".

### Live-beat timing for football (SPEED=4)

`real seconds = game seconds / 4`, from `Start the game`. Opens, locks and resolve game seconds come from `server/src/ai/fallback/props.json`; yes/no is each prop's `correctOptionId` in the state of a full live run. Every window is 30 game s = 7.5 real s.

| Prop | Question | Opens | Locks | Resolves | Result | Historical % (yes) |
|---|---|---|---|---|---|---|
| ff-1 | Otters score? | 0.5 | 8 | 10.25 | **yes** | 35.5% |
| ff-2 | Forge touchdown? | 11.5 | 19 | 24.75 | **yes** | 25.5% |
| ff-3 | Otters score? | 25.5 | 33 | 37 | no | 35.5% |
| ff-4 | Forge touchdown? | 37.5 | 45 | 48.25 | no | 33.4% |
| ff-5 | Otters touchdown? | 61 | 68.5 | 70.25 | no | 22.1% |
| ff-6 | Forge score? | 71.5 | 79 | 84 | no | 35.5% |
| ff-7 | Otters touchdown? | 84.5 | 92 | 96.5 | **yes** | 33.4% |
| ff-8 | Forge score? | 97.5 | 105 | 109.5 | **yes** | 35.5% |

The game ends at 120 s. There is no open question between 48.25 and 61 s (12.75 s), and only half-second gaps elsewhere. All questions are yes/no, so `put me down for yes` and `Leo says no` work in every window; there is no team-name or over/under mismatch like the basketball `Priya takes the over` quirk. If ff-1 is missed, ff-2 (open 11.5-19 s) is the next clean window.

### Football quirks (observed)

1. **Too early is a lock message.** A pick sent 0.2 s after `Start the game` (ff-1 opens at game second 2, 0.5 s real) returned `Picks are locked. The next question opens in about 1 seconds.` with `ok:false`. Wait about a second after `Start the game` before the first pick.
2. **Fixed after the capture run:** `I'm Sam, they score` used to route to `get_game_status` (the word "score"). Bare drive answers after a name (`I'm Sam, they score`, `I'm Priya, no`, or `touchdown` / `they get stopped` with voice ID) now make a pick (router tests `I'm Sam, they score` … `touchdown + speaker`). `I'm Sam, what's the score?` still gives the score.
3. **"Locks in about N seconds" is in real seconds** and shrinks each turn: 7 for picks at 0.9 s, 4 for picks at 3.6 s.
4. **Bonus chips only appear on correct picks.** Wrong picks keep `speed` and `odds` factors but `bonuses: []` and 0 points.
5. **Maya and Priya as voice ID speakers are simulated here.** Same caveat as section 3, item 5.
6. **A first run with picks inside the first 0.5 s scored nothing** (quirk 1); only the second run's replies are quoted.

## Appendix: utterance trace

Line numbers in the older rows are for the phase/6-polish branch; rows for the football beat (section 4) use the current `server/test/assistant/offlineRouter.test.ts` (phase 8). All tests run with `npx vitest run test/assistant/offlineRouter.test.ts` in `server/`: 69 passed.

| Utterance (as recorded) | Tool and args | Traced to |
|---|---|---|
| `set up a watch party for tonight's game with the Sunday Crew` | `setup_watch_party` `{crewName:'Sunday Crew', when:'tonight'}` | unit `offlineRouter.test.ts:20`; integration test `12 setup creates a new party` :253-260 (partyCode DEMO returns a new code, not DEMO) |
| `Set up a watch party for tonight's game …` (capital S) | same | unit :20 (lowercased match in `parseUtterance` :152) |
| `Who's available at center?` | `list_available_players` `{code, position:'C'}` | unit :24; integration `4 available at center` :191-197 |
| `I'm Maya, draft Big Mo` | `draft_player` `{code, memberName:'Maya', player:'Big Mo'}` | unit :29; integration `1 draft` :164-172 |
| `draft Big Mo` + speaker Maya (voice ID hint) | `draft_player` `{memberName:'Maya', player:'Big Mo'}` | unit :30 |
| `draft Splash` + speaker Maya | `draft_player` `{memberName:'Maya', player:'Splash'}` | integration `2 speaker hint` :174-182 |
| `I'm Sam, draft Big Mo` (**untested phrase**) | `draft_player` `{memberName:'Sam', player:'Big Mo'}` | same explicit-name path as unit :29 (`parseDraft` `offlineRouter.ts` :97-111). PLAYER_TAKEN message: `engine.ts` :217-228 (alternatives via `alternativesFor`). Not in a router test; the conflict was checked manually in MCP Inspector (`docs/MCP_HOSTS.md` §1) |
| `I'm Sam, put me down for the Hawks scoring first` | `make_pick` `{code, memberName:'Sam', choice:'Hawks'}` | unit :37; integration `8 make_pick` :220-227 (ok:true) |
| `Priya takes the over` | `make_pick` `{memberName:'Priya', choice:'the over'}` | unit :39; integration `9 make_pick` :229-237 (ok:false in fb-1, `not one of the choices`) |
| `Who's winning in our house?` | `get_leaderboard` `{code}` | unit :46; integration `5 leaderboard` :199-204 |
| `How's my roster doing?` + speaker Maya | `get_my_roster` `{memberName:'Maya'}` | unit :43; integration `3 roster` :184-189 |
| `Why did that one go the other way?` | `explain_last_result` `{code}` | unit :48; integration `10 explain` :239-243 |
| `How am I doing this season?` + speaker Maya | `get_season_standings` `{memberName:'Maya'}` | unit :51; integration `11 season standings` :245-251 |
| `I'm Maya, how am I doing this season?` (**untested phrase**, typed fallback) | `get_season_standings` `{memberName:'Maya'}` | explicit name, `explicitName` `offlineRouter.ts` :46-58, `known` :144, `memberName` set when `explicit` :149 |
| `Start the game` | `start_watch_party` `{code}` | unit :56; integration `6 start the game` :206-211 |
| `what's the score?` | `get_game_status` `{code}` | unit :62; integration `7 score` :213-218 |
| `draft Big Mo` (no speaker, no name) | none. Reply `Who's picking?…` | unit loop :87-96; integration `missing speaker` :262-268 |
| `banana` / empty | none. Help reply | unit :98-107; integration `unknown utterance` :270-275 |
| `Set up a watch party for the football game with the Sunday Crew` | `setup_watch_party` `{crewName:'Sunday Crew', gameTitle:'football'}` | unit `offlineRouter.test.ts:68` (lowercase); football conversation test :320-321 |
| `Who's available at quarterback?` | `list_available_players` `{code, position:'QB'}` | unit :70 (lowercase); conversation test :334-337 |
| `I'm Maya, draft Slingshot` (nickname) | `draft_player` `{memberName:'Maya', player:'Slingshot'}` | same path as unit :75 (`I'm Leo, draft Boots`) and :29; the nickname resolves server side. **untested phrase** as that exact string |
| `put me down for yes` + speaker Maya | `make_pick` `{memberName:'Maya', choice:'yes'}` | unit :76 |
| `I'm Maya, put me down for yes` (typed fallback) | `make_pick` `{memberName:'Maya', choice:'yes'}` | **untested phrase**; explicit name + the `put me down for` path of unit :37 |
| `Leo says no` | `make_pick` `{memberName:'Leo', choice:'no'}` | unit :77 |
| `I'm Sam, put me down for no` | `make_pick` `{memberName:'Sam', choice:'no'}` | **untested phrase**; same path as unit :37 with choice `no` (`cleanChoice` leaves `no` alone) |
| `Priya says no` + speaker Priya | `make_pick` `{memberName:'Priya', choice:'no'}` | **untested phrase**; same path as unit :77 (`Leo says no`) |
| `I'm Sam, they score` | `make_pick` `{memberName:'Sam', choice:'they score'}` | unit :82 (`BARE_ANSWER` in `parsePick`; fixed after the capture run, which still showed the old status reply) |
| `Why did that one go the other way?` (football) | `explain_last_result` `{code}` | same as basketball unit :48; football conversation test :364-369 checks the answer and the right-pick line |
| `What's the score?` (football) | `get_game_status` `{code}` | unit :62; conversation test :344-349 (`will they score?`) |
| `Who's winning in our house?` (football) | `get_leaderboard` `{code}` | unit :46 |
| Unreachable `/mcp` | none. `I can't reach the game right now.` | integration `does not throw…` :277-283 |

Other sources used:
- Device UI: `web/src/device/DevicePage.tsx` :112 (party chip), :145 (`Talk to the assistant`), :155 ("Tap to talk" hint), :162 (typed box), :207-217 (trace toggle).
- Speaker logic: `web/src/device/useSpeaker.ts` :60, :105; `useSpeaker.finish` :62-104.
- Current-party lookup: `server/src/game/store.ts` :201-206; `web/src/device/assistantClient.ts` :40-50.
- Prop windows: `server/src/ai/fallback/props.json`; `engine.propStatus` `server/src/game/engine.ts` :84-90; clock `engine.computeGameT` :47-50.
- Enrollment sentences and thresholds: `web/src/voiceid/EnrollPanel.tsx` :7-11; `docs/VOICE_ID.md` §5, §5a.
- Setup reply text: `server/src/mcp/server.ts` :218-227.
- Checkpoint 4 sync 0.98 s and season-after-restart: `docs/HANDOFF.md` §4; `docs/MCP_HOSTS.md` §1-§3 for Inspector and basic-host steps.
