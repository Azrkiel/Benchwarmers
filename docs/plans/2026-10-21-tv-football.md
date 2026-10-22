# TV football and pick bonuses

Scope: implement the seven gaps in `docs/TV_FOOTBALL.md` using the existing REST contract. Keep basketball working; no server changes.

Design: retain the current TV layout. Replace the basketball court with a football field for football parties, showing the latest drive's starting field position and possession. Label the marker as the drive start, since the API does not provide a live ball position. Clear possession when the drive ends. Show football clock tags, wrapping play text, paired yes/no cards, historical drive percentages, and server-scored bonus chips. Add positions to the leader roster; verify existing draft positions with football data.

1. Add regression tests for football field/clock, drive endings, binary questions and historical percentages, bonus visibility while another question is open, and football positions.
2. Implement field and sport-aware play-by-play; preserve basketball behavior.
3. Implement historical context, yes/no layout and reusable bonus chips from `BONUS_COPY` and server score objects. Add leader and standings feedback.
4. Run web tests, typechecks and production build. Check real generated football states in the browser at 1600×900 and 1920×1080, including draft/open/locked/resolved and basketball regression views.

Workspace: `C:/Users/jiang/Benchwarmers-tv-football`, branch `feature/tv-football`, based on `be94b45`. Baseline: 278 web tests passed. The separate uncommitted TV redesign is outside this task.

Completed: all four steps. Final validation: 294 web tests, all three typechecks, web build; nine browser scenes with no checked-panel overflow or runtime exceptions. Local diff review checked drive-end handling, football clock scaling, fallback probabilities and bonus filtering. Security inspection found no new credential handling, remote services, HTML injection paths or server changes. Cleanup reuses one bonus component for the pick panel and standings. Browser QA caught and fixed standings overflow caused by wrapped bonus labels.
