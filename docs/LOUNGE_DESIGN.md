# Lounge — design B

A separate interface built from scratch alongside the preserved scorebook. Open `/lounge/DEMO?fixture=live`; the scorebook stays at `/tv/DEMO?fixture=live`. The existing welcome page and all 34 files in `web/src/tv/` match the saved copy. The new interface lives in `web/src/lounge/`; only the router imports it. The existing data hook, types, and canvas-fit calculation are shared.

## Direction

Success: recognize the matchup, find the next question, and open a friend’s roster with a remote while keeping a sense of the room.

The premise is a living-room sports club. A small bench drawing and a two-line serif wordmark introduce the app. The left menu stays quiet while the match occupies the center. The basketball is an original vector still life with a pebble pattern and ink seams; it identifies the activity without pretending to show a game feed. It is cropped into the matchup panel, with a directional scrim protecting the names. Actual household avatars and names carry the social identity. The bottom seats are real buttons: selecting one opens that friend’s roster in place.

The next question receives one peach surface because it is the next useful action. Match numbers use the body family; they do not compete with the names and illustration. Detailed rosters use aligned rows, and the final view makes the winning person the focal point. The same menu, score context, and Back behavior persist across screens.

This is a proposed alternative direction. Design A is preserved for direct comparison and for its transparent OBS modes. Lounge is an opaque companion interface using the existing party data services.

## Type, color, and geometry

Self-hosted **DM Serif Display Regular** supplies matchup names, the wordmark, questions, and section headings. Its curved forms connect the interface to a shared evening rather than a mechanical scoreboard. **DM Sans Variable** at 400–550 supplies controls, names, and numeric data. Georgia and Segoe UI/Arial provide fallbacks. Both font families and their OFL licenses are included under `web/public/fonts/`, downloaded from Google Fonts’ `ofl/dmserifdisplay` and `ofl/dmsans` sources. Runtime needs no third-party font request.

| Role | Project value |
| --- | --- |
| Background | `#191a26` |
| Surface / raised surface | `#242635` / `#303344` |
| Primary / secondary text | `#f3ecdf` / `#b7b6c5` |
| Accent / selected marker | `#eda77b` |
| Question and winner surface / ink | `#e4c6a7` / `#32292d` |
| Supporting text on peach | `#65483f` |
| Action fill | `#292a3b` |
| Match names / long names | 62px / 42px, serif, line height 1.02 |
| Question | 40px serif, line height 1.1 |
| Main score / body / controls | 60px / 26px / 25px, sans |
| Large regions / seats / buttons | 24px / 18px / 12px corners |
| Focus | 3px warm-white outline, 4px offset, controlled dark 9px backing |
| Focused seat | 1.015×, with clearance inside the seat row |
| Feedback transition | 130ms, removed with reduced-motion preference |

Calculated contrast: primary text/background 14.69:1; secondary text/raised surface 6.25:1; ink/peach 8.68:1; supporting text/peach 5.07:1; action text/fill 12.01:1. These token checks supplement rendered inspection; they do not establish physical-TV readability.

The web canvas is **1920×1080 CSS pixels**, uniformly fitted with letterboxing. Insets are 96px left/right, 64px top, and 56px bottom. The left menu occupies 220px, separated from the main region by 48px. Seat-row padding reserves focus enlargement and outline clearance. These are web project dimensions, not Android dp/sp claims.

## Remote map and state

```text
vertical menu             Tonight
[Tonight]      Right ---> next question action (row 0)
[Picks]                        Down / Up
[The crew]                friend seats (row 1, Left/Right)
[The draft]                    Select
[Results*]                roster dialog -> Back -> same seat
[Scorebook version]

The crew uses two rows of two seats; Up/Down follows that geometry.
* Results appears after the game.
```

- Focus starts on the selected destination. Up/Down browses the menu; Enter selects it. Right enters the content. Merely focusing another destination does not change the screen.
- Content remembers its row entry. Left from the first control returns to the selected menu item. Edges clamp; there is no wraparound.
- Back closes a roster dialog first and restores its originating seat. From a detail view it returns to Tonight and restores the originating shortcut when present. From Tonight’s content it returns to the menu. Back at the Tonight menu is left to the browser/host.
- A modal makes the background inert, starts focus on Close, confines Tab and directional input, and supports Select/Back. Held Select does not repeatedly activate.
- Member IDs own focus identity. Removing a member closes their open roster and focuses the current destination. Reordering/data refresh can recover a remembered surviving control if DOM focus falls to the body.
- Selection has a persistent side marker and backing surface; focus has a separate warm-white outline. Pressing gives immediate compression feedback.
- Loading and offline states retain a remote-reachable link to the preserved interface and accurately describe implemented automatic retries. A later connection failure retains the last data and announces reconnection.
- Empty crew, empty roster, and no-question states explain what will appear. Failed image avatars fall back to initials. Long names on the small Tonight seats use a first name; the full name is in the accessible label and reachable roster dialog. Household labels may truncate there; the roster header exposes the complete household name.
- Pick timing follows the server-offset deadline. Expired questions say picks are closed, even if the last API snapshot still labels the question open. Estimates and actual crew picks are labeled separately.
- No disabled actions are needed. There is no auto-rotation, unsolicited audio, or fake video playback. Personal picks continue to use the existing voice/device flow; shared-TV answer mutation was not added.

## Rendered review and validation

Inspected in Chromium with the actual fixtures at 1920×1080 and 1280×720: Tonight, Picks, The crew, The draft, Results, and roster dialogs. Also inspected empty data, a failed connection, a long question, long team names, three-digit scores, and a long participant’s roster.

| Observation | Correction and recheck |
| --- | --- |
| Sidebar labels wrapped because an empty selection-marker element consumed a flex gap. | Marker positioned outside the row flow; labels re-inspected on one line. |
| The draft’s last two rows extended into the footer. | Reduced row padding and corrected line heights while preserving player/owner metadata. All sixteen players fit at both viewport sizes. |
| A two-row crew grid initially used one navigation row. | Explicit row IDs now follow the actual two-by-two arrangement; Up/Down has a regression test. |
| A vanished member’s modal initially returned to an unrelated menu item. | Recovery now targets the current destination; verified by an API-update test. |
| Long participant names needed more room than a small seat allows. | First-name presentation on the small seat, complete accessible label, and full name in a compact roster dialog. Long-dialog contents stay inside their panel. |
| An unavailable API initially offered a link without initial remote focus. | Recovery link joins the focus graph and receives focus; verified in a test and blocked-network browser run. |

Final evidence: 113 web tests, workspace TypeScript checks, production build, all five screens’ browser bounds checks at both resolutions, dialog confinement and return focus, reduced motion, and safe menu/action/edge-seat focus bounds. Existing scorebook components and welcome markup were compared against the saved snapshot; all matched. Manual review checked keyboard-listener cleanup, cancelled polling, modal data removal, namespaced CSS, local font licenses, escaped data rendering, and the absence of new gameplay mutations or dependencies.

**Pending physical checks:** real TV/remote and viewing distance, picture modes, overscan, lowest-supported device performance, assistive technology, font scaling, broader localization, and larger crews than the four-person demo. Lounge does not change or validate OBS compositing; preserved design A retains that mode.

## URLs

- Design B: `http://127.0.0.1:5173/lounge/DEMO?fixture=live`
- Design A: `http://127.0.0.1:5173/tv/DEMO?fixture=live`
- Draft: `/lounge/DEMO?fixture=drafting&view=draft`
- Crew: `/lounge/DEMO?fixture=live&view=crew`
- Results: `/lounge/DEMO?fixture=final&view=final`
- Existing API: `/lounge/latest` or `/lounge/<party code>`; server port 3001.

Screenshots are under `docs/design/lounge/`. The preserved source and ZIP are under `design-archives/scorebook-2026-10-21-161155` and `design-archives/scorebook-2026-10-21-161155.zip`.
