# Benchwarmers UI/UX review and play motion

Reviewed 2026-10-23. Implementation branch: `design/play-motion`, based on GitHub `main` at `9fd0c96`. Local project: `C:/Users/jiang/Downloads/xvant/Benchwarmers`.

## Reference and scope

The installed skills catalog and local skill directories contained no separate ESPN UX skill. This pass uses the existing [ESPN UI/UX audit](../plans/2026-10-22-espn-uiux-audit.md), its saved public ESPN brand reference, and the frontend and TV design skills. ESPN's public motion reference emphasizes timing, a clear focal point, and horizontal movement. Exact timings, composition, and interaction choices below are Benchwarmers design decisions, not ESPN requirements. The public reference is [espn.design](https://espn.design/); its live page could not be retrieved during this pass.

GitHub and the newer local project already contain the prior ESPN visual changes. The older `C:/Users/jiang/Benchwarmers` checkout has extensive uncommitted TV work; it was inspected for provenance and left untouched. Existing local `fly.toml` changes in the newer checkout were preserved.

This is a focused review and implementation of the homepage, shared event effects, room phone/TV views, and both party TV layouts. It does not replace the earlier all-route audit or claim a fresh full accessibility audit of every feature.

## Findings and changes

| Finding | Impact | Implemented change |
| --- | --- | --- |
| New play rows replace content abruptly | Viewers can miss which play changed | New IDs slide in over 420ms; existing rows retain their DOM identity on polls |
| Score feedback is weak and the broadcast layout has no score feedback | Scoring and fantasy changes are easy to miss | Shared 460ms score pop in both TV scoreboards and standings |
| ScoreTick celebrates initial scores under React StrictMode | Mounting looks like a new scoring event | Track value changes rather than effect execution; regression test covers StrictMode |
| Recent play insertion displaces previous rows instantly | The feed loses its spatial context | Reuse the existing 600ms FLIP movement for keyed play rows |
| Room TV generates toasts but never renders them | Flags, sacks, and rank changes lose feedback | Render the latest toast when no play banner is active |
| The event banner covers the score area | Celebration hides primary information | A horizontal lower third with team color, white display text, and a 7-degree speedline; scoreboard and footer remain visible |
| Latest play and leader have similar weight to secondary content | A quick glance provides little direction | Team-colored latest-play edge, labeled touchdown/turnover treatment, and a restrained leader highlight |
| Homepage lacks a football-specific visual focal point | The existing typography carries nearly all the identity | Larger Barlow Condensed headline and an original SVG play diagram that draws once; graphic hides on narrow screens |
| Results and view changes arrive abruptly | Transitions lack a visual relationship | Short upward entrances and staggered podium reveals |

## Design decisions

Preserve Barlow Condensed for display, Barlow for readable text, the bench wordmark, and the existing palette: background `#101113`, surface `#1a1a1a`, raised surface `#26272a`, white text, muted text `#bfc2c8`, and red accent `#f51825`. Team colors remain identity cues. Actions retain their existing focus indicators and target geometry.

Motion tokens live with the brand tokens; shared motion rules live in `web/src/fx/motion.css`. Horizontal entrances use an individual CSS `translate` so they compose with the existing FLIP `transform`. No animation library or new production dependency was added. Primary information is never delayed by a data animation; score values update immediately. The banner queue retains its existing bounded behavior.

New play effects do not fire for historical plays on first load, and unchanged polls preserve animated elements. Reduced motion disables movement while preserving scores, event text, selection, and brief scoring feedback. There is no looping decorative animation.

## Verification

The local Chrome run uses an isolated browser fixture for room transitions, with no writes to the running server or existing rooms. Evidence is saved under `C:/Users/jiang/output/benchwarmers-*`; the browser script is `C:/Users/jiang/output/benchwarmers-motion-qa.mjs`.

- Desktop home: 1440 × 1000; phone home and room: 360 × 800; room TV: 1920 × 1080 and 1280 × 720; original and broadcast party TVs: 1920 × 1080.
- Verified CSS animations on newly arriving plays and score changes, FLIP movement, focus retention during a score/rank update, banner expiry, DOM stability across polls, reduced-motion behavior, and lack of horizontal overflow on phone.
- Inspected fresh homepage, live room, touchdown, phone, and TV screenshots. Adjusted the lower third upward after visual inspection so it clears the TV footer.
- Regression tests cover historical/new play behavior, keyed-element preservation, and initial-score behavior under StrictMode.
- Final automated result: `npm test` passes 742 server tests and 486 web tests (1,228 total); `npm run typecheck`, `npm run build`, and `git diff --check` pass. Vite retains its large-chunk advisory for the existing voice/model bundle.
- Final Chrome run passes 14 checks with no runtime exceptions. It verifies motion during an actual browser render, not only class names in a DOM test environment.
- Change review: no scoring, persistence, API, authorization, external content injection, credentials, or deployment changes. Shared hooks and styles are reused across surfaces.

Physical TV viewing distance, a real remote, screen-reader speech, microphone input, embedded widget hosts, and browser-extension behavior were not tested in this focused pass. A still screenshot does not establish animation quality; the Chrome checks inspect the actual running animation styles and state transitions.
