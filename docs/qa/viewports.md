# A08, A09 Viewport, zoom, reduced-motion and TV-size screenshots

Snapshot, 2026-10-22, Vite dev server `http://127.0.0.1:5197`, headless Chromium (chrome-headless-shell 1208) via Playwright. Other agents were editing `web/src/device`, `web/src/tv-broadcast` and `web/src/room` during the run, so treat everything below as a point-in-time observation. Script: `scratchpad/qa/viewports.cjs` (plus `ox.cjs` for a recheck of overflow, which confirmed `overflow-x` is `visible` on `html` and `body` and the widest element ends at the viewport width on every non-TV route at 320 px). Raw data: `scratchpad/qa/viewport-results.json`.
Scratchpad dir: `C:\Users\jiang\AppData\Local\Temp\claude\C--Users-jiang\d586c4cc-5b35-46cc-81ee-60846ca7938a\scratchpad\qa\`.

## NOT performed (manual, still open)

- Physical TV testing at about 3 m, off-axis and bright-room viewing (plan A09) was NOT performed. Screenshots are not couch readability.
- Screen-reader testing (NVDA, JAWS, VoiceOver, TalkBack) was NOT performed (plan A08).
- Real browser zoom (Ctrl +) was NOT performed; see the emulation note.
- Real remote-control key codes were not exercised on target hardware.

## Method

- TV routes: `/tv` (draft, live, rosters, final), `/tv2` (live, picks, standings, rosters, draft, final), `/lounge` (tonight, picks, crew, draft, final) with `fixture=live|drafting|final`, and `/room/<code>/tv` for a freshly created, started room. Viewport-only screenshots at 1280x720 and 1920x1080.
- Non-TV routes: `/`, `/welcome`, `/room/<code>` (started room, joined as host, localStorage seeded), `/device/garcias`, `/watch/DEMO?fixture=live`, `/control/DEMO`. Full-page screenshots at widths 320 (x640), 360 (x740), 390 (x844).
- 200% zoom emulation: Playwright cannot set browser zoom, and `deviceScaleFactor` is not zoom. Approximation: a viewport of 720x500 CSS px, which is what a 1440x1000 desktop window reports at 200% zoom (same media queries and layout width). Text is not physically doubled in the PNG. Tag: `zoom200`.
- Reduced motion: separate capture with `reducedMotion: 'reduce'` at 390x844 (tag `reduced390`). All other captures use `no-preference`.
- Metrics per capture: horizontal overflow (`documentElement.scrollWidth > innerWidth + 1`, plus listing of elements whose right edge exceeds the viewport and are not inside a clipping ancestor), visible text elements with computed font-size below the threshold, and text elements with `overflow:hidden|clip` where `scrollHeight > clientHeight` or `scrollWidth > clientWidth`.
- Small-text thresholds: non-TV 12 px; TV at 1920 wide 24 px. The TV stage is a fixed 1920x1080 canvas scaled with a CSS transform (`tv-broadcast/Stage.tsx:8-9,34`), so computed font sizes are canvas pixels at any window size. At 1280x720 the scale is 0.667 and on-screen text is 2/3 of the canvas size: the same elements that are under 24 canvas px at 1920 are under 16 physical px at 1280. The 1280 captures were measured against a 16 px threshold on canvas pixels, which is not meaningful, so the 1280 small-text result in the data (0) is ignored; use the 1920 list for both sizes. Canvas text of 24 px shows as 16 px at 1280, and the 19.8 to 23 px items as 13 to 15 px.

## Summary

| Metric | Result |
| --- | --- |
| Screenshots saved | 62 PNG in `docs/qa/screens/` (32 TV, 30 non-TV) |
| Capture errors | 0 |
| Horizontal overflow | **0 of 62** captures (TV and non-TV, all widths including 320 and the 200% zoom emulation) |
| Captures with text below threshold | TV 1920: 16 of 16; TV 1280: same elements as 1920 (canvas is scaled to 0.667, see Method); non-TV: 15 of 30 |
| Captures with clipped text (overflow hidden) | 4 of 62, all one ellipsis-truncated `.tv-note` (player blurb) on the draft board; intentional truncation |
| Layout at 1280x720 | No TV route produced a notice or overflow. `StageNotice` triggers below 900x500 (`tv-broadcast/StageNotice.tsx:1-2`), so 1280x720 renders the full stage |

**Update 2026-10-22 (fix/tv-label-size):** items 1 and 2 above are fixed. Re-measured at 1920x1080 on all `/tv`, `/tv2`, `/lounge` fixture routes and the room TV: 0 visible text elements under 24 px (was 16 of 16 captures). Phone (390 and 320 wide, room with lineup, `/device`, `/watch`, `/`, `/welcome`, `/control`): 0 under 12 px. Changes: badges, party-code label, movement glyphs, streak, `kbd` hints, lounge `small`, room TV source/phase, section-heading count and `.rm-face` initials raised to 24 px; glyph avatars floor at 24 px; room lineup salary `small` set to 14 px. The `.tv-streak` label still wraps to two lines in its 70 px box (no clipping). Script: `scratchpad/tvlabels/measure.cjs`; screenshots in the same folder. The tables below are the original snapshot.

Observations worth acting on:

1. At 1920x1080, secondary TV text is 19.8 to 23 px, just under the 24 px target: `.tv-source-badge` 23 px (Demo), `Party code` label 23 px, rank-movement glyphs and streak 22 px, `kbd` remote hints 21 to 22 px, lounge draft `small` 23 px, room TV `.rm-source`/`.rm-phase` 22 px and a 14 px "1 player" caption, glyph avatars 19.8 px. Main content (scores, names, questions) is at or above 24 px.
2. On phone, the room view has 11 to 11.7 px text: `.rm-source` "Replay", `.rm-phase` "Playing" (11 px) and salary `small` ("$13,800", 11.67 px, 5 instances). Device `.ds-mic-hint` ("Talk") is 11.2 px; `/watch` `.watch-sample` is 11 px at 320 to 390 (`watch.css` media rule sets `font-size:11px`).
3. No overflow at 320 px on any non-TV route, which is good; but the 200% zoom emulation (720 px wide) puts `/watch` and `/device` in their desktop-ish layout, so check true zoom manually.
4. Reduced motion captures render identically at the static level; motion behavior itself (FX banners, FLIP reorder, countdown bars) needs a recording to verify, not a screenshot.

## TV routes

Flag columns: small = text elements under the threshold (count, grouped by selector and size), clip = clipped text.

| Route | 1280x720 | 1920x1080 | Overflow | Small text at 1920 (<24 px) | Clipped |
| --- | --- | --- | --- | --- | --- |
| `/tv/DEMO?fixture=drafting&mode=draft` | [tv-draft-1280x720.png](screens/tv-draft-1280x720.png) | [tv-draft-1920x1080.png](screens/tv-draft-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo" | div.tv-note x (ellipsis) "Playmaking guard who creates" |
| `/tv/DEMO?fixture=live&mode=live` | [tv-live-1280x720.png](screens/tv-live-1280x720.png) | [tv-live-1920x1080.png](screens/tv-live-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span.tv-chip 23px x3 "+3 Maya"; span.tv-move.tv-move-up 22px x1 "▲"; span.tv-streak 22px x1 "3 streak"; span.tv-move.tv-move-down 22px x1 "▼"; span.tv-move.tv-move-same 22px x2 "─" | none |
| `/tv/DEMO?fixture=live&mode=rosters` | [tv-rosters-1280x720.png](screens/tv-rosters-1280x720.png) | [tv-rosters-1920x1080.png](screens/tv-rosters-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo" | none |
| `/tv/DEMO?fixture=final&mode=final` | [tv-final-1280x720.png](screens/tv-final-1280x720.png) | [tv-final-1920x1080.png](screens/tv-final-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo" | none |
| `/tv2/DEMO?fixture=live&mode=live` | [tv2-live-1280x720.png](screens/tv2-live-1280x720.png) | [tv2-live-1920x1080.png](screens/tv2-live-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x2 "Party code"; kbd 21px x4 "↑↓" | none |
| `/tv2/DEMO?fixture=live&mode=picks` | [tv2-picks-1280x720.png](screens/tv2-picks-1280x720.png) | [tv2-picks-1920x1080.png](screens/tv2-picks-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x1 "Party code"; span.tv-avatar-glyph 19.8px x3 "🦊"; kbd 21px x4 "↑↓" | none |
| `/tv2/DEMO?fixture=live&mode=standings` | [tv2-standings-1280x720.png](screens/tv2-standings-1280x720.png) | [tv2-standings-1920x1080.png](screens/tv2-standings-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x1 "Party code"; span.tv-move.tv-move-up 22px x1 "▲"; span.tv-streak 22px x1 "3 streak"; span.tv-move.tv-move-down 22px x1 "▼"; span.tv-move.tv-move-same 22px x2 "─"; kbd 21px x4 "↑↓" | none |
| `/tv2/DEMO?fixture=live&mode=rosters` | [tv2-rosters-1280x720.png](screens/tv2-rosters-1280x720.png) | [tv2-rosters-1920x1080.png](screens/tv2-rosters-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x1 "Party code"; kbd 21px x4 "↑↓" | none |
| `/tv2/DEMO?fixture=drafting&mode=draft` | [tv2-draft-1280x720.png](screens/tv2-draft-1280x720.png) | [tv2-draft-1920x1080.png](screens/tv2-draft-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x1 "Party code"; kbd 21px x4 "↑↓" | div.tv-note x (ellipsis) "Playmaking guard who creates" |
| `/tv2/DEMO?fixture=final&mode=final` | [tv2-final-1280x720.png](screens/tv2-final-1280x720.png) | [tv2-final-1920x1080.png](screens/tv2-final-1920x1080.png) | no | span.tv-source-badge 23px x1 "Demo"; span 23px x1 "Party code"; kbd 21px x4 "↑↓" | none |
| `/lounge/DEMO?fixture=live&view=tonight` | [lounge-tonight-1280x720.png](screens/lounge-tonight-1280x720.png) | [lounge-tonight-1920x1080.png](screens/lounge-tonight-1920x1080.png) | no | kbd 22px x3 "↑↓←→" | none |
| `/lounge/DEMO?fixture=live&view=picks` | [lounge-picks-1280x720.png](screens/lounge-picks-1280x720.png) | [lounge-picks-1920x1080.png](screens/lounge-picks-1920x1080.png) | no | kbd 22px x3 "↑↓←→" | none |
| `/lounge/DEMO?fixture=live&view=crew` | [lounge-crew-1280x720.png](screens/lounge-crew-1280x720.png) | [lounge-crew-1920x1080.png](screens/lounge-crew-1920x1080.png) | no | kbd 22px x3 "↑↓←→" | none |
| `/lounge/DEMO?fixture=drafting&view=draft` | [lounge-draft-1280x720.png](screens/lounge-draft-1280x720.png) | [lounge-draft-1920x1080.png](screens/lounge-draft-1920x1080.png) | no | small 23px x7 "Round  1"; kbd 22px x3 "↑↓←→" | none |
| `/lounge/DEMO?fixture=final&view=final` | [lounge-final-1280x720.png](screens/lounge-final-1280x720.png) | [lounge-final-1920x1080.png](screens/lounge-final-1920x1080.png) | no | kbd 22px x3 "↑↓←→" | none |
| `/room/<code>/tv` | [room-tv-1280x720.png](screens/room-tv-1280x720.png) | [room-tv-1920x1080.png](screens/room-tv-1920x1080.png) | no | span.rm-source 22px x1 "Replay"; span.rm-phase.is-live 22px x1 "Playing"; span 14px x1 "1 player"; span.rm-face 18.4px x1 "T" | none |

## Non-TV routes

Columns are CSS viewport widths; each cell links the full-page screenshot. "Small" lists text under 12 px.

| Route | 320 | 360 | 390 | 200% zoom emulation (720x500) | Reduced motion (390) | Overflow | Small text (<12 px) at 320 | Clipped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | [home-w320.png](screens/home-w320.png) | [home-w360.png](screens/home-w360.png) | [home-w390.png](screens/home-w390.png) | [home-zoom200.png](screens/home-zoom200.png) | [home-reduced390.png](screens/home-reduced390.png) | no | none | none |
| `/welcome` | [welcome-w320.png](screens/welcome-w320.png) | [welcome-w360.png](screens/welcome-w360.png) | [welcome-w390.png](screens/welcome-w390.png) | [welcome-zoom200.png](screens/welcome-zoom200.png) | [welcome-reduced390.png](screens/welcome-reduced390.png) | no | none | none |
| `/room/<code>` | [room-w320.png](screens/room-w320.png) | [room-w360.png](screens/room-w360.png) | [room-w390.png](screens/room-w390.png) | [room-zoom200.png](screens/room-zoom200.png) | [room-reduced390.png](screens/room-reduced390.png) | no | span.rm-source 11px x1 "Replay"; span.rm-phase.is-live 11px x1 "Playing"; small 11.6667px x5 "$13,800" | none |
| `/device/garcias` | [device-w320.png](screens/device-w320.png) | [device-w360.png](screens/device-w360.png) | [device-w390.png](screens/device-w390.png) | [device-zoom200.png](screens/device-zoom200.png) | [device-reduced390.png](screens/device-reduced390.png) | no | p.ds-mic-hint 11.2px x1 "Talk" | none |
| `/watch/DEMO?fixture=live` | [watch-w320.png](screens/watch-w320.png) | [watch-w360.png](screens/watch-w360.png) | [watch-w390.png](screens/watch-w390.png) | [watch-zoom200.png](screens/watch-zoom200.png) | [watch-reduced390.png](screens/watch-reduced390.png) | no | span.watch-sample 11px x1 "Demo replay  · Not synced to" | none |
| `/control/DEMO` | [control-w320.png](screens/control-w320.png) | [control-w360.png](screens/control-w360.png) | [control-w390.png](screens/control-w390.png) | [control-zoom200.png](screens/control-zoom200.png) | [control-reduced390.png](screens/control-reduced390.png) | no | none | none |

Notes: `/room/<code>` was captured in the started (playing, picks locked) state with one participant; other room phases (lobby, paused, final) and long names / many participants were not captured. `/watch` was captured without a video source configured, so the player and overlay states are not represented.
