# Benchwarmers TV redesign

Status: initial direction approved on 2026-10-20. The later game-first overlay requirements in `2026-10-20-game-overlay.md` supersede the full-dashboard composition and automatic rotation below.

## Goal

Make the existing TV experience feel like a considered sports broadcast and remain readable from the couch. Preserve the existing engine, party polling, fixtures, scoring, and draft ownership.

Reference: https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html

## Direction

Recommended: restrained sports broadcast. Use a slate canvas, off-white text, muted blue accents, tabular scores, fine rules, and deliberate spacing. Team and household colors identify data in small accents. Remove decorative glows, gradient panel stacks, emoji ornament, perpetual confetti, and 3D card flips.

Alternatives: a cinematic view emphasizes one item and requires more navigation; a usability-only pass preserves the current composition but leaves its density and visual repetition.

## Amazon guidance applied

- Keep all text, controls, and focus outlines within the inner 90% of the 1920x1080 canvas: at least 96px horizontally and 54px vertically.
- Use 28px as the minimum content text size at 1080p, with larger primary labels and scores. Maintain contrast and readable line spacing.
- Reduce simultaneous information and repeated content. Give each screen a clear purpose and visual hierarchy.
- Use a predictable horizontal row of view controls, reachable by directional keys. Show distinct focus and selected states.
- Keep text short and avoid input forms on the TV. Existing voice/device paths remain responsible for making picks and drafting.
- Honor reduced-motion preferences, including JavaScript-driven rank animations. Avoid continuous decorative motion.

These changes apply to the web TV view. Native Fire TV packaging, launcher integration, system keyboards, media playback, and OS-level remote APIs are outside this change.

## Screens

### Shared shell

A small Benchwarmers wordmark, party code, and crew name sit in a stable header. A consistent footer contains view navigation and concise remote hints. Loading and reconnecting states use the same safe margins. The 16:9 canvas continues to fit 720p, 1080p, and larger browser viewports without scrolling.

### Live

The game score is the primary anchor. A quiet court graphic and recent plays provide context. One live pick card shows the question, options, household picks, and a clearly labeled countdown or locked/result state. The right column shows the current leader and standings without repeating the leader's full roster. Draft/pick breakdown remains legible. A short activity line uses a stable location.

### Draft

Keep the two-team, 16-player board. Use flat cards with clear player identity and ownership rather than flips. Remove scouting paragraphs from the overview. Show draft progress and who still needs players. Ownership uses names as well as color.

### Rosters

Four calm member columns show three drafted players each. Separate names, stat lines, and fantasy points. Mark the benchwarmer with a text label rather than a decorative emoji. Preserve jersey numbers and team/position context.

### Final

Emphasize the night's winner and final score, followed by the other placements. Use clean ranked blocks rather than glowing metallic podiums and confetti. Keep the recap, benchwarmer result, and season standings, with restrained table styling and fewer competing accents.

## Interaction

View controls use standard buttons and a roving focus position. Left/Right moves focus; Enter/Select activates the focused view. Native Tab navigation remains usable. Back/Escape returns to automatic viewing. Selection does not interrupt the game or submit picks. Manual viewing pauses automatic rotation until the viewer returns to automatic mode; normal party status changes remain visible.

## Verification

- Add behavior tests before implementing remote navigation, manual/automatic mode handling, and reduced-motion rank movement.
- Run the frontend tests, TypeScript check, and production build.
- Inspect all four fixture screens at 1920x1080 and 1280x720, including focus, safe margins, overflow, and long labels.
- Check open, locked, and resolved pick states and reconnecting behavior.
- Keep sample preview URLs available for review; do not merge or publish as part of this task.
