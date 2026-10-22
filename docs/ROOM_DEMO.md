# Football room demo

Benchwarmers now hosts real participants in one room. Each person chooses one captain and four flex athletes under a $50,000 salary cap. Everyone can select the same athletes. The captain costs and scores 1.5x. The shared screen follows a fictional football replay while phones submit predictions and show personal points. No household setup, bots, sports subscription, or cloud AI credentials are needed.

## Run and invite players

From this checkout:

```powershell
npm ci
npm run demo
```

The demo builds the web interface and MCP widget, then serves everything at `http://localhost:3001`. Use **Create football room**, join under your name, and choose **Open TV view** for the screen you broadcast. Share the printed LAN address with other people on the same Wi-Fi. Their phones open that address, enter the room code and a display name, build a lineup, and save it. Open the TV through the LAN address too so the join URL it displays is usable on phones.

The host's browser retains host controls. Start when everybody is ready; missing lineups are filled with legal balanced lineups. Pause/resume and 1-4x speed controls are available. Prediction windows always provide at least five active real seconds, including at 4x. At 1x the game takes several minutes; use 4x for a short recording. Everyone sees a single server-authoritative score and leaderboard.

For players outside the Wi-Fi network, serve the same built app through a tunnel:

```powershell
cloudflared tunnel --url http://localhost:3001
```

Share the resulting HTTPS address and open the TV with that address. Typed commands work without a microphone. Browser microphone recognition generally requires HTTPS or localhost; it depends on browser support. The replay itself needs no internet connection. Physical-device connectivity depends on local firewall/router settings and must be checked on the actual Wi-Fi.

Override `PORT` if 3001 is occupied. Override `ROOM_DATA_FILE` for an independent saved demo; `ROOM_SPEED` sets the initial replay speed. The demo prints LAN URLs. Do not share host or participant credentials; the UI keeps them in browser storage and excludes them from join URLs and public snapshots.

## Script, player names, and statistics

The demo ports Watch Party Fantasy's original fictional game, play texts, 25-player pool, salaries, and stat deltas into `server/src/room/replay/`, with its MIT license. Final: **Vermont's Morning Wood 27, South Dakota Swiss Cheese 24**, ending on Justin Time's field goal. All 25 players already have script-generated stats, so no additional invented box score was necessary.

| Player | Position | Original final statistics | Weighted fantasy points |
|---|---|---|---:|
| Hugh Jass | OL |86 team rush yards,1 team rush TD,2 sacks allowed,2 penalties |9.00|
| Holden Penalty | LT |86 team rush yards,1 team rush TD,1 sack allowed,3 penalties |10.25|
| Harry Butz | RT |86 team rush yards,1 team rush TD,2 sacks allowed |16.50|
| Phil McCracken | P |148 punt yards,3 punts inside20 |13.55|
| Ben Dover | LS |8 clean snaps |12.80|
| Justin Time | K |Two40+ yard field goals,3 extra points |12.65|
| Chip Shot | K/P |85 punt yards,1 field goal,3 extra points |13.16|

Offensive-line team rushing credits are a game proxy for blocking contribution. Clean snaps are script-generated events. These are fictional demo rules, not measured real-game individual blocking analytics. The role/stat model also credits receptions, passing/rushing/receiving production, tackles, sacks, interceptions, passes defended, recoveries, and defensive touchdowns.

Position weights: QB1.1; RB/FB1; WR0.85; TE1; K1.15; K/P1.4; OL/LT/RT2.5; DL1.2; LB0.85; CB/FS/SS/S1; P1.3; LS1.6. Stat points are multiplied by the position weight, then the captain bonus if applicable. Rules are snapshotted per room. This tuning narrows this script's pre-captain player-point range to 9-23.715; it does not establish real-world balance across future games. Original salaries remain intact.

## Predictions

One featured question per drive rotates four-way outcomes (TD10, FG12, punt6, turnover15 base points) with yes/no scoring or touchdown questions (10 base points). Picks close before the first play. A changed choice uses the new time for speed scoring; resending the same choice preserves its original time.

Correct points = base x streak x speed x minority-choice x historical-probability reference, capped at 5x base and rounded to0.5. Wrong and missed questions break the streak. The rules panel exposes scoring weights and bonuses.

- Streak:1x,1.5x, then2x.
- Speed:1.25x for the first 25% of the window,1.10x through 60%.
- Minority:1.5x for a lone call with at least 3 pickers, or1.2x below half the room with at least 2 pickers.
- Historical factor: `(1 / number of options) / option probability`, clamped 0.5-2x.

Yes/no questions use the existing historical field-position/clock table derived from 64,085 NFL drives. Four-way questions use pooled, **conditional** historical proportions: TD 14,731; FG 9,962; punt 24,918; turnover 10,986 (including turnovers on downs and opposing defensive touchdowns); total 60,597 supported outcomes. Missed field goals, end-of-half, and safety outcomes are excluded from this conditional distribution. These are historical reference percentages, not live forecasts or percentages derived from future demo plays. Attribution: nflverse/nflfastR,2015-2025, CC-BY4.0; see `tools/odds/README.md`.

## Saved rooms and seasons

Rooms are stored separately in `server/data/rooms.json` by default. Legacy household party data is preserved. Reloading the page restores the participant's private seat from browser storage; a name alone cannot take someone else's seat. The saved participant identity can join later rooms in the same season. Completed rooms add lineup and prediction points to season standings exactly once.

Pause freezes the prediction timer. Restarting the server resumes from its last durable replay position; time while the server was stopped does not skip questions. Late joiners receive a legal automatic lineup and earn fantasy points only from events after joining. Create another room for another night; completed nights remain saved.

## Alexa/MCP and voice demo

The same `/mcp` endpoint exposes `room_create`, `room_list`, `room_join`, `room_status`, `room_player_pool`, `room_set_lineup`, `room_auto_lineup`, `room_predict`, `room_leaderboard`, `room_season`, and `room_host`. MCP requires the configured bearer token. The rules resource is `benchwarmers://room-rules`. Existing household tools remain available for old parties.

The phone's typed/microphone assistant calls the same room validation and mutations as REST and MCP. Try **pick sleepers for me**, **make Ben Dover my captain**, **lock in touchdown**, **yes**, **what's my rank**, or **what's the score**. The host can say **kick off**, **pause**, **resume**, or **replay speed 4**. This is a browser simulation, not a connection to a real Alexa+ device. The phone room flow intentionally uses deterministic commands for this scripted demo.

## Verification (2026-10-22)

- Server: 737 tests passed with `npm run test -w server -- --maxWorkers=1`. A parallel run hit the existing antivirus/loopback socket failure in a legacy MCP-client test; serial execution passed without changing assertions or timeouts.
- Web: 408 tests passed. Server/widget/web/extension type checks and the web production build passed. The existing large main-chunk build warning remains.
- Real HTTP and headless Chromium checkpoint: host creates and joins through the UI, saves a lineup, 31 other test clients join, a separate participant view submits a pick, all 16 drive questions complete, final score is 27-24, all 25 players score, and 32 season rows survive a server restart without double counting.
- Browser widths: phone 390px with no horizontal overflow; TV 1920x1080 and 1280x720 with no page overflow. Directional input reaches the final leaderboard row; Back closes the rules popover and restores focus. No JavaScript exceptions observed.
- Read-only code review found and verified fixes for invalid-seat recovery and host actions losing the private player snapshot. Reviewed credential authorization, public snapshots, future-answer hiding, replay timing, and season persistence. No remaining Critical or Important findings in that pass.

These are simulated-client/browser checks. Physical phones, TV/remote at viewing distance, and real microphone recognition remain untested. Disposable checkpoint data and screenshots are under gitignored `server/data/room-qa/`; they are separate from the live demo's room store.
