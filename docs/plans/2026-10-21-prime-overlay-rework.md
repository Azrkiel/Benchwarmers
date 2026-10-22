# Prime Video overlay and unobstructed playback

Status: proposed design and implementation sequence. No application changes made in this planning pass.

Implementation update, 2026-10-22: the viewer subsequently requested actual YouTube and a live backend. That narrower track is implemented in `extension/` with shared `web/src/overlay/` components and `/control/:code`. Actual YouTube development-browser checks verified real REST drafts/picks, backend scoring, native fullscreen, a protected lower region, settings-menu yielding, and Hide. See [extension setup and limits](../../extension/README.md). Prime integration, arbitrary protected rectangles, physical-TV testing, and external sports data remain unimplemented. The original `/tv`, `/lounge`, and embedded `/watch` versions are preserved.

## Hardware update — 2026-10-22

Confirmed by the viewer: Toshiba **50L2200U**, a non-smart TV available as a laptop HDMI display, and **Echo Show 5 (3rd generation)** with Alexa+. The primary deployment target is now the laptop browser displayed on the Toshiba. No native TV app is required. The laptop OS/browser, actual display settings, and Echo software state still need verification during setup.

**Recommended first hardware experiment:** run Prime in the laptop browser, test the user-activated Benchwarmers overlay in that same page, and output the composed browser view to the Toshiba over HDMI. First verify ordinary Prime playback on that HDMI connection, then test fullscreen composition. Add the Echo Show 5 as an optional voice companion after the viewing flow works; test compact visual cards only if its actual Alexa+ host exposes a supported screen surface. Neither the Prime overlay nor Echo connectivity has yet been verified on this hardware.

```text
[Laptop browser: Prime + Benchwarmers overlay]
                   |
                  HDMI
                   |
                   v
[Toshiba 50L2200U: composed browser picture + audio]

[Viewer voice / supported touch actions]
                   |
                   v
       [Echo Show 5 (3rd gen) / Alexa+]
                   |
                   v
       [Onboarded Benchwarmers add-on] <--> [Party backend]
                   |
          +--------+----------------+
          | voice available         | visual surface available
          v                         v
     [Short spoken answer]     [One compact crew/pick/roster card]

Onboarding unavailable -> Local Inspector / web companion, labeled simulation.
Visual surface absent -> Voice-only interaction; no claim of on-device cards.
Prime page/fullscreen unsupported -> Use separate companion; leave playback intact.
```

Hardware changes the order of work:

- [x] Identify the display route and Echo generation: Toshiba 50L2200U through laptop HDMI; Echo Show 5, third generation.
- [ ] Confirm laptop OS/browser and Echo software state. Verify Prime playback and audio on HDMI before adding the overlay. Inspect actual resolution, browser zoom, and TV picture sizing; check edge cropping at viewing distance. Do not assume the TV remote controls browser focus: use the laptop keyboard or a tested paired input device initially.
- [ ] Verify developer onboarding and a minimal Benchwarmers voice response on the actual Echo. Owning an Alexa+ device does not mean the custom add-on is already connected. The repository's `web/src/device/DevicePage.tsx` is still a placeholder; do not present it as a working device integration.
- [ ] Verify the screen surface separately. Amazon documents MCP Apps visuals on screen-based Alexa+ devices and host-provided layout capabilities. Read the actual host context, and test this Echo Show 5 rather than assuming a Show 8 simulator proves compatibility. If the host supplies no visual surface, keep the flow usable by voice.
- [ ] Design Show-sized cards: one active question with two clear choices, a short standings view, or one person's roster at a time. Preserve the scorebook palette and readable labels; do not shrink the 1920 × 1080 TV dashboard onto the small display. Test touch, voice, stale data, and return navigation on hardware.
- [ ] Verify simultaneous use: TV playback continues while the Echo answers; speech remains intelligible over the broadcast; no unrequested spoken notifications occur. The party feed is independent of stream delay, so do not claim it automatically knows the exact play currently shown on Prime.
- [ ] Run the browser-extension feasibility spike on the laptop, then repeat it on the Toshiba over HDMI. Verify captions, native Prime controls, fullscreen entry/exit, and couch readability. Keep Echo interaction independent of the stream until onboarding and timing behavior are verified.

For an Alexa+ MCP implementation, the current Amazon quickstart requires a remotely reachable Streamable HTTP server, the specified authentication/account-linking setup, and sub-500 ms query response latency. Establish these before claiming real Echo connectivity. Do not expose a local service or change account settings during this planning pass.

Hardware references checked on 2026-10-22:

- [Alexa+ integration approaches](https://developer.amazon.com/docs/alexaplus/add-ons/choose-the-proper-alexaplus-integration-approach): MCP Apps support interactive visuals in Alexa's screen-based experience; it does not establish Prime cross-app overlay support.
- [Alexa+ layout and rendering](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-layout-and-rendering): use host context and verify real devices after simulator testing. Exact Show 5 visual behavior remains untested.
- [Alexa+ MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart): connectivity, authentication, and latency requirements for onboarding.

The browser-specific plan below is now the primary implementation track. The Echo companion is a separate follow-on; it is not required to prove the on-TV overlay.

**Goal:** Open Benchwarmers crew information on demand over a Prime Video browser stream while preserving access to captions, the broadcast score, and Prime's controls.

**Architecture:** Test a user-activated Manifest V3 extension on the actual Prime playback page. A small adapter observes accessible player geometry and control visibility; a shared React overlay renders crew data in an isolated UI root. Prime owns playback and fullscreen; the Benchwarmers API supplies independent game-night data.

**Stack:** Existing React 19, TypeScript, Vite, Vitest, and party API; proposed Chromium Manifest V3 extension. Target: laptop browser with HDMI output to the Toshiba 50L2200U. Optional follow-on: Alexa+ companion on the third-generation Echo Show 5.

## What the screenshots establish

1. Image 2 shows our lower-left score strip covering both the broadcaster's score graphic and subtitles. Its fictional 48–45 score also competes with the real game information.
2. Our permanent seven-button top dock and sample banner occupy more video space than the resting experience needs.
3. Image 1 shows Prime using the top for titles and actions, the upper right for its subtitles menu, and the lower screen for seeking, playback, and alternate broadcasts. A fixed corner cannot be assumed safe.
4. The black video area in Image 1 does not establish a playback failure or a supported capture mechanism. Test the live page rather than inferring behavior from the screenshot.

Current causes are concrete: `WatchPage.tsx` always renders the full dock and clean TV iframe; `LiveView.tsx` always renders `Scoreboard`; overlay CSS anchors that scoreboard at the bottom. Changing `mode` replaces the iframe URL and restarts fixture state. There is no Prime adapter, player-menu awareness, or placement policy.

## Proposed viewing experience

Preserve the dark green scorebook identity: Barlow for labels/data, Barlow Condensed for short headings, surface `#111f1b`, raised surface `#22372e`, primary text `#f0eee4`, secondary text `#b5c3b7`, accent `#d6ee93`. Keep strong local backings and a white focus outline. Reduce the amount of UI rather than reducing text to unreadable sizes.

| State | Benchwarmers presentation |
|---|---|
| Watching | One small `Crew` launcher at a user-chosen safe side position. No duplicated game score, game clock, ticker, toolbar, or unsolicited panel. A clear-video preference hides even the launcher. |
| Crew opened | One compact panel with Standings, Picks, or one person's Roster. Show only game-night information the broadcast does not already provide. |
| Prime controls/menu visible | Suspend the overlay and its hit targets so seeking, subtitles, audio, and alternate broadcasts remain accessible. Restore the launcher after the player settles; require reopening the panel. |
| No safe placement | Hide the panel. Show the reason and recovery action in the extension popup or companion page outside the video. Do not pause the stream. |
| Feed unavailable | Keep the video usable. Within an explicitly opened panel, label retained values as stale, or show `Crew data unavailable` with Retry if nothing is cached. |
| Sample feed | Explicit opt-in and a compact `Sample data` label inside the panel. Do not present a fictional score as the current broadcast. |

### Geometry and collision policy

Use the visible video rectangle, accounting for letterboxing, as the coordinate space. Express protected areas proportionally. The following 1920 × 1080 CSS-pixel measurements are proposed starting values, not platform requirements:

- Protect the lower **35%** of the video by default: `y >= 702` at 1080p. Benchwarmers panels, launchers, notifications, and focus rings must remain outside it. This protects the area implicated by Image 2; it is not a guarantee for every caption layout.
- Protect a conservative upper title region and any known broadcast graphics. Allow the viewer to add or enlarge protected rectangles, including top-left tennis scores, taller captions, and graphics that change between broadcasts.
- Start with a side launcher around **160 × 56 px** and an opened panel no larger than **420 × 480 px**, with 28–32 px primary text. Long rosters show one member at a time; full draft tables and recaps open in the companion page.
- Placement candidates are stable left/right side positions inside the remaining safe area. Choose on opening or a meaningful layout change. Do not chase moving subjects or reposition every frame.
- If a panel plus its focus allowance cannot fit, collapse it. Do not solve a collision by shrinking essential type or moving into the caption zone.
- Keep Move left, Move right, Protected areas, and Hide available in the extension popup/companion settings and overlay settings when safe. Support keyboard placement as well as pointer placement.
- DOM-visible captions and controls may supply exclusion rectangles after verification. Burned-in subtitles and broadcast score graphics are video pixels; the first version will not pretend to detect them. Manual protected areas and Clear video remain available.

```text
Watching:                           Crew opened:
+--------------------------------+  +--------------------------------+
| Prime title/action region      |  | Prime title/action region      |
|                                |  |                     +--------+ |
| [Crew]       game               |  |        game         | Crew   | |
|                                |  |                     | panel  | |
|                                |  |                     +--------+ |
|--------------------------------|  |--------------------------------|
| Captions / broadcast scores     |  | Captions / broadcast scores     |
| Protected lower 35%             |  | Protected lower 35%             |
+--------------------------------+  +--------------------------------+
Prime controls visible -> Benchwarmers hides entirely.
No safe rectangle      -> Companion view; video remains clear.
```

### Input ownership

The extension action enables/disables Benchwarmers on the selected playback tab. The Crew launcher is a real labeled button, reachable by Tab/Enter; direction-based navigation operates only while focus is inside Benchwarmers. Do not intercept the player's ordinary arrows, Space, media keys, or typing.

Opening Crew focuses its selected destination. Direction keys move within the panel; Select opens a roster or setting. Back closes details, then the panel, and returns to the launcher. Never consume browser/native fullscreen Escape if it takes precedence. When Prime opens controls or a menu, cancel our focus trap and yield; do not move focus away from Prime on reappearance. If the previous focus target disappears, use a surviving Benchwarmers control only when Benchwarmers still owns focus.

Clear-video mode must have an outside-video recovery path through the extension action; an optional shortcut is supplementary. A physical remote path is pending device selection and testing.

## Prime integration: verify before promising

Keep Prime in its own authenticated page. The extension adds Benchwarmers UI without extracting the media, moving caption elements, changing player controls, or substituting a player. Do not attempt to load a Prime watch page into the current YouTube iframe.

Start with `activeTab` and `scripting` for user-invoked injection, not persistent access to every site. The extension UI and scripts are bundled locally. For game data, use a validated extension message to its service worker and fetch only from the configured Benchwarmers endpoint with narrowly scoped host permission; do not call the existing relative `/api` hook from the Prime origin. Start with fixture data to isolate display feasibility from networking.

Inspect the actual fullscreen element. If a supported player container can host the overlay, keep our root within it and respond to `fullscreenchange` and container replacement. A large z-index alone cannot establish fullscreen support. If fullscreen belongs to a video-only element or an inaccessible frame and cannot safely contain the UI, disable in-video fullscreen support and offer the companion view. Do not restructure Prime's player to force a result.

Browser/app support, exact page origins, frame access, Prime menu selectors, and fullscreen hosting remain unverified. The requested Prime URL and whether playback is in a browser or native app are the only user details needed for the first feasibility test. Chrome/Edge are the initial test targets; test Brave separately if that is the viewing browser.

```text
[Viewer enables extension on a Prime tab]
                   |
                   v
       [Validate site + find player]
         | unavailable         | supported
         v                     v
 [Explain in popup]     [Mount isolated overlay root]
 [Companion link]              |
                               +<-- Prime layout/control observations
                               +<-- Local protected-area preferences
                               +<-- Benchwarmers feed / sample fixture
                               |
                               v
                     [Placement + visibility policy]
                       | safe, Prime idle  | blocked / unsupported
                       v                   v
                 [Launcher / panel]   [Hide overlay + yield input]

 [Feed request] --error--> [Stale label / Retry within opened panel]
 [Fullscreen] --unsupported--> [Companion; leave playback intact]
 [Disable / navigate away] --> [Unmount + remove observers/listeners]
```

## Proposed file responsibilities

| File or directory | Responsibility |
|---|---|
| `web/src/overlay/OverlayRoot.tsx` | Compact, independently mounted crew UI; no broadcast scoreboard. Shared between preview and extension. |
| `web/src/overlay/overlay.css` | Scoped typography, surfaces, focus treatment, constrained panels. |
| `web/src/overlay/placement.ts` and `.test.ts` | Pure rectangle-based fit/exclusion rules, including focus clearance and no-space fallback. |
| `web/src/overlay/visibility.ts` and `.test.ts` | Watching/open/host-busy/hidden/unavailable states and focus ownership decisions. |
| `web/src/overlay/partySource.ts` | Typed read-only data source contract; fixture and bridge implementations. Leave `server/src/shared/types.ts` unchanged. |
| `extension/manifest.json`, `service-worker.ts`, `content.tsx` | User activation, bounded data requests, mounting/unmounting, packaged assets. |
| `extension/primeAdapter.ts` and `.test.ts` | Verified player/container observations; unsupported-state fallback. No guessed selectors in production. |
| `extension/popup.tsx` | Enable/disable, party/source selection, placement settings, unsupported-state recovery. |
| `web/src/watch/WatchPage.tsx`, `watch.css`, `WatchPage.test.tsx` | Apply the same unobstructed experience to the YouTube preview; keep player identity stable. |
| `docs/STREAMING_OVERLAY_PREVIEW.md` | Document the new behavior and actual platform verification, replacing outdated preview claims. |

Preserve `/tv/:code`, `/lounge/:code`, and `design-archives/scorebook-2026-10-21-161155.zip`. Do not restyle the preserved TV dashboard to solve an embedded-player problem.

## Implementation sequence and acceptance

- [ ] **1. Prime feasibility spike.** On the provided page, verify ordinary playback, injection, windowed/theater/fullscreen behavior, menu visibility, and container replacement with a sample Crew button only. Record actual origins and selectors. Deliver a supported/unsupported matrix before integrating gameplay UI. If unsupported, proceed with the unobstructed YouTube redesign and a Prime companion view; record the limitation clearly.
- [ ] **2. Placement and visibility behavior first.** Write failing Vitest cases for lower-zone exclusion, top-left broadcast graphics, large captions, long text/focus bounds, no free rectangle, host controls appearing while a panel owns focus, and layout resize. Implement the pure rules until the cases pass. Test that host-busy never steals Prime focus.
- [ ] **3. Compact shared overlay.** Build the launcher, four-person standings, current pick details, and one-member roster. Test open/close, Back restoration, clear-video recovery, loading/empty/stale states, held Select, and reduced motion. No game score or clock renders in this streaming component; no panel opens automatically.
- [ ] **4. Update the existing preview.** Replace its full TV iframe and permanent dock with the shared overlay. Keep video playback and the party source mounted across panel changes. Verify the source input and clear sample-data labeling still work. This removes the current iframe countdown reset as well as the visual collisions.
- [ ] **5. Add the Prime adapter and bounded feed bridge.** Bundle extension assets, mount only following viewer activation, implement the verified fullscreen path, and clean up after tab navigation/container changes. Validate message type, party code, payload shape, and the exact backend origin. Retry unavailable crew data without interrupting playback. Do not fetch arbitrary page-provided URLs.
- [ ] **6. Visual and interaction validation.** At 1920 × 1080 and 1280 × 720, test captions off/on, two-line and enlarged captions, bottom and top-left score graphics, Prime subtitle/audio menus, seek bar, alternate broadcasts, resize, fullscreen entry/exit, route changes, and lost connection. Compare annotated collision rectangles against rendered overlay/focus bounds. Observe playback directly if screenshots omit the video; do not infer failure from a black capture. Test keyboard access and then the selected physical TV/remote separately.
- [ ] **7. Verify and preserve.** Run `npm run test -w web` (no failures), `npm run typecheck` (exit 0), `npm run build` (exit 0), and the extension's packaging checks added with its build setup. Capture representative supported states and record untested platforms. Confirm the preserved routes and source archive remain intact.

Acceptance requires all of these: no duplicate broadcast scoreboard in streaming mode; zero intersection with configured protected regions including focus rings; Prime menus and playback controls remain operable; an explicit Hide action clears every Benchwarmers element; switching panels does not restart video or party state; fullscreen either works with evidence or is explicitly unsupported with a usable companion fallback. No automatic safe-placement claim without testing the actual broadcast.

## References and limits of evidence

- [Prime Video computer requirements](https://www.primevideo.com/help?nodeId=GUX9FYHU5D8LC9EJ): documents browser playback, not a third-party overlay integration.
- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): support the proposed user-invoked browser-extension approach. Prime compatibility remains an engineering hypothesis.
- [Extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): service-worker requests need the applicable host permission; content-script requests retain page-origin restrictions.
- [Fullscreen API guide](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide): fullscreen uses a top layer and reports changes through `fullscreenchange`; inspect the actual player before selecting a mount strategy.

The two supplied screenshots and existing source were inspected. This document proposes a layout; no new mockup, Prime integration, collision engine, or physical-device test has been completed in this pass.
