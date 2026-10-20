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
