# TV view: football game and pick bonuses (brief for Codex)

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
8. Season table (final view): the "Pts" column shows `rows[].points` (pick points only), but rows are ranked by
   `points + fantasyPoints`, so a lower "Pts" can sit above a higher one. Show the total (or both columns). Seen on a fresh-clone run.

Copy rules: points, multiplier, call. Never bet, wager, payout or "odds boost". Fictional teams only.
