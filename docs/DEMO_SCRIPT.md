# Demo script (<= 2:50)

Benchwarmers: a voice-driven fantasy pick'em for a game-night watch party. Two households (Austin, Seattle) play one party on a shared TV view, talking to a simulated Alexa+ device. The assistant is a rule router in front of our own MCP server.

Every utterance below is traced to a router test or rule in the appendix. Tested phrasing is quoted exactly. Anything marked **untested phrase** runs the same code path as a tested one but was not run as that exact string. Rehearse it once before a take.

## 0. Pre-recording checklist

### Setup
- [ ] Node 22+ (HANDOFF says >= 22). `npm ci` at repo root.
- [ ] Ports free. Codex's Vite owns **5173** on this machine (HANDOFF §3). Use `WEB_PORT=5175`. Server `PORT=3001` (default).
  PowerShell: `$env:PORT=3001; $env:WEB_PORT=5175; npm run demo`
- [ ] `npm run demo` (root). It runs `build:widget -w server` first (the `/mcp` widget must be built or it serves "Widget not built"), then server (`SPEED=4`) and web. Prints the URLs. Ctrl+C stops both.
- [ ] Check `http://localhost:3001/healthz`. Check `POST http://localhost:3001/mcp` returns 401 without the bearer.
- [ ] Avast on this machine can stall loopback `/mcp` (HANDOFF §6). If `/mcp` hangs, re-run the take, do not debug live.
- [ ] `ASSISTANT_MODE` unset or `offline`. Offline needs zero AWS creds. Bedrock is **not** part of this demo.
- [ ] `AI_MODE` unset or `fallback`. Props and recap come from fallback content.

### Browser and mic
- [ ] Chrome only. Web Speech recognition is not in Firefox (`voice-id` notes, VOICE_ID §9). Use Chrome for both device windows.
- [ ] Mic permission granted to `localhost:5175` in Chrome before recording (site settings > microphone).
- [ ] USB headset, not the laptop mic. Set Windows default input to the headset.
- [ ] Dry run in the same Chrome profile: both device pages capturing at once. HANDOFF §9 lists "Chrome shares the mic between Web Speech and getUserMedia" as **unverified**. Confirm in the dry run.

### Voice ID
- [ ] Open `http://localhost:5175/voice-lab`. Choose household **garcias**. Wait for the model to load. First load is slow (102 MB download, VOICE_ID §3). Once cached it is about 20 s (VOICE_ID §5a). Warm it the day before and keep the same browser profile.
- [ ] Enroll **Maya** and **Leo** (Garcias) with the three sentences in `EnrollPanel` (each clip needs >= 1.5 s speech).
- [ ] Enroll **Sam** and **Priya** on `household=sams-place` the same way.
- [ ] Test "Who's talking?" a few times at the device distance, with the TV audio on. Note whether Maya is recognised. If it is not, use the fallbacks in section 3.

### Data and reset
- [ ] `npm run demo:reset` before **every** take. It posts `/api/parties/DEMO/reset` (PORT default 3001). It restores DEMO and season stats.
- [ ] Setup creates a new party every time it runs (`store.createParty`). Reset does not delete those. Device pages pick the newest non-final party for the crew (`store.getCurrentPartyCode`). Reset re-stamps DEMO (`seedState(now)`), so DEMO should win again. Confirm with the party chip after reset.

### Recording
- [ ] OBS. Scene: TV view large (`http://localhost:5175/tv/DEMO`, or `/tv/<CODE>` after setup), Austin device (`/device/garcias`) and Seattle device (`/device/sams-place`) small, side by side. Browser zoom so each device fits without scroll.
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
| 2:15–2:30 | Browser: MCP Inspector, bearer header set | none (narration) | 11 tools listed. Protocol 2025-11-25 over Streamable HTTP. Widget renders from `_meta.ui` | none (not a router call) |
| 2:30–2:50 | Architecture slide | none (narration) | Architecture: MCP server + MCP App widget + Bedrock (not run in this demo). Vision line | none |

Optional inserts (only if time):
- Agent-trace toggle is on the Austin device at beat 2. Show `Show agent trace` (`data-testid="trace-toggle"`) listing each call. In offline mode it lists one call per turn (see quirks).
- The Garcias `explain` line (`Why did that one go the other way?`, test `10 explain`) can replace `Who's winning…` if beat 4 is short.

### Beat-by-beat narration

**0:00–0:20 Problem.** "Friends in two cities want the same game night. Today they text scores. Benchwarmers puts the game on one TV, and each house talks to it by voice."

**0:20–0:45 Set up.** "I just say 'set up a watch party.' The assistant calls our MCP server. The code is on the screen, and Seattle picks it up." Turn on the trace toggle. Point at the one call.

**0:45–1:10 Draft.** "Who's available at center? Big Mo. The draft board fills on the TV. Sam tries the same player and gets alternatives." Then the voice ID moment: "Draft Big Mo," no name. Show that the router attributed it to Maya. If the hint is wrong or missing, say so on screen and use the fallback. Do not claim recognition the take does not show.

**1:10–1:50 Live.** "Sam calls the first basket, Hawks. The pick lands in both houses within a second. Then a pick by Priya." Use the window timing in section 2. "Who's winning in our house?" then cut to the TV standings.

**1:50–2:15 Final.** "The final whistle gives a podium and a recap. And here's the season question: 'how am I doing this season?' That answer persists across server restarts." Verified: season persistence across restart (HANDOFF §4 / Checkpoint 4 note).

**2:15–2:30 Protocol.** "Same server, plain MCP. This is the MCP Inspector: 11 tools, Streamable HTTP, protocol 2025-11-25. The widget is an MCP App."

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

## Appendix: utterance trace

Line numbers are for the phase/6-polish branch. All tests run with `npx vitest run test/assistant/offlineRouter.test.ts` in `server/`: 69 passed.

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
| Unreachable `/mcp` | none. `I can't reach the game right now.` | integration `does not throw…` :277-283 |

Other sources used:
- Device UI: `web/src/device/DevicePage.tsx` :112 (party chip), :145 (`Talk to the assistant`), :155 ("Tap to talk" hint), :162 (typed box), :207-217 (trace toggle).
- Speaker logic: `web/src/device/useSpeaker.ts` :60, :105; `useSpeaker.finish` :62-104.
- Current-party lookup: `server/src/game/store.ts` :201-206; `web/src/device/assistantClient.ts` :40-50.
- Prop windows: `server/src/ai/fallback/props.json`; `engine.propStatus` `server/src/game/engine.ts` :84-90; clock `engine.computeGameT` :47-50.
- Enrollment sentences and thresholds: `web/src/voiceid/EnrollPanel.tsx` :7-11; `docs/VOICE_ID.md` §5, §5a.
- Setup reply text: `server/src/mcp/server.ts` :218-227.
- Checkpoint 4 sync 0.98 s and season-after-restart: `docs/HANDOFF.md` §4; `docs/MCP_HOSTS.md` §1-§3 for Inspector and basic-host steps.
