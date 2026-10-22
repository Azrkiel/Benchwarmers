# Benchwarmers on actual YouTube

The unpacked browser extension adds a Crew launcher and compact crew panel directly to `https://www.youtube.com/watch` pages. It reads the running local party backend once per second. It does not embed or replace YouTube's player, infer scores from video, synchronize stream delay, or integrate with Prime Video.

## What is live

Drafts, picks, game status, rankings, and fantasy scoring come from the real REST backend. The game engine replays the committed fictional Harbor/Summit game. The initial members are the seeded Sunday Crew. These are not real-world sports scores or player statistics. No sports-data provider is connected.

## Run

From the repository root, in separate terminals:

```powershell
npm run dev:overlay -w server
```

```powershell
npm run dev -w web
```

The backend uses `server/data/overlay-session.json`, separate from the default store, fallback AI, and 1× game speed. The replay lasts eight minutes after Start; it does not start on its own. Both processes must remain running.

Build the extension after source changes:

```powershell
npm run build:extension
```

The installable folder is `C:\Users\jiang\Benchwarmers\extension\dist`.

## Install once in your viewing browser

1. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions` in the browser where you watch YouTube.
2. Enable Developer mode, select **Load unpacked**, and choose the `extension/dist` folder above. Select the folder, not an individual file.
3. Open a normal video on `https://www.youtube.com/watch`. Refresh any YouTube tab that was already open when you installed the extension.
4. Open **Benchwarmers for YouTube** from the browser's Extensions menu. Keep the party code as `latest`, then select **Show on YouTube**.
5. Select **Crew** beside the video. Choose Standings, Picks, or Roster. Use YouTube's own fullscreen button; the overlay follows the player.

Installation and enablement in the viewer's personal browser remain manual. Development verification used a separate Chromium profile; it did not install anything into the user's Brave profile.

## Run data through it

Open `http://127.0.0.1:5173/control/latest` in another tab or window.

1. Keep the current drafting party or select **New party**. The extension's `latest` setting follows the newest active Sunday Crew party.
2. Select a member under **Act as** and draft players. Changes appear under that member's Roster in the YouTube panel.
3. Select **Start game replay**. The server fills unclaimed roster slots and advances the fictional game's clock and events.
4. Select an answer under **Call the next play** while a question is open. Select **Picks** in the YouTube panel to see the backend's pick counts change. Resolved questions and subsequent events change crew totals.
5. After eight minutes, the replay finishes. Create a new party to run again. Using an explicit code in the extension pins it to that party instead of following `latest`.

The control page is a local development controller for all seeded members. It is not an authenticated multi-user production UI. The extension only reads state; mutations occur in the control page.

## Watching behavior

- The default is one Crew launcher. No duplicate broadcast scoreboard or clock.
- Panels stay above the lower 35% of the player rectangle, leaving the usual caption/score region clear. This is a conservative geometric rule, not video-content detection.
- Move left/right avoids graphics in either side position. If the video is too small for readable controls, the overlay stays hidden; use theater/fullscreen or the control page.
- YouTube settings, share, and context menus suspend the overlay. The panel stays closed afterward until Crew is selected again.
- Normal pointer events pass through the unused area to YouTube. Keyboard arrows are handled only inside the crew panel. Escape closes the panel when browser/fullscreen handling does not take precedence.
- **Hide overlay** removes all Benchwarmers UI. Re-enable it from the extension popup.
- Connection errors appear in an opened panel. Last received values are marked stale; no fixed fixture is substituted. Retry or restart the backend if necessary.

Burned-in graphics or custom caption positions can still overlap a side panel. Move it or hide it. Arbitrary protected rectangles and automatic graphic detection are not implemented. No Prime or native smart-TV support is claimed.

## Permissions and implementation

YouTube content access is limited to `www.youtube.com`. Settings use extension-local storage. The worker's only network permission is loopback, and code fixes the API destination to `http://127.0.0.1:3001`. Incoming messages must be from this extension's YouTube content script and contain a valid party code. The worker makes GET requests only. No credentials, YouTube content, or browsing history are sent to the backend.

The content script bundles React and the shared overlay into a Shadow DOM root. Fullscreen re-parents only that overlay root into YouTube's fullscreen container; it does not modify the video or native controls. A video-only or inaccessible fullscreen container is unsupported and hides the overlay.

## Verification

2026-10-22 development Chromium, actual `youtube.com/watch`, 1920 × 1080 and 1280 × 720:

- A control-page draft appeared in the YouTube roster through the REST backend.
- A control-page pick appeared in the YouTube pick counts.
- Backend time advanced; video decoded and played (`paused=false`, `readyState=4`).
- The panel stayed outside the protected lower region, followed native YouTube fullscreen, yielded to settings, and fully disappeared when hidden.
- No page errors were observed in that run. The YouTube chat pane displayed a browser-compatibility notice in the test browser; chat functionality was not verified.
- Real Toshiba HDMI, viewing distance, a physical remote, and the user's Brave installation remain untested.

Checks: `npm test`, `npm run typecheck`, `npm run typecheck:extension`, `npm run build`, and `npm run build:extension`.

Sources: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). The extension uses narrowly matched static content scripts rather than the earlier proposed Prime activeTab experiment.
