# A02 TV focus map

Snapshot, 2026-10-22, Vite dev server `http://127.0.0.1:5197`, Chromium headless, viewport 1920x1080, `reducedMotion: 'reduce'`. Other agents were editing `web/src/tv-broadcast` and `web/src/room` during the run; re-run `scratchpad/qa/focus.cjs` and `ret.cjs` before relying on a cell. Scratchpad dir: `C:\Users\jiang\AppData\Local\Temp\claude\C--Users-jiang\d586c4cc-5b35-46cc-81ee-60846ca7938a\scratchpad\qa\`. Raw data: `focus-results.json`.

**Scope limit:** this is Playwright keyboard emulation (`page.keyboard.press`), i.e. a keyboard-like source. It does NOT establish remote-control behaviour on a real TV browser or platform (plan A02: "keyboard-like source handlers do not establish real-TV usability"). Physical remote testing was not performed.

## How both TV routes navigate

Both `/tv` and `/tv2` use the same handler, `tv-broadcast/ViewNav.tsx` (`tv/TvPage.tsx:16` imports it). Three tiers of focus targets:

1. **Menu row**: `nav.tv-nav` buttons plus any `[data-tv-menu]` inside the header's parent (`ViewNav.tsx:35-37`). Left/Right move along this row and clamp at the ends (no wrap).
2. **Actions**: `[data-tv-action]` and `summary` inside the content (`ViewNav.tsx:39`). Left/Right step within the list, Up goes to the menu, Down goes to the first scroll region.
3. **Reading regions**: `[data-tv-scroll]`. Down scrolls 180 px, Up scrolls back first and when at the top returns to the last used action (or first action, or the menu); Left/Right move between sibling regions.

Escape, `BrowserBack`, `GoBack` and legacy keyCode 4: in a forced view (`?mode=` set, or after opening a view) closes it and focuses the first menu button; otherwise, from an action or region, focuses the current menu button. Enter clicks the focused menu button or action. Held keys: `e.repeat` is ignored for Enter/Escape (verified: a repeat Enter on an action did nothing); repeated Arrow keys clamp at the row ends (8 repeats of ArrowRight from Game ended on Draft).

Legacy key codes handled (`ViewNav.tsx:5-7`): 4, 13, 37-40 only. Tizen Back (10009) and webOS Back (461) are not mapped; verified: keyCode 10009 with `key: 'Unidentified'` did nothing.

Notation: **nav** X = top nav button, **action** = `data-tv-action` button, **scroll** = `data-tv-scroll` region, **menu** = `data-tv-menu` item. "stays" = focus did not move (edge). **BODY** = focus lost to the document body. Each cell was measured by focusing the element, pressing the key once, and recording `document.activeElement`, any scrollTop change, and view change (pressed nav button).

## Return targets (multi-step checks, `ret.cjs`)

| Sequence on `/tv2/DEMO?fixture=live` | Result |
| --- | --- |
| focus "View picks", Enter, Escape | Enter opens Picks (focus on nav Picks), Escape returns focus to **action View picks** (`returnFocusRef`, `tv-broadcast/TvPage.tsx:44-48,98`). Pass |
| focus "View rosters", Enter, Escape | same, returns to **action View rosters**. Pass |
| View rosters, Enter, ArrowDown, Escape | Down lands on scroll "Party rosters"; Escape returns to action View rosters. Pass |
| View rosters, Enter, `GoBack` key | returns to action View rosters. Pass |
| View rosters, Enter, keyCode 10009 | stays on nav Rosters (Back not handled). **Fail on Tizen** |
| Press ArrowRight with 8 repeats | clamps at Draft. Pass |
| API blocked, `/tv2/DEMO` | "Party unavailable" screen; initial focus lands on **Retry** (`autoFocus`, `tv-broadcast/TvPage.tsx` connecting block and `ReconnectBanner.tsx:24`). Pass |

## Defects and risks found

1. **Footer "Home" link is unreachable by arrow keys on `/tv2`.** On `/tv` the `[data-tv-menu]` items (Auto rotate checkbox, Home) share the header's parent so Left/Right reach them. On `/tv2` Home is in the footer outside that parent: every arrow key on Home "stays", and nothing in the menu/action/reading chain leads to it. It is only reachable by Tab; Escape is the only exit. Risk (remote users cannot leave to Home). `tv-broadcast/TvPage.tsx:110`, `ViewNav.tsx:35-37`.
2. **Pressing Enter on the already-active nav button toggles back to Game on `/tv2`** (`onSelect` clears the manual mode when `current === next`, `tv-broadcast/TvPage.tsx:92`). Observed for Picks, Standings, Rosters, Draft, Results. On `/tv` the same press stays. Inconsistent. Risk.
3. **Dead end: `/tv2` Picks view has no actions or regions.** ArrowDown from nav stays; the only focusable things are nav buttons and Home (via Tab). Not a trap (Escape returns to Game) but nothing to read with the remote. Risk.
4. **`/tv` Auto rotate checkbox (`data-tv-menu`)**: Enter toggles rotation and also clears the forced view (`manualMode` set undefined, `tv/TvPage.tsx:76`), so Enter on it in Rosters jumped to Game. Risk.
5. **Nested scroll regions on Rosters** (grid `data-tv-scroll` containing four column `data-tv-scroll` articles): Left/Right traverses grid then columns in DOM order, with the grid as a first stop that scrolls nothing. Extra stop. Risk.
6. **Edge behaviour**: Left at first nav, Right at last nav, Up from nav, Down at the bottom of a scroll region: all "stay". No wrap, no trap, and Escape always returns to a nav button, so no focus traps were found.
7. **Focus lost to BODY**: only when the focused element navigates away (Home link, Enter), which is expected. No other dead end sent focus to BODY. Tab order does pass through BODY once per cycle when leaving the document, which is normal.
8. **Not tested:** pager buttons (Previous/Next) on Rosters, because the demo has 4 members (`MEMBERS_PER_PAGE = 4`, `tv-broadcast/RostersView.tsx:7`); the Retry season button on Final (`FinalView.tsx:139`); the Reconnect banner buttons during a live outage (only the initial "Party unavailable" screen was reached); the `?kiosk` and `?controls=0` variants.

## Per-view tables

Initial focus is what `document.activeElement` is after the page loads and settles: the nav button for the current view (`ViewNav.tsx` effect `:23-28` focuses the pressed button when focus is on BODY). The Tab sequence below starts from the browser's sequential focus start point, so read it as a cycle. In `/tv` and `/tv2` the nav uses a roving tabindex (only the current nav button is tabbable).

### /tv live (no mode param)

`/tv/DEMO?fixture=live`

- Initial focus: nav "Game"
- Tab cycle: menu "Auto rotate" , menu "Home" , scroll "Party standings" , **BODY** (navigated away to /) , nav "Game" , menu "Auto rotate"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Draft" | stays | scroll "Party standings" | stays | stays |
| nav "Draft" | nav "Game" | nav "Rosters" | stays | scroll "Party standings" | nav "Draft" (scroll 0 to 0,0) (view Game to Draft) | stays |
| nav "Rosters" | nav "Draft" | menu "Auto rotate" | stays | scroll "Party standings" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | stays |
| menu "Auto rotate" | nav "Rosters" | menu "Home" | stays | scroll "Party standings" | stays | stays |
| menu "Home" | menu "Auto rotate" | stays | stays | scroll "Party standings" | **BODY** (navigated away to /) | stays |
| scroll "Party standings" | stays | stays | nav "Game" | stays | stays | nav "Game" |

### /tv2 live (no mode param)

`/tv2/DEMO?fixture=live`

- Initial focus: nav "Game"
- Tab cycle: action "View picks" , action "View rosters" , scroll "Party standings" , menu "Home" , **BODY** (navigated away to /) , nav "Game" , action "View picks"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | action "View picks" | stays | stays |
| nav "Picks" | nav "Game" | nav "Standings" | stays | action "View picks" | nav "Picks" (scroll 0 to ) (view Game to Picks) | stays |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | action "View picks" | nav "Standings" (view Game to Standings) | stays |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | action "View picks" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | stays |
| nav "Draft" | nav "Rosters" | stays | stays | action "View picks" | nav "Draft" (scroll 0 to 0,0) (view Game to Draft) | stays |
| action "View picks" | stays | action "View rosters" | nav "Game" | scroll "Party standings" | nav "Picks" (scroll 0 to ) (view Game to Picks) | nav "Game" |
| action "View rosters" | action "View picks" | stays | nav "Game" | scroll "Party standings" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | nav "Game" |
| scroll "Party standings" | stays | stays | action "View picks" | stays | stays | nav "Game" |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | stays |

### /tv live

`/tv/DEMO?fixture=live&mode=live`

- Initial focus: nav "Game"
- Tab cycle: menu "Auto rotate" , menu "Home" , scroll "Party standings" , **BODY** (navigated away to /) , nav "Game" , menu "Auto rotate"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Draft" | stays | scroll "Party standings" | stays | stays |
| nav "Draft" | nav "Game" | nav "Rosters" | stays | scroll "Party standings" | nav "Draft" (scroll 0 to 0,0) (view Game to Draft) | nav "Game" |
| nav "Rosters" | nav "Draft" | menu "Auto rotate" | stays | scroll "Party standings" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | nav "Game" |
| menu "Auto rotate" | nav "Rosters" | menu "Home" | stays | scroll "Party standings" | stays | nav "Game" |
| menu "Home" | menu "Auto rotate" | stays | stays | scroll "Party standings" | **BODY** (navigated away to /) | nav "Game" |
| scroll "Party standings" | stays | stays | nav "Game" | stays | stays | nav "Game" |

### /tv draft

`/tv/DEMO?fixture=drafting&mode=draft`

- Initial focus: nav "Draft"
- Tab cycle: menu "Auto rotate" , menu "Home" , scroll "Harbor Hawks draft players" , scroll "Summit Foxes draft players" , **BODY** (navigated away to /) , nav "Draft" , menu "Auto rotate"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Draft" | stays | scroll "Harbor Hawks draft players" | nav "Game" (scroll 0,0 to 0) (view Draft to Game) | stays |
| nav "Draft" | nav "Game" | nav "Rosters" | stays | scroll "Harbor Hawks draft players" | stays | nav "Game" |
| nav "Rosters" | nav "Draft" | menu "Auto rotate" | stays | scroll "Harbor Hawks draft players" | nav "Rosters" (scroll 0,0 to 0,0,0,0,0) (view Draft to Rosters) | nav "Game" |
| menu "Auto rotate" | nav "Rosters" | menu "Home" | stays | scroll "Harbor Hawks draft players" | stays | nav "Game" |
| menu "Home" | menu "Auto rotate" | stays | stays | scroll "Harbor Hawks draft players" | **BODY** (navigated away to /) | nav "Game" |
| scroll "Harbor Hawks draft players" | stays | scroll "Summit Foxes draft players" | nav "Draft" | scroll "Harbor Hawks draft players" (scroll 0,0 to 180,0) | stays | nav "Game" |
| scroll "Summit Foxes draft players" | scroll "Harbor Hawks draft players" | stays | nav "Draft" | scroll "Summit Foxes draft players" (scroll 0,0 to 0,180) | stays | nav "Game" |

### /tv rosters

`/tv/DEMO?fixture=live&mode=rosters`

- Initial focus: nav "Rosters"
- Tab cycle: menu "Auto rotate" , menu "Home" , scroll "Party rosters" , scroll "Maya roster" , scroll "Sam roster" , scroll "Priya roster" , scroll "Leo roster" , **BODY** (navigated away to /) , nav "Rosters" , menu "Auto rotate"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Draft" | stays | scroll "Party rosters" | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Draft" | nav "Game" | nav "Rosters" | stays | scroll "Party rosters" | nav "Draft" (scroll 0,0,0,0,0 to 0,0) (view Rosters to Draft) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Rosters" | nav "Draft" | menu "Auto rotate" | stays | scroll "Party rosters" | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| menu "Auto rotate" | nav "Rosters" | menu "Home" | stays | scroll "Party rosters" | menu "Auto rotate" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| menu "Home" | menu "Auto rotate" | stays | stays | scroll "Party rosters" | **BODY** (navigated away to /) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Party rosters" | stays | scroll "Maya roster" | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Maya roster" | scroll "Party rosters" | scroll "Sam roster" | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Sam roster" | scroll "Maya roster" | scroll "Priya roster" | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Priya roster" | scroll "Sam roster" | scroll "Leo roster" | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Leo roster" | scroll "Priya roster" | stays | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |

### /tv final

`/tv/DEMO?fixture=final&mode=final`

- Initial focus: nav "Results"
- Tab cycle: menu "Auto rotate" , menu "Home" , scroll "Final standings" , scroll "Recap and season standings" , summary "Postgame note" , **BODY** (navigated away to /) , nav "Results" , menu "Auto rotate"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Draft" | stays | summary "Postgame note" | nav "Game" (scroll 0,0 to 0) (view Results to Game) | stays |
| nav "Draft" | nav "Game" | nav "Rosters" | stays | summary "Postgame note" | nav "Draft" (view Results to Draft) | nav "Game" |
| nav "Rosters" | nav "Draft" | nav "Results" | stays | summary "Postgame note" | nav "Rosters" (scroll 0,0 to 0,0,0,0,0) (view Results to Rosters) | nav "Game" |
| nav "Results" | nav "Rosters" | menu "Auto rotate" | stays | summary "Postgame note" | stays | nav "Game" |
| menu "Auto rotate" | nav "Results" | menu "Home" | stays | summary "Postgame note" | stays | nav "Game" |
| menu "Home" | menu "Auto rotate" | stays | stays | summary "Postgame note" | **BODY** (navigated away to /) | nav "Game" |
| scroll "Final standings" | stays | scroll "Recap and season standings" | summary "Postgame note" | stays | stays | nav "Game" |
| scroll "Recap and season standings" | scroll "Final standings" | stays | summary "Postgame note" | stays | stays | nav "Game" |
| summary "Postgame note" | stays | stays | nav "Results" | scroll "Final standings" | stays | nav "Game" |

### /tv2 live

`/tv2/DEMO?fixture=live&mode=live`

- Initial focus: nav "Game"
- Tab cycle: action "View picks" , action "View rosters" , scroll "Party standings" , menu "Home" , **BODY** (navigated away to /) , nav "Game" , action "View picks"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | action "View picks" | stays | stays |
| nav "Picks" | nav "Game" | nav "Standings" | stays | action "View picks" | nav "Picks" (scroll 0 to ) (view Game to Picks) | nav "Game" |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | action "View picks" | nav "Standings" (view Game to Standings) | nav "Game" |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | action "View picks" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | nav "Game" |
| nav "Draft" | nav "Rosters" | stays | stays | action "View picks" | nav "Draft" (scroll 0 to 0,0) (view Game to Draft) | nav "Game" |
| action "View picks" | stays | action "View rosters" | nav "Game" | scroll "Party standings" | nav "Picks" (scroll 0 to ) (view Game to Picks) | nav "Game" |
| action "View rosters" | action "View picks" | stays | nav "Game" | scroll "Party standings" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Game to Rosters) | nav "Game" |
| scroll "Party standings" | stays | stays | action "View picks" | stays | stays | nav "Game" |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" |

### /tv2 picks

`/tv2/DEMO?fixture=live&mode=picks`

- Initial focus: nav "Picks"
- Tab cycle: menu "Home" , **BODY** (navigated away to /) , nav "Picks" , menu "Home"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | stays | nav "Game" (scroll  to 0) (view Picks to Game) | nav "Game" (scroll  to 0) (view Picks to Game) |
| nav "Picks" | nav "Game" | nav "Standings" | stays | stays | nav "Picks" (scroll  to 0) (view Picks to Game) | nav "Game" (scroll  to 0) (view Picks to Game) |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | stays | nav "Standings" (scroll  to 0) (view Picks to Standings) | nav "Game" (scroll  to 0) (view Picks to Game) |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | stays | nav "Rosters" (scroll  to 0,0,0,0,0) (view Picks to Rosters) | nav "Game" (scroll  to 0) (view Picks to Game) |
| nav "Draft" | nav "Rosters" | stays | stays | stays | nav "Draft" (scroll  to 0,0) (view Picks to Draft) | nav "Game" (scroll  to 0) (view Picks to Game) |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" (scroll  to 0) (view Picks to Game) |

### /tv2 standings

`/tv2/DEMO?fixture=live&mode=standings`

- Initial focus: nav "Standings"
- Tab cycle: scroll "Party standings" , menu "Home" , **BODY** (navigated away to /) , nav "Standings" , scroll "Party standings"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | scroll "Party standings" | nav "Game" (view Standings to Game) | nav "Game" (view Standings to Game) |
| nav "Picks" | nav "Game" | nav "Standings" | stays | scroll "Party standings" | nav "Picks" (scroll 0 to ) (view Standings to Picks) | nav "Game" (view Standings to Game) |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | scroll "Party standings" | nav "Standings" (view Standings to Game) | nav "Game" (view Standings to Game) |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | scroll "Party standings" | nav "Rosters" (scroll 0 to 0,0,0,0,0) (view Standings to Rosters) | nav "Game" (view Standings to Game) |
| nav "Draft" | nav "Rosters" | stays | stays | scroll "Party standings" | nav "Draft" (scroll 0 to 0,0) (view Standings to Draft) | nav "Game" (view Standings to Game) |
| scroll "Party standings" | stays | stays | nav "Standings" | scroll "Party standings" (scroll 0 to 80) | stays | nav "Game" (view Standings to Game) |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" (view Standings to Game) |

### /tv2 rosters

`/tv2/DEMO?fixture=live&mode=rosters`

- Initial focus: nav "Rosters"
- Tab cycle: scroll "Party rosters" , scroll "Maya roster" , scroll "Sam roster" , scroll "Priya roster" , scroll "Leo roster" , menu "Home" , **BODY** (navigated away to /) , nav "Rosters" , scroll "Party rosters"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | scroll "Party rosters" | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Picks" | nav "Game" | nav "Standings" | stays | scroll "Party rosters" | nav "Picks" (scroll 0,0,0,0,0 to ) (view Rosters to Picks) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | scroll "Party rosters" | nav "Standings" (scroll 0,0,0,0,0 to 0) (view Rosters to Standings) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | scroll "Party rosters" | nav "Rosters" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| nav "Draft" | nav "Rosters" | stays | stays | scroll "Party rosters" | nav "Draft" (scroll 0,0,0,0,0 to 0,0) (view Rosters to Draft) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Party rosters" | stays | scroll "Maya roster" | nav "Rosters" | stays | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Maya roster" | scroll "Party rosters" | scroll "Sam roster" | nav "Rosters" | scroll "Maya roster" (scroll 0,0,0,0,0 to 0,180,0,0,0) | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Sam roster" | scroll "Maya roster" | scroll "Priya roster" | nav "Rosters" | scroll "Sam roster" (scroll 0,0,0,0,0 to 0,0,180,0,0) | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Priya roster" | scroll "Sam roster" | scroll "Leo roster" | nav "Rosters" | scroll "Priya roster" (scroll 0,0,0,0,0 to 0,0,0,180,0) | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| scroll "Leo roster" | scroll "Priya roster" | stays | nav "Rosters" | scroll "Leo roster" (scroll 0,0,0,0,0 to 0,0,0,0,180) | stays | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" (scroll 0,0,0,0,0 to 0) (view Rosters to Game) |

### /tv2 draft

`/tv2/DEMO?fixture=drafting&mode=draft`

- Initial focus: nav "Draft"
- Tab cycle: scroll "Harbor Hawks draft players" , scroll "Summit Foxes draft players" , menu "Home" , **BODY** (navigated away to /) , nav "Draft" , scroll "Harbor Hawks draft players"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | scroll "Harbor Hawks draft players" | nav "Game" (scroll 0,0 to 0) (view Draft to Game) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| nav "Picks" | nav "Game" | nav "Standings" | stays | scroll "Harbor Hawks draft players" | nav "Picks" (scroll 0,0 to ) (view Draft to Picks) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | scroll "Harbor Hawks draft players" | nav "Standings" (scroll 0,0 to 0) (view Draft to Standings) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | scroll "Harbor Hawks draft players" | nav "Rosters" (scroll 0,0 to 0,0,0,0,0) (view Draft to Rosters) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| nav "Draft" | nav "Rosters" | stays | stays | scroll "Harbor Hawks draft players" | nav "Draft" (scroll 0,0 to 0) (view Draft to Game) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| scroll "Harbor Hawks draft players" | stays | scroll "Summit Foxes draft players" | nav "Draft" | scroll "Harbor Hawks draft players" (scroll 0,0 to 180,0) | stays | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| scroll "Summit Foxes draft players" | scroll "Harbor Hawks draft players" | stays | nav "Draft" | scroll "Summit Foxes draft players" (scroll 0,0 to 0,180) | stays | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" (scroll 0,0 to 0) (view Draft to Game) |

### /tv2 final

`/tv2/DEMO?fixture=final&mode=final`

- Initial focus: nav "Results"
- Tab cycle: scroll "Final standings" , scroll "Recap and season standings" , summary "Postgame note" , menu "Home" , **BODY** (navigated away to /) , nav "Results" , scroll "Final standings"

| Focused element | Left | Right | Up | Down | Enter | Escape / Back |
| --- | --- | --- | --- | --- | --- | --- |
| nav "Game" | stays | nav "Picks" | stays | summary "Postgame note" | nav "Game" (scroll 0,0 to 0) (view Results to Game) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| nav "Picks" | nav "Game" | nav "Standings" | stays | summary "Postgame note" | nav "Picks" (scroll 0,0 to ) (view Results to Picks) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| nav "Standings" | nav "Picks" | nav "Rosters" | stays | summary "Postgame note" | nav "Standings" (scroll 0,0 to 0) (view Results to Standings) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| nav "Rosters" | nav "Standings" | nav "Draft" | stays | summary "Postgame note" | nav "Rosters" (scroll 0,0 to 0,0,0,0,0) (view Results to Rosters) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| nav "Draft" | nav "Rosters" | nav "Results" | stays | summary "Postgame note" | nav "Draft" (view Results to Draft) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| nav "Results" | nav "Draft" | stays | stays | summary "Postgame note" | nav "Results" (scroll 0,0 to 0) (view Results to Game) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| scroll "Final standings" | stays | scroll "Recap and season standings" | summary "Postgame note" | stays | stays | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| scroll "Recap and season standings" | scroll "Final standings" | stays | summary "Postgame note" | scroll "Recap and season standings" (scroll 0,0 to 0,69) | stays | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| summary "Postgame note" | stays | stays | nav "Results" | scroll "Final standings" | stays | nav "Game" (scroll 0,0 to 0) (view Results to Game) |
| menu "Home" | stays | stays | stays | stays | **BODY** (navigated away to /) | nav "Game" (scroll 0,0 to 0) (view Results to Game) |

Notes on the tables: "(view X to Y)" is the pressed nav button before and after the key. `/tv live (no mode param)` and `/tv2 live (no mode param)` load `?fixture=live` without `mode`, i.e. not a forced view, so Escape from a nav button stays put; on the `mode=live` rows the view is forced and Escape from any element returns to Game. On `/tv` draft the nav Escape cells "stay" because the party status `drafting` makes Draft the automatic view (`tv/modes.ts`).
