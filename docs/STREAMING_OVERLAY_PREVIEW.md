# Streaming overlay preview

For the newer extension that runs on actual YouTube and reads the backend, see [extension/README.md](../extension/README.md). The embedded preview below remains available with its original sample fixtures and score strip.

Open `http://127.0.0.1:5173/watch/DEMO?fixture=live` while Vite is running.

This separate experiment embeds a YouTube player and layers the preserved transparent scorebook above it. Lounge and the original TV routes are unchanged. The initial video is a public basketball replay; the overlay uses the fictional sample game. Its scores, clock, picks, and fantasy totals do not describe or synchronize with the video.

Click Play in the video. Game, Picks, Standings, Rosters, and Draft change the overlay without replacing the video player. Select an open panel again, choose Game, or press Escape while an overlay control owns focus to close the panel. Left/Right moves focus across the control dock; Enter selects. Hide overlay leaves playback running. Fullscreen on the preview dock includes both layers. Browser Escape may exit fullscreen before reaching the page.

Paste another HTTPS YouTube watch, short, live, or embed link into the source field to replace the video. Embedding must be permitted by its owner and available in the viewer's region. The page does not embed arbitrary streaming websites or modify their pages. Other services need a separate integration or an OBS composition; this experiment does not establish support for them.

For the actual party API, remove `fixture=live` and use a valid party code. Video timing remains independent. Fixture panel changes reload only the overlay iframe, restarting that fixture's local countdown. This is a presentation experiment, not a video-synchronized game integration.

The overlay iframe ignores pointer input so the underlying player's controls work. The dock and source form provide browser keyboard access. Full TV remote behavior across the third-party player, physical TV readability, screen reader behavior, captions under every panel, and OBS compositing remain untested.

## Browser evidence — 2026-10-21

- Chromium at 1920 × 1080 and 1280 × 720: video decoded and played, with `paused=false`, `readyState=4`, and advancing playback time.
- Actual moving video remained visible behind the transparent score strip and optional panels. The page reported no JavaScript errors.
- Fullscreen included both the video and overlay. Panel headings cleared the dock after reserving space above the overlay canvas.
- Fixed Chromium's white iframe backing by matching the iframe element's `color-scheme: normal` to its transparent child document.
- Four behavior tests cover URL validation, clean composition, panel/Back/toggle behavior, stable player identity, and invalid source recovery. Web tests: 117 passing; TypeScript and production build pass.
- Screenshots: `design/watch/rosters-1080.png`, `design/watch/fullscreen-1080.png`, `design/watch/standings-720.png`.

The computer-use tool denied access to the user's Brave window, so the preview was tested in a separate development Chromium session. It was not opened or tested inside that existing Brave window.
