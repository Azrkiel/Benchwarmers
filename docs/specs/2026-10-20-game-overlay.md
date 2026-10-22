# Game-first transparent TV overlay

Approved direction: the user wants the actual game to remain the focus, with Draft and Rosters toggled on demand and more tactile, lively buttons. The user chose a transparent overlay over OBS/an existing broadcast instead of an in-app video player.

## Behavior

- The page, document root, and overlay canvas are transparent. OBS supplies the video below this Browser Source.
- A compact score strip is the default presentation. No simulated court, full-screen roster board, draft board, standings panel, or detailed pick card opens automatically.
- The control dock toggles Picks, Standings, Rosters, Draft, and (after the game) Results. Selecting an open panel again closes it. Game or Back closes the current panel.
- Party phase changes close manual panels. They do not automatically open a different panel. The old idle rotation has been removed.
- The base overlay stays mounted while panels are toggled, preserving event tracking and preventing replay of old fantasy-point notifications.
- Controls use raised dark surfaces, mint selected states, distinct focus rings, and a short press response. Panels have a brief opening transition; reduced-motion preferences disable it.
- `controls=0` hides the control dock and branding for a clean broadcast source. A fixed optional panel can be selected through `mode=draft|rosters|standings|picks|final`.

```text
OBS broadcast (outside this app)
          + transparent Browser Source
               + compact score strip
               + viewer chooses panel --> optional panel
                         ^                     |
                         +--- toggle / Back ---+
```

This changes presentation only. The score feed still uses the existing party API or committed fixtures; no real-sports data provider or video playback integration was added. Panel selection is local to that Browser Source, not synchronized from a separate operator browser.

## Verification

Tests cover default closed panels, no idle rotation, explicit toggles, Back behavior, phase changes, retained overlay identity, clean source mode, and legacy remote input. Build and TypeScript checks are required. Browser/OBS compositing still requires visual verification because no browser surface is connected in this session.
