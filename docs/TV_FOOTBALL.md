# TV view: football game and pick bonuses (brief for Codex)

## Implementation: 2026-10-21

Implemented on `feature/tv-football`, based on `be94b45`:

- Football field replaces the court, with possession, drive-start yard line and direction. End-of-drive events clear the marker, including turnovers emitted as `play` events. Missing context and final games do not show stale possession.
- Play-by-play shows the latest three plays with wrapping text and football clock tags; basketball keeps its own clock scale.
- Paired yes/no pick cards show historical drive percentages for open and locked questions. Probabilities use the supplied option value or the historical data; missing/invalid values are omitted.
- Last resolved pick bonuses remain visible while another pick is open. Standings show each member's last earned bonus and server-scored points, using `BONUS_COPY`.
- Leader roster shows positions and server stat lines. Existing draft cards already support football positions; regression tests now cover them.

Validation: 294 web tests passed, server/widget/web typechecks passed, and the web production build passed. The build retains its existing large-chunk warning. Nine browser checks used real in-memory game-engine states: football open, locked, resolved, four-player bonuses (1600×900 and 1920×1080), draft, final, rosters, and basketball live. No clipped content in the checked panels or browser exceptions. No backend or shared-contract changes.

The field marker intentionally means **drive start**, not a live ball location; that is the position provided by the API. Local preview and screenshots are under the worktree's ignored `server/data/tv-football-qa/`.

## Original brief

Phase 8 added a second replay game and pick bonuses. The server, MCP widget and device page support both. The TV
(`web/src/tv/**`, Codex's) loads a football party without crashing, but it does not show anything football- or bonus-specific
yet. This page lists the gaps and the state fields to use. Nothing here requires a server change.

Try it: `npm run demo`, then on a device page say or type "set up a watch party for the football game with the Sunday Crew",
draft, "start the game", and open `/tv/<CODE>`. Or run `npm run play -w server -- --game riverton-vs-ironwood` for a scripted run.

## State fields (`GET /api/parties/:code/state`, types in `server/src/shared/types.ts`)

| Need | Field |
|---|---|
| Which game | `game.sport` — `'football'`, or absent for basketball |
| Football clock | `game.clock` is already football time ("Q2 3:13", 15:00 quarters) |
| Positions | `draftBoard[].player.position` — `QB` `RB` `WR` `TE` `K` (basketball: `PG` `SG` `SF` `PF` `C`) |
| Stat lines | `draftBoard[].statLine`, `standings[].roster[].statLine` — server-formatted, e.g. "76 PASS YDS, 1 PASS TD" |
| Drive context | `recentEvents[]` with `type: 'drive'` and no `driveResult` = drive start; `event.drive` = `{id, team, yardline100, halfSecondsRemaining}` (`yardline100` = yards to the opponent's end zone: 75 → "own 25"). The drive end event carries `driveResult` (`td` `fg` `missed_fg` `punt` `turnover` `downs` `end_of_half` `safety`) |
| Drive question | `activeProp.resolver` = `{kind: 'driveResult', driveId, outcome: 'score' \| 'td'}`, options `yes` / `no` |
| Historical % | `activeProp.odds` = `{source: 'drive_odds', bucket, n, p: {yes, no}}` → "Drives like this score 36% of the time" (`outcome: 'td'` → "get a touchdown") |
| Bonus chips | `picks[].score` on the last resolved prop: `{correct, points, factor, streak, speed, contrarian, odds, bonuses[]}`; labels from `BONUS_COPY` (`early_call` "Early call", `quick_call` "Quick call", `lone_call` "Lone call", `against_the_room` "Against the room", `bold_call` "Bold call") |
| Per-member last bonus | `standings[].lastPickScore` (same shape) |

Bonuses apply to the basketball `DEMO` too, so bonus chips are the most visible gap.

## Gaps seen on `/tv/<code>` (mid-game, 1600×900)

1. The field panel draws a basketball court on a football game.
2. Play-by-play text is truncated with "…".
3. No drive context ("Otters ball at their own 25", a field marker).
4. The live pick card has no historical-% line.
5. No bonus chips on resolved picks (both games).
6. Football positions are not shown on Top of the Bench or the draft view.
7. No yes/no layout for drive questions.

Copy rules: points, multiplier, call. Never bet, wager, payout or "odds boost". Fictional teams only.
