# A03, A06, A07 Edge-state source review

Source-review checklist, snapshot 2026-10-22. No browser testing for these items (except where noted); line numbers are from the working tree while other agents were editing `web/src/device`, `web/src/tv-broadcast` and `web/src/room`, so lines may drift. Ratings: Pass, Risk (works but fragile or untested), Fail (observable defect by reading).

Paths are relative to `web/src/`.

## A03 Live regions and announcement spam

Search: `role="status"`, `role="alert"`, `role="log"`, `aria-live` across `*.tsx`.

| # | Item | Rating | Evidence |
| --- | --- | --- | --- |
| 1 | TV reconnect banner: `role="status"` wraps text "Showing update from {formatCountdown(age)} ago", and `useStaleAge` re-renders it every 1 s while `error` is set. A polite status region whose text changes every second re-announces on each tick. Used by `/tv` and `/tv2`. | Fail | `tv-broadcast/ReconnectBanner.tsx:12` (setInterval 1000), `:22` (role=status), `:24` (`autoFocus` on Retry also moves focus on mount) |
| 2 | Result announcement: announces once, only when status transitions to `final`; region is always mounted. | Pass | `tv-broadcast/ResultAnnouncement.tsx:22` |
| 3 | Room pick window: sr-only status text only changes at thresholds (paused, locked, under 5 s), not per second. Visible countdown "Closes in m:ss" is not live. | Pass | `room/components.tsx:118-119`. Note the `role="status"` element also carries `aria-label`, which most screen readers ignore for live content. |
| 4 | Room pick saved is not announced (only failure has `role="alert"`); plan A03 asks for saved picks to be announced once. | Risk | `room/components.tsx:114` sets `saved`, `:133` only alerts on failure |
| 5 | Room "Reconnecting . Showing last update at HH:MM": `aria-live` container always mounted, text changes only when stale or `updatedAt` changes. Probably quiet, but `updatedAt` text would re-announce if the poll updates it while stale. | Risk | `room/RoomPage.tsx:29`, `room/RoomTvPage.tsx:99` |
| 6 | Room error banner: `role="alert"` with a Retry button; fires once per error object. If the poll loop re-sets the same message every tick the alert may repeat. Verify against `room/useRoom.ts`. | Risk | `room/RoomPage.tsx:30` |
| 7 | Play banner: `role="status" aria-live="polite"` is on the banner element that is mounted only while a banner shows (`if (!banner) return null`). Live regions inserted already containing text are often not announced. Also announces every play banner. | Risk | `fx/fx.tsx:106` |
| 8 | Toast layer: region is always mounted, shows the last toast only. | Pass | `fx/fx.tsx:154-156` |
| 9 | Device transcript `role="log" aria-live="polite"` appends turns; `ds-thinking` status "Sending..." is nested inside the log, so it may announce twice (log plus status). Mic hint `role="status"` toggles Talk/Listening/Sending on user actions only. | Risk | `device/Transcript.tsx:29,48`, `device/DevicePage.tsx:163,183` |
| 10 | Rosters pager status "Players 1-4 of N": changes only on Previous/Next. | Pass | `tv-broadcast/RostersView.tsx:30`, `tv/RostersView.tsx:30` |
| 11 | Live score, rank movement and standings changes are not announced anywhere. No spam, but no assistive output for score updates either. | Risk | no `aria-live` in `tv-broadcast/Scoreboard.tsx`, `Standings.tsx` |
| 12 | Home pull-up status: `aria-live` region always mounted; changes on user submit only. | Pass | `home/PullUpGame.tsx:75` |
| 13 | Lineup save status: `role="status"` updates on save only; `actionError` is a second status span (should be `alert`). | Pass | `room/Lineup.tsx:83` |
| 14 | Connecting screens use `role="status"` once each. | Pass | `tv-broadcast/TvPage.tsx:82`, `tv/TvPage.tsx:64`, `shell/RouteStatus.tsx:19` |
| 15 | `StageNotice` (TV too small, under 900x500) is `role="status"` on a visible-from-mount node, and it hides the stage. | Risk | `tv-broadcast/StageNotice.tsx:11` |

Timers that tick: only the ReconnectBanner (item 1) re-renders text inside a live region each second. Per-poll countdowns are visible text outside live regions.

## A06 Zero, one, many members; ties; missing avatars

Fixtures (`lib/fixtures/shared.ts:33-45,202-227`): 4 members across 2 households, all with emoji avatars, unique ranks 1..4 (ranks assigned by sort index, so no ties and no missing avatars). Nothing in fixtures exercises 0, 1, ties, or many members. `Member.avatar` is a required `string` in `server/src/shared/types.ts:152,224`, but an empty string is possible.

| # | View | Case | Rating | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `/tv2` Game overview standings | 0 members: empty-state text "Your crew will appear here..." | Pass | `tv-broadcast/GameOverview.tsx:43` |
| 2 | `/tv2` Game overview | 1 member: header says "1 players" | Fail (copy) | `tv-broadcast/GameOverview.tsx:32`; same in `lounge/LoungeElements.tsx:31` |
| 3 | `/tv2` Game overview | ties: both rank-1 rows get `is-leader` and "Leader"; sensible | Pass | `tv-broadcast/GameOverview.tsx:35,39` |
| 4 | `/tv2` Game overview | many members: grid is a focusable scroll region | Pass | `tv-broadcast/GameOverview.tsx:33` |
| 5 | `/tv2` Standings view | 0 members: header plus empty `<ol>`, no message | Fail | `tv-broadcast/Standings.tsx:24-45` |
| 6 | `/tv2` Standings | `max` guarded with `Math.max(1, ...)`; ties show equal rank numbers | Pass | `tv-broadcast/Standings.tsx:10` |
| 7 | `/tv2` Standings | `streak` text only when >= 2; missing prevRank handled by fixture builder, not component | Risk | `tv-broadcast/Standings.tsx:30,41`, `lib/fixtures/shared.ts:227` |
| 8 | `/tv2` Live view | top 3 by rank, any count; no leader assumption | Pass | `tv-broadcast/LiveView.tsx:33` |
| 9 | `Leader` component | 1 member: "Tonight's leader"; tie: "Level on points" | Pass | `tv-broadcast/Leader.tsx:20` |
| 10 | Rosters (`/tv`, `/tv2`) | 0 members: empty grid, no message, pager hidden | Fail | `tv-broadcast/RostersView.tsx:36` (and `tv/RostersView.tsx`) |
| 11 | Rosters | many members: 4 per page, pager with wraparound; nested focusable regions (grid and each column both `data-tv-scroll`) | Risk | `tv-broadcast/RostersView.tsx:7,13,36,42` |
| 12 | Final view | 1 or 2 members: podium blocks render conditionally (`first`, `second`, `third`) | Pass | `tv-broadcast/FinalView.tsx:28,70-72` |
| 13 | Final view | ties: label "Joint winner" for every rank-1 row; but second-place slot gets `tv-podium-2` styling even when it is rank 1 | Risk | `tv-broadcast/FinalView.tsx:13,70-72` |
| 14 | Final view | 0 members: empty podium and no message; season table has "No season results yet" | Risk | `tv-broadcast/FinalView.tsx:70,112` |
| 15 | Avatar (`/tv2`): emoji avatars from data are ignored and shown as initials; failed image falls back to initials | Risk | `tv-broadcast/avatar.tsx:18-19` |
| 16 | Avatar (`/tv`): emoji up to 4 chars as glyph, initials otherwise; `<img>` has no `onError` fallback so a broken URL shows alt text | Risk | `tv/avatar.tsx:17-19` |
| 17 | Lounge `MemberFace`: image falls back to initials, empty avatar falls back to initials | Pass | `lounge/LoungeElements.tsx:21-25` |
| 18 | Lounge seats 0 members | Pass | `lounge/LoungeElements.tsx:32,36` ("No players yet") |
| 19 | Lounge final: winners joined with " and "; `standings.find(rank===1)` used for points, so a tie shows only the first winner's points | Risk | `lounge/LoungeViews.tsx:39-40` |
| 20 | Room leaderboard: 0 members message; season rank computed from points so ties share a rank; `leader` requires `total > 0` | Pass | `room/components.tsx:166-168` |
| 21 | Room final podium: 0 = "No results yet", tie = "Tied winners" | Pass | `room/components.tsx:174-176` |
| 22 | Device speaker chips: `m.avatar` rendered raw in an `aria-hidden` span; empty avatar leaves an empty gap, nothing falls back to initials | Risk | `device/SpeakerBar.tsx:55` |
| 23 | Device fallback card: "No picks yet" / "No available players" | Pass | `device/FallbackCard.tsx:45,63` |
| 24 | Room name or player name very long: `rm-clamp` with `title` used on room rows | Pass | `room/components.tsx:129,166` |

## A07 Fixed and absolute layers

Layer inventory from CSS rule scan (`position: fixed|sticky` and any `z-index`). Line numbers refer to the start of the rule (a leading comment in the file can shift the reported line by one or two).

| Layer | File:line | Position | z-index |
| --- | --- | --- | --- |
| Original TV viewport / lounge viewport (stage roots) | `tv/screen.css:1`, `lounge/lounge.css:1` | fixed | none |
| Original TV focused scroll/summary | `tv/screen.css:16` | | 4 |
| Lounge focus ring | `lounge/lounge.css:13` | | 3 |
| Lounge modal backdrop (roster dialog) | `lounge/lounge.css:130` | absolute | 20 |
| Lounge network banner | `lounge/lounge.css:154` | absolute (right 110, bottom 110) | 30 |
| TV reconnect banner | `tv/screen.css:156` | absolute (right 110, bottom 110) | 50 |
| TV too-small notice | `tv/screen.css:159` | relative | 100 |
| Device drawer backdrop | `device/speaker.css:9` | fixed | 50 |
| fx toast layer | `fx/fx.css:11` | fixed (top or bottom 5%) | 58 |
| fx play banner | `fx/fx.css:3` | fixed (inset 5% 5% auto, min-height 130) | 60 |
| Device input area | `device/device.css:619` | sticky bottom | 2 |
| Device trace panel | `device/device.css:408-421` | absolute | 5 |
| Room Save bar | `room/room.css:76` | sticky bottom | 2 |
| Room TV tool panels | `room/broadcast.css:33` (absolute, z 5), `:37` (fixed under 1000px) | absolute / fixed | 5 |

| # | Item | Rating | Evidence |
| --- | --- | --- | --- |
| 1 | Play banner (z 60, top 5%, 130 px+) is fixed over the TV header, so it covers `ViewNav` and the focused control for about 2 s. `pointer-events:none` so clicks pass through, but the focus ring and nav labels are visually hidden; video captions at the top would be hidden too. | Risk | `fx/fx.css:3`, `fx/fx.css:2` |
| 2 | Toast (z 58) and banner (z 60) share the top 5% area on `/tv`; `Moments.tsx:140` suppresses toasts while a banner shows, which avoids stacking. | Pass | `tv/Moments.tsx:138-140` |
| 3 | Banner (z 60) is above the reconnect banner (z 50) and drawer (z 50); a play banner can cover the top of the drawer. | Risk | `fx/fx.css:3`, `device/speaker.css:9` |
| 4 | Reconnect banners sit at `right:110px; bottom:110px` over the footer and the last content row; the TV one has `autoFocus` on Retry. No reserved slot; it can cover the "Back to game" remote hint and bottom rows of rosters/standings. `/lounge` uses the same offset at z 30. | Risk | `tv/screen.css:156`, `lounge/lounge.css:154`, `tv-broadcast/ReconnectBanner.tsx:24` |
| 5 | Phone room: toast layer at `placement="top"` (5%), sticky Save bar at bottom: no overlap. Lineup page has a sticky `rm-save` (z 2) above content; the iOS keyboard shrinking viewport may cover it. Needs a device test. | Risk | `room/RoomPage.tsx:51`, `room/room.css:76` |
| 6 | Device sticky input (z 2) vs trace overlay (z 5): trace is designed to open above the footer. | Pass | `device/device.css:408,619` |
| 7 | Room TV tool panels (absolute above the footer at 1400x850+, fixed full-height under 1000 px), no backdrop and z 5, so they sit above content but below banners. | Risk | `room/broadcast.css:33,37` |
| 8 | No global z-index scale: values 1, 2, 3, 4, 5, 20, 30, 50, 58, 60, 100 are chosen per file. The lounge modal (20) is below the lounge network banner (30), so a reconnect banner can sit on top of the open dialog. | Risk | `lounge/lounge.css:130,154` |
| 9 | `tv-small-screen` (z 100) is a relative-positioned flow element inside a hidden stage; fine. | Pass | `tv/screen.css:159` |
| 10 | Overlay extension: `.bw-layer` is absolute with `pointer-events:none`, children opt in; no explicit z-index, so stacking relies on DOM order against host page layers. | Risk | `overlay/styles.ts` (`.bw-layer`) |
| 11 | Hit-test: for every control on `/`, room phone, `/tv`, `/tv2`, `/device/garcias` (66 controls) the element at the control's centre was the control itself, so no covered controls in the idle state. Banners were not triggered in that run. | Pass | `scratchpad/qa/contrast2.cjs` |
