# TV overlay verification

> Historical verification for the earlier overlay layout. The 2026-10-21 implementation and current preview modes are documented in [TV_GAME_NIGHT_DESIGN.md](TV_GAME_NIGHT_DESIGN.md).

Branch: `design/tv-broadcast`, based on `dev` at `e18665e`.

The user's later game-first requirements supersede the original full-dashboard layout. See `specs/2026-10-20-game-overlay.md`.

## Current behavior

The default is a transparent OBS overlay with a compact score strip. Draft, Rosters, Standings, Picks, and Results open only when toggled. There is no simulated court or automatic view rotation. Selecting an open panel again, selecting Game, or pressing Back closes it.

Raised buttons, mint selection, clear focus outlines, short pressed states, and restrained panel transitions supply the requested tactile feel. Reduced-motion settings disable transitions and fantasy-point animations.

## Preview and OBS

- Interactive demo: http://127.0.0.1:5173/tv/DEMO?fixture=live
- Clean OBS demo: http://127.0.0.1:5173/tv/DEMO?fixture=live&controls=0
- Draft preview: http://127.0.0.1:5173/tv/DEMO?fixture=drafting&mode=draft
- Rosters preview: http://127.0.0.1:5173/tv/DEMO?fixture=live&mode=rosters
- Standings preview: http://127.0.0.1:5173/tv/DEMO?fixture=live&mode=standings
- Picks preview: http://127.0.0.1:5173/tv/DEMO?fixture=live&mode=picks
- Results preview: http://127.0.0.1:5173/tv/DEMO?fixture=final&mode=final

Use a 1920x1080 OBS Browser Source above the actual broadcast source. Use OBS Interact to operate the visible buttons. `controls=0` hides buttons and branding; use the mode parameter to choose a fixed panel in that configuration. Panel selection is local to the source; a separate Chrome tab does not control OBS.

Fixture URLs contain synthetic scores. For the existing party API, remove `fixture=...`, use the party code, and run the server on port 3001. This work does not connect to a real-sports score provider.

## Verified

- `npm run test -w web`: 91 tests passed across 12 files.
- `npm run typecheck -w web`: passed.
- `npm run build -w web`: passed.
- `git diff --check`: passed.
- Interactive, clean, standings, and pick routes returned HTTP 200.
- Manual review covered keyboard listener cleanup, phase/query changes, toggle behavior, document-class cleanup, and unchanged backend contracts. No new authentication, external requests, or gameplay mutation was introduced.

## Remaining visual verification

Browser inventory is still empty. No screenshots or OBS composite were available to inspect. Verify transparency over real video, score/panel bounds, button press/focus states, and long content at 1080p and 720p before accepting the visual pass. The native Fire TV app/hardware path remains outside this web-overlay change.
