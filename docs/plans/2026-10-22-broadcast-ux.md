# Broadcast UX pass (2026-10-22)

Goal: every screen should feel like a paid sports broadcast (ESPN / NFL / Prime / Peacock / ACC): a clean scorebug,
plays announced on screen, small celebrations when something changes, and short copy that doesn't explain itself.
Branch: `feature/broadcast-ux` → `dev` → PR to `main`.

## What I saw (before)
- **Room TV `/room/:code/tv` (football rooms, newest flow, home page's main CTA)** is the weakest screen: plain table
  standings, a half-empty question card, plays as small text lines, nothing reacts when a touchdown happens. Copy
  over-explains: footer "Scripted football | Shared players | $50,000 cap", "10 base pts | 0 picks | 24% reference",
  a two-line "Conditional pooled historical reference…" disclaimer, "1 players", "Personal room / Back".
- **Room phone `/room/:code`**: "Football watch party | scripted demo", "1 real players", "[x] Flex" / "* Captain"
  text toggles, a footer of disclaimers, a scoring-formula sentence under every question, no feedback when a pick hits.
- **Home**: landing copy "A football watch party with real friends, shared players, and a $50,000 lineup. Follow the
  fictional game together." plus "5 players · 1 captain · Every position counts" chips. Dev links shown like features.
- **Original TV `/tv/:code`**: already solid (FLIP standings, fantasy pops, final confetti). Missing: big-play
  announcements, a celebration when someone climbs the standings, a pick-result reveal.
- Lounge, scorebook TV, device page: fine; only light copy checks.

## Phases
- [x] **0. Sync** — local `dev`/`main` fast-forwarded to `origin/main` (PR #8 + real games); Codex clone's WIP already
      identical to `codex/wip-snapshot`. Pushed `dev`.
- [ ] **1. Broadcast FX kit** (`web/src/fx/`): `PlayBanner` (full-width sweep for TD / FG / pick-six / big play),
      `SideBurst` (small confetti puff from a screen edge), `useRankClimb` (detect who moved up), `ScoreTick`
      (score digit bump + glow on change), `Toast` (lower-third "Maya climbs to #1"). CSS only, no new deps,
      honours `prefers-reduced-motion`, never fires for data already on screen at first load.
- [ ] **2. Room TV redesign**: broadcast scorebug in team colours with possession dot + down & distance; field with
      first-down/drive marker; play announcements via `PlayBanner`; question card with countdown bar and live pick
      split; standings as rows with avatars-initials, FLIP movement and `SideBurst` on climbs; lobby as a big
      "join" screen where new players pop in; final with podium + confetti. Remove the over-explaining copy.
- [ ] **3. Room phone**: tighter copy, real toggle states for Captain/Flex, "Nice call! +12" celebration on a correct
      pick, rank-change toast, rules collapsed and trimmed, footer disclaimers removed.
- [ ] **4. Original TV `/tv/:code`**: `PlayBanner` for big plays (3s, dunks, TDs, drive results), `SideBurst` on
      standings climbs, correct-pick reveal on the pick bar, score bump.
- [ ] **5. Copy sweep**: home landing + cards, More views, rules text, empty states, device/lounge strings.
- [ ] **6. Verify + ship**: typecheck, server + web tests, Playwright screenshots of every route (before/after),
      merge to `dev`, push, PR `dev` → `main`.

## Rules
- Keep the Lounge tokens (`--lg-*`) and type. No real teams in committed data, no betting words.
- Animations short (≤ 2.5 s), small, and skipped under reduced motion. Nothing fires on first paint.
