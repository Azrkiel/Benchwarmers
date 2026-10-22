# TV broadcast implementation plan

Goal: replace the dense TV presentation with the approved broadcast design and usable remote navigation.

Architecture: retain `usePartyState`, the 1920x1080 Stage, existing data types, and the four screens. A small view-navigation component owns keyboard focus; TvPage owns manual selection and returns to automatic viewing on Back. CSS owns safe margins, typography, composition, and reduced motion.

Tech stack: React 19, TypeScript, CSS, Vite, Vitest/Testing Library.

```text
REST or fixture --> usePartyState --> automatic mode --> TV screen
                         |                  ^             ^
                  request failure       Back/Escape        |
                         |                  |             |
                  retain last state     manual mode -------+
                         |                  ^
                  reconnect notice      arrow + Select
                                            |
                                      view navigation
```

## Files

- `web/src/tv/ViewNav.tsx`: view buttons, directional focus, Select and Back handling.
- `web/src/tv/TvPage.tsx`: safe shell, navigation integration, manual/auto state, live-status transitions.
- `web/src/tv/tv.css`: replace the previous 1400-line style sheet with one consistent broadcast system.
- `DraftBoard.tsx`, `Leader.tsx`, `Standings.tsx`, `FinalView.tsx`, `RostersView.tsx`, `avatar.tsx`: remove decorative repetition and simplify readable content.
- `PlayByPlay.tsx`, `Ticker.tsx`: fewer plays and a stable activity line.
- `TvPage.test.tsx`, `ViewNav.test.tsx`, existing screen tests: verify observable behavior and update intentionally changed presentation assertions.

## Tasks

- [x] Add failing tests for arrow focus without selection, Enter selection, legacy Fire TV key codes, Back restoring auto, manual views surviving idle rotation, and terminal party transitions. Run `npm run test -w web -- src/tv/ViewNav.test.tsx src/tv/TvPage.test.tsx`: new tests fail because navigation is absent.
- [x] Implement ViewNav and integrate TvPage. Keep available views tied to party status; a query-mode preview remains usable. Use `event.key` with legacy key-code fallback for 13/37/38/39/40 and Back 4. Prevent Back only when returning from manual mode; allow normal browser behavior at the root. Run the targeted tests: all pass.
- [x] Replace the visual system. The safe content area is 1728x972, inset 96px horizontally and 54px vertically. Reserve a 68px header, 24px gap, 792px body, 24px gap, and 64px navigation footer. Live uses a 1064px main column and 624px standings column with a 40px gap. Use 28px minimum content text, 40-56px names/headings, and 104-128px key scores. Remove 3D flips, gradients, emoji ornament, animated ticker, confetti, and repetitive leader roster content. Keep all pick lifecycle states.
- [x] Simplify DraftBoard into flat cards, Leader into a compact lead summary, and FinalView into clean ranked blocks. Retain all roster identities, jersey numbers, fantasy scores, recap, and season results. Add/update behavior assertions when content changes; run `npm run test -w web`: all tests pass.
- [ ] Verify `npm run typecheck -w web` and `npm run build -w web`: exit 0. Start the app with `npm run dev -w web -- --host 127.0.0.1`, inspect all four fixture views at 1080p/720p, and test keyboard focus and pick states. Record any browser access blocker explicitly; do not claim visual verification without a render.
- [x] Review the final diff, run relevant checks once more after fixes, and provide preview links. Keep the branch local; no merge or publication requested.

## Acceptance

All four screens share the same safe margins and typography. Every view control works without a mouse, focus differs from selected state, manual viewing stops idle rotation, and Back returns to automatic viewing. Game state, scores, picks, and backend contracts remain intact. Reduced-motion CSS overrides all TV animation, and rank animation already checks the OS preference in `flip.ts`.

Verification result: tests (256), typecheck, build, and HTTP smoke checks pass. Rendered visual QA remains pending because the browser inventory is empty; details are in docs/TV_REDESIGN_QA.md.
