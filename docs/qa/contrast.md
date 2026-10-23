# A01 Contrast audit

## Re-run 2026-10-23

Re-run of the same scripts against a Vite dev server on `http://127.0.0.1:5212` (worktree `Benchwarmers-contrast`, branch `fix/contrast`, based on `origin/dev`). `dev` had already fixed part of the original list (`.rm-endzone` text now uses `inkOn()`, `.party-chip` uses `--bw-link`, room/voice-lab/home control borders use `--bw-control-line`), so the baseline on this branch was lower than the 2026-10-22 snapshot.

| | Baseline (dev) | After |
| --- | --- | --- |
| Unique failures, all | 52 (54 raw) | 16 (16 raw) |
| Unique failures, enabled controls | 38 (4 text were disabled `ds-send`; 34 non-text) | 2 (both false positives, below) |
| Text failures | 4 (all disabled `ds-send`) | 0 |

Changes:
- Control borders use `--bw-control-line` (`#73767d`, 3.8:1 or better on `#101113`/`#1a1a1a`/`#202124`): device `.ds-gear`, `.ds-input`, `.ds-conversation-toggle` (`device.css`), lounge `.lg-seat` (`lounge.css`), TV `.tv-action` incl. `#tv-rosters-action` (`screen.css`). Dividers keep `--lg-line`.
- New token `--bw-action-edge: #d4172f` (`brand.css`, 3.28:1 on `#1a1a1a`, 3.57:1 on `#101113`) used as the border of red primary buttons so the button boundary passes 3:1 while the fill stays `#c8102e`: `.rm-primary` incl. hover (`room.css`), `.lg-primary` (`lounge.css`), `.tv-action-primary` (`screen.css`), `.vid-btn-primary` (`voiceid.css`). Hover border keeps the edge colour (was `#aa0d26`, 2.32:1).
- TV nav hover: transparent 1px border by default, `#73767d` border on hover (`screen.css`, added lines only) so hover has a 3:1 cue besides the fill.
- `.ds-send:disabled` now uses `--lg-raised` fill and `--lg-muted` label instead of 0.35 opacity on red (label readable).

Still reported (not real failures):
- Disabled controls (exempt): "Find game"/"Open room" fill 1.26:1, `.ds-send` disabled fill 1.17:1, room `Send` disabled border 2.23:1 (`room.css:17` disabled primary keeps `--lg-line`).
- `/voice-lab` `#vid-threshold`, `#vid-margin`: false positive. The `#3b3b3b` is the computed `background-color`, which Chrome does not paint for `type=range`. An element screenshot shows a light track with a red fill and thumb (both well above 3:1).

Unchanged limits: gradient/image/video backgrounds are still not measured (36 unknown), and Playwright hover timeouts (not contrast related) still occur. Total measurements 2550 (2563 baseline).

Snapshot, 2026-10-22, taken against the Vite dev server at `http://127.0.0.1:5197` (worktree `Benchwarmers-espn-uiux`) while other agents were editing `web/src/device`, `web/src/tv-broadcast` and `web/src/room`. Re-run the scripts before trusting any single number. Nothing in app source was changed.

Scripts (scratchpad, not committed): `contrast.cjs` (main walk), `contrast2.cjs` (focus-indicator, placeholder, hit-test pass), `analyze.cjs`, shared `common.cjs`. Raw output: `contrast-results.json`, `contrast2-results.json`.
Scratchpad dir: `C:\Users\jiang\AppData\Local\Temp\claude\C--Users-jiang\d586c4cc-5b35-46cc-81ee-60846ca7938a\scratchpad\qa\`.

## Method

- Routes: the `smoke.cjs` list: `/`, `/welcome`, `/missing`, a freshly created room (`/room/<code>` lobby and playing, `/room/<code>/tv` lobby and playing), `/tv` (draft, live, rosters, final), `/tv2` (live, draft, picks, standings, rosters, final), `/lounge` (tonight, picks, crew, draft, final), `/device/garcias`, `/device/sams-place`, `/voice-lab`, `/watch/DEMO` (1440 and 390 wide), `/control/DEMO` (1440 and 390 wide). 27 route/viewport combinations. Phone routes at 390x844, TV routes at 1920x1080, others at 1440x1000. `reducedMotion: 'reduce'`.
- Text: every visible element that owns a non-empty direct text node, plus inputs with a value or placeholder text. `fg` = computed `color` multiplied by the product of ancestor `opacity`, alpha-blended over the effective background. `bg` = walk up ancestors, stacking `background-color` layers until an opaque one (page default white if none), blended with alpha.
- Large text (3.0:1 required): font-size >= 24px, or >= 18.66px with weight >= 700. Otherwise 4.5:1.
- Non-text UI (3.0:1, WCAG 1.4.11): for every `button`, `a[href]`, `input`, `select`, `textarea`, `summary`, `[role=button]`: the border colour against the parent's effective background; if there is no border, the element's own fill against the parent's effective background (links skipped).
- Hover and focus: on `/`, the room phone view (lobby and playing), `/tv/DEMO?fixture=live`, `/tv2/DEMO?fixture=live` and `/device/garcias`, each button/link/summary (up to 40 per page) was hovered (`locator.hover`) and focused (`focus({focusVisible:true})`), then text and UI contrast were re-measured for that element and its descendants.
- Not measured, treated as unknown (36 measurements, all `span` in `div.rm-yardlines`, the room field graphic): any element whose ancestor chain hits a `background-image` (gradient/image), `video`, `img` or `canvas` before an opaque colour. That means text over gradients, the TV court/field art, video backings and the `/watch` player overlay are NOT covered. Composited video backings (plan row A01) remain manual.
- Disabled controls are flagged `disabled`; WCAG exempts them, so they are listed but excluded from the headline count.

## Summary counts

| Item | Count |
| --- | --- |
| Route/viewport combinations walked | 27 |
| Text measurements (all states) | 2254 (of which 1362 are large text) |
| Non-text UI measurements | 208 |
| Hover measurements / focus measurements | 111 / 160 (include text and UI of the element) |
| Unknown background (gradient/image), not measured | 36 |
| Failing measurements, raw (every state, every repeat) | 147 (12 text, 135 UI) |
| Unique failures (route + element + colours, states merged) | 92 |
| Unique failures excluding disabled controls | 77 |
| Unique text failures excluding disabled | 8 |
| Unique non-text failures excluding disabled | 69 |
| Failing on hover only | 9 (8 TV nav buttons, hover fill 1.26:1 against header; 1 "Create room" hover border 2.32:1) |
| Failing on focus only | 0 (every focus failure also fails in normal state) |
| Hover attempts that timed out (Playwright actionability, not contrast) | 27 on `/`, room lobby, room playing (elements animating or covered; a separate hit-test found none covered at centre) |

Text contrast is mostly healthy: only 8 enabled text failures. The dominant problem is the UI border token `--lg-line` (`#4b4d52`) used as the border on inputs and secondary buttons, which is 2.06 to 2.23:1.

Placeholder text (`::placeholder`) is not in the table; checked separately: `#bfc2c8` on `#141517` (10.24:1), `#a5a9b1` on `#1a1a1a` (7.38:1), `#8a8999` on `#101113` (5.50:1). All pass.

Focus indicators: all 44 focusable controls that accepted focus on the five state pages showed a visible change (outline `3px solid #fff` via `:focus-visible` rules in `room.css`, `home.css`, `device.css`, `broadcast.css`, `styles.css`). 22 controls could not take programmatic focus (disabled buttons, plus 9 `a.hm-more-link` on home that did not take programmatic focus; worth a manual check). Outline-vs-background contrast was not computed (white `#fff` on these dark backgrounds is >= 15:1).

## Worst offenders and likely token

| Pair | Ratio | Where | Likely cause |
| --- | --- | --- | --- |
| `#db6477` on `#c8102e` | 1.71 (4.5 needed) | `/device/*` `button.ds-send` "Send", disabled state | `.ds-send:disabled` in `web/src/device/device.css:337` sets `opacity:0.35` on a `--bw-action` (`#c8102e`, `brand.css:9`, used at `device.css:324`) button. Disabled, so exempt, but the faded label is unreadable. |
| `#ffffff` on `#e8b931` | 1.84 (4.5 needed; 3.0 on the 24px TV size) | `span.rm-endzone` "SD" in room phone and room TV | `.rm-endzone { color:#fff }` at `web/src/room/broadcast.css:13`; background comes from team data (`components.tsx:62`, `game.away.color` = `#e8b931`). White text on a yellow team colour. Fix by choosing text colour per team colour luminance. |
| `#ffffff` on `#c8641e` | 3.96 (4.5) | `span.rm-endzone` "VT" | Same rule, `broadcast.css:13`, home team colour `#c8641e`. |
| `#f51825` on `#202124` | 3.86 (4.5) | `/device/*` `span.party-chip` "Party DEMO" (15.2px) | `--lg-orange: #f51825` (`brand.css:5`) used as text colour in `.party-chip` (`device.css:79`). Use `--bw-link` `#ff7b86` (`brand.css:9`) for text. |
| `#4b4d52` on `#1a1a1a` | 2.06 (3.0) | Border of home inputs (`#rm-room-name`, `#rm-code`), room pick buttons, device chips and prompt buttons, voice-lab buttons | `--lg-line: #4b4d52` (`brand.css:4`), applied by `.rm button, .rm input, .rm select { border:1px solid var(--lg-line) }` (`web/src/room/room.css:9`) and the device/voice-lab equivalents. `home.css:30` already uses `#73767d` for the home pull input, which passes (3.83:1). Use `#73767d` for control borders and keep `--lg-line` for dividers. |
| `#4b4d52` on `#101113` / `#141517` | 2.23 / 2.16 | Room command input and Send/Copy/Speak, replay speed buttons (phone and room TV), lounge `#lg-seat-*` buttons, `#tv-rosters-action` | Same token `--lg-line`; lounge also defines it locally at `web/src/lounge/lounge.css:2`, TV at `web/src/tv/screen.css:2` (`--border`) and `overlay/styles.ts:4` (`.bw-layer button` border). |
| `#4b4d52` on `#202124` | 1.90 | `button.ds-gear` "Settings" (device) | Same token on `--lg-card` (`brand.css:3`). |
| `#3b3b3b` on `#1a1a1a` | 1.55 | `/voice-lab` range inputs `#vid-threshold`, `#vid-margin` (track fill) | Native `<input type=range>` (`VoiceLabPage.tsx:248-268`, `accent-color` at `voiceid.css:266/362`). The `#3b3b3b` is the computed `background-color` of the input, which Chrome does not necessarily paint as the track. Likely false positive; verify manually. |
| `#c8102e` on `#1a1a1a` | 2.96 (3.0) | `button.rm-primary` "Create room" on `/`, lounge `#lg-primary`, voice-lab primary buttons | `--bw-action: #c8102e` (`brand.css:9`). Just under 3:1 for the button boundary; the white label inside is 5.88:1 so this is a borderline non-text item. |
| `#26272a` on `#101113` | 1.26 | TV nav buttons on hover (`/tv`, `/tv2`), disabled "Find game" | `--lg-raised`/`--lg-tan: #26272a` (`brand.css:3`/`5`) as hover/disabled fill against `--lg-bg`. On the TV nav the selected state is carried by the `.tv-nav-marker`, so this is low severity, but hover contrast is fill-only. |

## All unique failures

Columns: route, element and text (first 40 chars), what was measured (`text`, `border`, `fill`), foreground, background, ratio, required, states where it fails, disabled flag. `room-*` routes are `/room/<fresh code>` (phone, 390x844) or `/room/<code>/tv` (1920x1080). Sorted worst first (ratio / required).

| Route | Element | Measured | fg | bg | Ratio | Required | States | Disabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /device/garcias | button.ds-send `Send` | text | #db6477 | #c8102e | 1.71 | 4.5 | normal/hover/focus | disabled |
| /device/sams-place | button.ds-send `Send` | text | #db6477 | #c8102e | 1.71 | 4.5 | normal | disabled |
| room-lobby-phone | span.rm-endzone `SD` | text | #ffffff | #e8b931 | 1.84 | 4.5 | normal |  |
| room-playing-phone | span.rm-endzone `SD` | text | #ffffff | #e8b931 | 1.84 | 4.5 | normal |  |
| / | button `Find game` | fill | #26272a | #101113 | 1.26 | 3 | normal/hover/focus | disabled |
| /missing | button `Open room` | fill | #26272a | #101113 | 1.26 | 3 | normal | disabled |
| /tv/DEMO?fixture=live&mode=live | button `Game` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv/DEMO?fixture=live&mode=live | button `Draft` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv/DEMO?fixture=live&mode=live | button `Rosters` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv2/DEMO?fixture=live&mode=live | button `Game` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv2/DEMO?fixture=live&mode=live | button `Picks` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv2/DEMO?fixture=live&mode=live | button `Standings` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv2/DEMO?fixture=live&mode=live | button `Rosters` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /tv2/DEMO?fixture=live&mode=live | button `Draft` | fill | #26272a | #101113 | 1.26 | 3 | hover |  |
| /device/garcias | button.ds-send `Send` | fill | #571721 | #1a1a1a | 1.28 | 3 | normal/hover/focus | disabled |
| /device/sams-place | button.ds-send `Send` | fill | #571721 | #1a1a1a | 1.28 | 3 | normal | disabled |
| /voice-lab | input#vid-threshold | fill | #3b3b3b | #1a1a1a | 1.55 | 3 | normal |  |
| /voice-lab | input#vid-margin | fill | #3b3b3b | #1a1a1a | 1.55 | 3 | normal |  |
| room-tv-lobby | span.rm-endzone `SD` | text | #ffffff | #e8b931 | 1.84 | 3 | normal |  |
| room-tv-playing | span.rm-endzone `SD` | text | #ffffff | #e8b931 | 1.84 | 3 | normal |  |
| /device/garcias | button.ds-gear `Settings` | border | #4b4d52 | #202124 | 1.9 | 3 | normal/hover/focus |  |
| /device/sams-place | button.ds-gear `Settings` | border | #4b4d52 | #202124 | 1.9 | 3 | normal |  |
| / | input#rm-room-name | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| / | input#rm-code `Enter code` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| / | button `Join room` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-lobby-phone | button `Touchdown 10 pts Room: 0 picks (0%) Hist` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-lobby-phone | button `Field goal 12 pts Room: 0 picks (0%) His` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-lobby-phone | button `Punt 6 pts Room: 0 picks (0%) Historical` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-lobby-phone | button `Turnover 15 pts Room: 0 picks (0%) Histo` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| /device/garcias | button `Who's available?` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | button `Show standings` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | button `Show season standings` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | button `Show my roster` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | button.sp-chip `🦊 Maya` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | button.sp-chip `🐻 Leo` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus |  |
| /device/garcias | input.ds-input `Type a message` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button `Who's available?` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button `Show standings` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button `Show season standings` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button `Show my roster` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button.ds-conversation-toggle `Conversation` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button.sp-chip `🐙 Sam` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | button.sp-chip `🦉 Priya` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /device/sams-place | input.ds-input `Type a message` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /voice-lab | button.vid-btn.vid-seg `Sam's Place` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| /voice-lab | button.vid-btn | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal |  |
| room-playing-phone | button `Yes 10 pts Room: 0 picks (0%) Historical` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-playing-phone | button `No 10 pts Room: 0 picks (0%) Historical ` | border | #4b4d52 | #1a1a1a | 2.06 | 3 | normal/hover/focus | disabled |
| room-tv-lobby | button | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-lobby | button `Replay 2 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-lobby | button `Replay 3 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-lobby | button `Replay 4 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-playing | button | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-playing | button `Replay 2 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-playing | button `Replay 3 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-tv-playing | button `Replay 4 times speed` | border | #4b4d52 | #141517 | 2.16 | 3 | normal |  |
| room-lobby-phone | button `34BAE9 Copy` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-lobby-phone | input#rm-command `Try “pick touchdown”` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| room-lobby-phone | button.rm-primary `Send` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/hover/focus | disabled |
| room-lobby-phone | button `Speak` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-lobby-phone | button | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-lobby-phone | button `Replay 2 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-lobby-phone | button `Replay 3 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-lobby-phone | button `Replay 4 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| /tv2/DEMO?fixture=live&mode=live | button#tv-rosters-action `View rosters ↗` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/hover/focus |  |
| /lounge/DEMO?fixture=live&view=tonight | button#lg-seat-maya `🦊 Maya Rank 1 · Leader 142.5 pts` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=tonight | button#lg-seat-sam `🐻 Sam Rank 2 119.6 pts` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=tonight | button#lg-seat-priya `🦉 Priya Rank 3 110.3 pts` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=tonight | button#lg-seat-leo `🦁 Leo Rank 4 86.8 pts` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=crew | button#lg-seat-maya `🦊 Maya The Garcias Rank 1 · Leader 142.` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=crew | button#lg-seat-sam `🐻 Sam Sam's Place Rank 2 119.6 pts Draf` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=crew | button#lg-seat-priya `🦉 Priya Sam's Place Rank 3 110.3 pts Dr` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /lounge/DEMO?fixture=live&view=crew | button#lg-seat-leo `🦁 Leo The Garcias Rank 4 86.8 pts Draft` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /voice-lab | button.vid-btn.vid-seg `Leo` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| /control/DEMO | button.bw-launcher `Crew` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| room-playing-phone | button `34BAE9 Copy` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-playing-phone | input#rm-command `Try “pick touchdown”` | border | #4b4d52 | #101113 | 2.23 | 3 | normal |  |
| room-playing-phone | button.rm-primary `Send` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/hover/focus | disabled |
| room-playing-phone | button `Speak` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-playing-phone | button | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-playing-phone | button `Replay 2 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-playing-phone | button `Replay 3 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| room-playing-phone | button `Replay 4 times speed` | border | #4b4d52 | #101113 | 2.23 | 3 | normal/focus |  |
| / | button.rm-primary `Create room` | border | #aa0d26 | #1a1a1a | 2.32 | 3 | hover |  |
| /device/garcias | span.party-chip `Party DEMO` | text | #f51825 | #202124 | 3.86 | 4.5 | normal |  |
| /device/sams-place | span.party-chip `Party DEMO` | text | #f51825 | #202124 | 3.86 | 4.5 | normal |  |
| room-lobby-phone | span.rm-endzone `VT` | text | #ffffff | #c8641e | 3.96 | 4.5 | normal |  |
| room-playing-phone | span.rm-endzone `VT` | text | #ffffff | #c8641e | 3.96 | 4.5 | normal |  |
| / | button.rm-primary `Create room` | border | #c8102e | #1a1a1a | 2.96 | 3 | normal/focus |  |
| /lounge/DEMO?fixture=live&view=tonight | button#lg-primary `View picks` | border | #c8102e | #1a1a1a | 2.96 | 3 | normal |  |
| /voice-lab | button.vid-btn.vid-btn-primary `Record sample 1 of 3` | border | #c8102e | #1a1a1a | 2.96 | 3 | normal |  |
| /voice-lab | button.vid-btn.vid-btn-primary `Test recognition` | border | #c8102e | #1a1a1a | 2.96 | 3 | normal |  |