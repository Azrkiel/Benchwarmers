# ESPN UI/UX audit: QA records

Snapshot taken 2026-10-22 against the Vite dev server (`http://127.0.0.1:5197`, API proxied to :3001) while other agents were concurrently changing `web/src/device`, `web/src/tv-broadcast` and `web/src/room`. Re-run the scripts (kept outside the repo, in the session scratchpad `...\scratchpad\qa\`) before relying on any single number. No app source was changed. Physical-TV and screen-reader testing were NOT performed and remain manual.

| Record | Plan rows | Summary |
| --- | --- | --- |
| [contrast.md](contrast.md) | A01 | Walked 27 route/viewport combinations: 2254 text and 208 UI measurements, plus hover and focus states on home, room phone, `/tv`, `/tv2`, `/device`.<br>92 unique failures (77 excluding disabled controls): only 8 are enabled text, the rest are control borders using `--lg-line` `#4b4d52` (2.06 to 2.23:1 vs the 3:1 non-text minimum).<br>Worst text: white on yellow team colour (1.84:1, `.rm-endzone`), `#f51825` party chip (3.86:1); gradient and video backgrounds are not measured. |
| [tv-focus-map.md](tv-focus-map.md) | A02 | Keyboard map for `/tv` (live, draft, rosters, final) and `/tv2` (live, picks, standings, rosters, draft, final): initial focus, every arrow/Enter/Escape neighbour, edges, Back return targets.<br>No focus traps; Escape always returns to a nav button and Back restores the opening action.<br>Findings: footer Home unreachable by arrows on `/tv2`, Enter on the active nav button toggles to Game on `/tv2` only, Tizen/webOS Back keycodes unhandled, `/tv2` Picks has no focusable content. |
| [viewports.md](viewports.md) | A08, A09 | 62 screenshots in `screens/`: 16 TV routes at 1280x720 and 1920x1080; 6 non-TV routes at 320, 360, 390, 200% zoom emulation (720x500) and reduced motion.<br>0 horizontal overflow in all 62; clipped text only an intentional ellipsis on the draft board; small text: TV secondary labels 19.8 to 23 px (under 24), phone room/device/watch labels 11 to 11.7 px (under 12).<br>Physical TV at 3 m, real browser zoom and screen readers not tested. |
| [edge-states.md](edge-states.md) | A03, A06, A07 | Source-review checklist with Pass/Risk/Fail and file:line. A03: `ReconnectBanner` re-renders a `role="status"` every second (Fail); saved picks and live scores not announced.<br>A06: no empty state on `/tv2` Standings or Rosters, "1 players" copy, `/tv` avatar `<img>` lacks `onError`, `/tv2` avatar ignores emoji; lounge and room handle 0, 1 and ties.<br>A07: no shared z-index scale; play banner (z 60) covers the TV header and nav, reconnect banners sit at right/bottom 110 px over content. |

## Fixed after this snapshot (2026-10-22)

1. Control borders now use `--bw-control-line` (`#73767d`, 3.8:1) on room, device, voice-lab and overlay controls; `--lg-line` stays for dividers.
2. Football end zones pick black or white text from the team colour (`inkOn` in `web/src/room/components.tsx`).
3. The TV reconnect banner announces "Connection interrupted" once; the ticking age is outside the live region; Retry no longer steals focus.
4. The `/tv2` footer Home link joins the remote's left/right menu row.
5. Back keys for Tizen (10009, `XF86Back`) and webOS (461) map to Escape.
6. Empty states for 0 members on `/tv2` Standings and Rosters; "1 player" pluralization.
7. Phone text: room source/phase labels, the watch sample tag and the mic hint are at least 12px.
8. Party chip uses `--bw-link` for contrast.
9. Saved picks are announced once (`role=status`); `/tv` avatars fall back to initials when an image fails.
10. Layers: the play banner sits below the TV header row; the Lounge roster dialog is above the network banner.

Not changed on purpose: on `/tv2`, Enter on the already-open panel closes it (tested behavior); `/tv` has no panels to toggle.
Still manual: physical TV at ~3 m, real remote keycodes, screen readers, real browser zoom.
