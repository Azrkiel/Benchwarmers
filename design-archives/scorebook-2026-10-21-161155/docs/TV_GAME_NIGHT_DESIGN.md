# Benchwarmers: courtside scorebook

Revised 2026-10-21 in `web/` using TV UI design framework 1.1 and its new art-direction reference. This is the proposed product direction, replacing the earlier charcoal/orange dashboard. Transparent broadcast presentation remains available explicitly.

## Purpose and direction

Success: understand the match, recognize who is leading the crew, and open the next useful view from the couch without searching.

The visual premise is a courtside scorebook: the match score dominates the left side; the crew is a ruled, ranked column on the right. The next question and two real navigation actions sit below the score. Flat green ink surfaces and chalk-white type avoid nested dashboard boxes. A pale score-marker green identifies the primary action and selected destination. Real team/household colors remain secondary identity cues. Color changes are proposed design choices, not platform rules.

Self-hosted **Barlow Condensed, 600** supplies scoreboard numerals, screen headings, and the wordmark: its narrow proportions allow large, readable scores without crowding three-digit results. **Barlow, 400/600** supplies names, controls, and explanatory text. Fallbacks are Arial Narrow/Arial for display text and Segoe UI/Arial for body text; system fallback handles unsupported scripts. Full Latin font files and their SIL Open Font Licenses are included under `web/public/fonts/`; runtime does not request third-party fonts. Sources: the Google Fonts `ofl/barlow` and `ofl/barlowcondensed` directories.

Geometry follows the content: one consistent horizontal menu; ruled rows for standings; flat team columns for the draft; household-colored rules for rosters; a stronger winner column in Results. Resting data rows do not resemble clickable cards. Buttons use 3px corners, a distinct warm-white focus outline, and restrained press feedback. No background artwork or simulated broadcast is added. This keeps the match, personal names, and score differences recognizable without relying on decorative imagery.

The welcome page separates the actual current party from fixture demos. Device and voice-lab routes remain their existing placeholders; this redesign does not implement those products.

## Coordinates and tokens

This is a web interface, not native Android UI. `Stage` uniformly fits a **1920 × 1080 CSS-pixel reference canvas**, preserving its aspect ratio with letterboxing. A 1280 × 720 viewport uses a 2/3 scale. Safe insets are 96px horizontally and 54px vertically. Controls have additional internal clearance: the primary action starts 8px inside its region and the header reserves vertical space for its outer focus ring. These are project defaults, not dp/sp requirements or platform certification.

| Role | Value |
| --- | --- |
| Background / surface / raised surface | `#111f1b` / `#182a24` / `#22372e` |
| Primary / secondary text | `#f0eee4` / `#b5c3b7` |
| Action + selected / onAction | `#d6ee93` / `#111f1b` |
| Focus / success / error | `#f0eee4` / `#adddc3` / `#f4b4a6` |
| Outline for secondary actions | `#718776` |
| Hero score / line height | Barlow Condensed 600, 224px / 0.8 |
| Overview question / line height | Barlow Condensed 600, 44px / 1.1 |
| Detailed question / screen title | Barlow Condensed 600, 76px / 48px |
| Participant name / line height | Barlow 600, 32px / 1.15 |
| Main controls / supporting metadata | 28px / 22–26px |
| Focus outline | 3px warm white, 3px menu / 5px action offset |
| Input transitions / panel entry | 140ms / 160ms |

Calculated token pairs: primary text on background 14.61:1; secondary text on the raised surface 6.93:1; action fill/foreground 13.36:1; secondary-action outline on background 4.39:1. The focus outline sits outside the action fill on controlled dark backing. These are token-pair checks, not physical-panel certification.

## Layout and remote map

```text
Welcome -> Current party (API) or explicit sample demo
                       |
  Brand   [Game] [Picks] [Standings] [Rosters] [Draft] [Results*]  Party code
                       |
  Game: large matchup + latest play | ruled crew standings
        next question              | names, cities, totals
        [Primary action] [Rosters]  | scoring explanation

  Other views: compact persistent score | crew and destination
               one consistent detailed panel

  Footer: crew / demo label             remote hints

  API unavailable -> connecting + automatic retry
  Connection lost -> retained state + reconnect notice
  Season unavailable -> explanation -> close/reopen Results -> retry
```

`Results` is available after the game. Initial focus starts on the selected destination. Left/Right moves within a row without activating it. Down from the menu reaches the remembered game action; Up returns to the remembered menu item. Select opens the focused destination. The primary game action changes with the actual phase: Open draft, View live pick, or See results. View rosters remains secondary. Row edges clamp rather than wrap; Down at the last row stays there. A white ring shows focus, and a pale-green underline independently shows the selected destination. Held Select cannot repeatedly toggle a panel.

Selecting the open destination again, choosing Game, or Back closes the detailed panel. Back restores the originating action when a game shortcut opened the panel; otherwise it restores Game in the menu. Back from a game action returns to the menu; Back from the Game menu is not intercepted. Browser/native-host exit behavior belongs to that host. When a focused destination disappears, focus falls back to the selected available destination. Gameplay updates do not automatically rotate screens. The underlying live view stays mounted so reopening panels does not replay old scoring events. There are no modal dialogs in this change.

## States

| State | Presentation |
| --- | --- |
| Default | Readable dark surfaces and informational panels |
| Focused | Warm-white outer ring and raised dark backing |
| Pressed | Immediate slight compression and surface feedback |
| Selected | Persistent score-marker underline, independent of focus |
| Loading | Connecting state or season loading message |
| Empty | Explanation for an empty crew and unavailable next question |
| Error | Reconnection notice with retained scores; season retry guidance |
| Missing avatar | Reserved-size initials replace a failed image; a new URL can load normally |
| Disabled | No disabled actions are needed in these views |
| Reduced motion | Panel/focus transitions and scoring pop-ups disabled |

## Preview

- Welcome: `http://127.0.0.1:5173/`
- Interactive demo: `http://127.0.0.1:5173/tv/DEMO?fixture=live`
- Draft: `http://127.0.0.1:5173/tv/DEMO?fixture=drafting&mode=draft`
- Rosters: `http://127.0.0.1:5173/tv/DEMO?fixture=live&mode=rosters`
- Results: `http://127.0.0.1:5173/tv/DEMO?fixture=final&mode=final`
- Interactive transparent overlay: append `&overlay=1` to a TV demo URL.
- Clean transparent OBS source: append `&controls=0`; optionally choose `mode=picks|standings|draft|rosters|final`.

Remove `fixture` to use the existing API on port 3001. Transparent modes supply UI only; OBS supplies the actual broadcast. Panel choices remain local to each browser source.

## Validation

- Chromium screenshots and panel-bound checks: Game, Picks, Standings, Rosters, Draft, Results, clean overlay, and transparent Draft at both 1920 × 1080 and 1280 × 720. No text extended beyond the inspected panel bounds after corrections.
- Browser interactions: initial focus, all four arrows, Select, two-row traversal/memory, Back to the originating action, Back to the menu, and reduced motion. No uncaught browser errors during these checks.
- Welcome reviewed at 1920px desktop and 390px mobile; no mobile horizontal overflow. Its sample scorebook uses the actual live fixture and is labeled as a demo.
- Vitest regression coverage includes lost-focus fallback, held Select, phase-specific actions, return-focus restoration, explicit overlay mode, ranking updates, resolved/empty questions, season-error recovery, and failed-avatar recovery.
- Manual code/security/cleanup review: no backend contract changes, new dependencies, HTML injection, credentials, permissions, or gameplay mutations. Existing components and API clients are reused.
- Final command results are recorded in the delivery message.

## Rendered review record

| Screen/state | Viewport/input | Observed weakness and correction |
| --- | --- | --- |
| Previous game view | 1920×1080 screenshot | Repeated rounded panels gave the next question similar weight to the matchup. Replaced them with a dominant scoreboard, ruled crew column, and actual next-step actions. |
| Populated revised game and all detail screens | 1920×1080 and 1280×720, Chromium keyboard | Score is the first focal point; names and total points form a consistent second reading path. Navigation stays in the same place. Re-inspected after final spacing changes. |
| Long names, long question, 108–105 score | 1920×1080, synthetic boundary fixture | Team text rose into the matchup label; the long participant name exceeded the leaderboard's vertical budget. Auto-sized team rows, adjusted display size, and removed a redundant promotional footer sentence. Rechecked: no main-region overflow and last crew row clears its footer. |
| Empty crew and no question | 1920×1080, mocked API | An empty flex region originally pushed the explanation too low. Empty rows now collapse and the explanation follows its heading. |
| Failed avatar / unavailable API | 1920×1080, blocked image/API | Failed portraits now fall back to initials. The offline screen names the connection failure and accurately describes implemented automatic retries. Both states were inspected. |
| Welcome | 1920px and 390px, browser | The old introduction left its right side unused. A clearly labeled fixture scorebook now demonstrates the product; all preview links remain explicit. |

The hierarchy supports the sport and the room rivalry even without the logo: large actual match scores, jersey-style numerals, named household participants, rank order, and separate fantasy totals. Shared controls intentionally remain conventional. Long-copy checks above cover representative Latin content, not every locale or a larger crew than the demo's four participants.

**Not tested on hardware:** physical TV and remote, couch-distance readability, panel picture modes/overscan/banding, lowest-device performance, screen-reader behavior, system font scaling/localization, and OBS compositing over real video. Browser viewport checks do not establish those results.

Screenshots: `design/game-night-1080.png`, `design/results-1080.png`, `design/long-content-1080.png`, `design/offline-1080.png`.
