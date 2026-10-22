# Friction log

Template:
```md
### [YYYY-MM-DD HH:MM] <short title>
- Tool/SDK + version:
- Task attempted:
- Steps taken:
- Expected vs actual:
- Severity: Blocker | Major | Minor
- Workaround:
- Suggestion: <specific, actionable>
```

### [2026-10-20 14:10] Alexa+ Local Inspector package not on the public npm registry
- Tool/SDK + version: `@alexa-ai/addon-local-inspector` (plan.md Phase 0 step 5)
- Task attempted: check the package before scheduling the optional Local Inspector demo.
- Steps taken: `npm view @alexa-ai/addon-local-inspector version`
- Expected vs actual: expected a version; got `E404 Not Found` from registry.npmjs.org.
- Severity: Minor (optional step)
- Workaround: use MCP Inspector + ext-apps basic-host + our own simulated device to show the MCP App.
- Suggestion: say in the Getting Started guide where the package is hosted (private registry? access request?) and how to get access.

### [2026-10-20 14:15] Plan asks for Node 24; machine has Node 22
- Tool/SDK + version: Node v22.23.3 (bundled with another tool on PATH)
- Task attempted: Phase 0 environment check.
- Expected vs actual: Node 24 expected for Local Inspector; MCP SDK v2 runs fine on 22.
- Severity: Minor
- Workaround: `engines.node >= 22`; Local Inspector is optional.
- Suggestion: document the minimum Node version per Alexa+ MCP toolkit component, not one global requirement.

### [2026-10-20 14:20] MCP TypeScript SDK v2 protocol version
- Tool/SDK + version: `@modelcontextprotocol/server` 2.3.1 / core
- Task attempted: verify the SDK speaks spec 2025-11-25.
- Steps taken: grep for the protocol constant in `node_modules/@modelcontextprotocol/core/dist`.
- Expected vs actual: `LATEST_PROTOCOL_VERSION = "2025-11-25"`. As expected, but only discoverable by reading bundled dist code.
- Severity: Minor
- Suggestion: export and document `SUPPORTED_PROTOCOL_VERSIONS` in the v2 README.

### [2026-10-20 14:50] Headless Chrome `--window-size` is not the viewport size
- Tool/SDK + version: Chrome headless (`--headless=new --screenshot`), Windows 11
- Task attempted: screenshot the 1920x1080 TV view (phase 5) to check layout without a server (`?fixture=` mode).
- Steps taken: `chrome --headless=new --window-size=1920,1080 --screenshot=... http://localhost:5199/tv/DEMO?fixture=live`
- Expected vs actual: expected a 1920x1080 viewport; got one ~95 px shorter, so the stage scaled to ~0.91 and hid real overflow bugs.
- Severity: Minor
- Workaround: pad the window (`--window-size=1936,1175`) so the viewport is exactly 1920x1080.
- Suggestion: document that `--window-size` includes browser chrome in new headless mode, or add a `--viewport-size` flag.

### [2026-10-20] TV redesign visual verification has no connected browser
- Tool/SDK + version: session browser automation (`cua_repl`).
- Task attempted: inspect the redesigned TV screens and remote focus at 1920x1080 and 1280x720.
- Steps taken: browser inventory, then attempted to open the local preview in Chrome.
- Expected vs actual: expected a browser surface; inventory returned no apps or browsers and Chrome creation returned `Browser is not available: chrome`.
- Severity: Major for visual QA; does not block build or behavior tests.
- Workaround: verified all tests, TypeScript, production build, palette contrast, and HTTP responses from all four preview routes. Kept the dev preview running. Rendered layout, overflow, and physical remote behavior remain unverified.
- Suggestion: connect a browser surface and complete the 1080p/720p checks before accepting the visual pass.

### [2026-10-21] TV restyle tooling and stale Vite module
- Tool/SDK + version: npm pack; Vite 8.3.4 on Windows.
- Task attempted: obtain self-hosted fonts and inspect the revised welcome screen.
- Steps taken: `npm pack @fontsource/barlow-condensed @fontsource/barlow --silent`; compared `/src/App.tsx` served by the existing Vite process against the file on disk.
- Expected vs actual: npm returned code 1 without diagnostic output; the running Vite process served an older App module while serving updated CSS.
- Severity: Minor; resolved during implementation.
- Workaround: downloaded the font files and OFL licenses directly from the Google Fonts repository; verified the preview process belonged to this checkout, restarted it, and checked that the served module included the new scorebook. Re-ran browser QA.
- Suggestion: verify served module content when an HMR preview disagrees with disk or a fresh production build.

### [2026-10-21] Streaming overlay browser access and iframe composition
- Tools: cua_repl browser inventory; Computer Use for Windows; Chromium development browser.
- Task: test a transparent scorebook above a streaming player.
- Expected vs actual: first browser inventory timed out; retry returned no browsers. Computer Use could list Brave but denied access to its window. A separate development Chromium session rendered an opaque white iframe despite transparent document backgrounds.
- Severity: Minor for the development preview; direct existing-browser integration remains unavailable.
- Workaround: verified the local YouTube composition in development Chromium. Matched the overlay iframe element's color-scheme to its child document, removing Chromium's white backing. Playback, panels, and combined fullscreen were verified at 1080p and 720p.
- Suggestion: test iframe color-scheme inheritance during transparent composition. Do not infer control permission from an app appearing in the window inventory.

### [2026-10-22] Preview URL failed with IPv6-only Vite binding
- Tool: Vite development server on Windows.
- Task: open the streaming overlay at http://127.0.0.1:5173/watch/DEMO?fixture=live.
- Expected vs actual: the supplied IPv4 preview link failed while http://localhost:5173 returned 200. Vite was listening only on ::1.
- Severity: Major for opening the supplied preview; no rendering fault was found.
- Fix: set server.host to 127.0.0.1 in web/vite.config.ts. The existing Vite process restarted and bound to the documented address.
- Verification: IPv4 request returned 200; Chromium rendered the scorebook above playing video, opened panels, and entered combined fullscreen at 1080p/720p with no page errors.
