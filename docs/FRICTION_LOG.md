# Friction log

### [2026-10-20 22:00] Live Gemini exposed Windows CA trust and model-specific thinking settings
- Tool/SDK + version: Node 22.23.3 native fetch/TLS, Gemini 3.8 Flash REST generateContent.
- Task attempted: verify real Gemini generation with user-supplied server credentials.
- Steps taken: request model metadata and a small JSON response; compare normal Node trust with the Windows system store; retry the generation with LOW thinking.
- Expected vs actual: metadata initially failed with UNABLE_TO_VERIFY_LEAF_SIGNATURE. With system CAs it returned HTTP 200. Generation then returned HTTP 400 because MINIMAL thinking is unsupported by Gemini 3.8 Flash. LOW succeeded, with the first successful call taking about 22 seconds.
- Severity: Major (silent offline/template fallback masked live provider failures).
- Workaround: load Windows system CAs while preserving default trust and TLS validation; select LOW for 3.8 Flash; reserve a 60-second model deadline with bounded failover. Added regression tests for retained certificate identities and model-specific thinking settings.
- Suggestion: Google model setup should link the per-model supported thinking-level table; Windows Node setup should explain system-CA opt-in for machines with HTTPS inspection.

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

### [2026-10-20 18:30] onnxruntime-web WASM default: CDN fetch while Vite bundles an unused ~27 MB copy
- Tool/SDK + version: `@huggingface/transformers` 4.3.1 (onnxruntime-web 1.31.0-dev), Vite 8
- Task attempted: run `Xenova/wavlm-base-plus-sv` (q8, WASM) in a Web Worker for in-browser voice ID.
- Steps taken: built `web/` and inspected `dist/assets`.
- Expected vs actual: expected the ONNX Runtime WASM binary to come from the bundle. Actual: transformers.js fetches `ort-wasm*` from cdn.jsdelivr.net at runtime, while Vite also emits `dist/assets/ort-wasm-simd-threaded.asyncify-*.wasm` (26,861 kB, gzip 6,763 kB) that nothing loads unless `env.backends.onnx.wasm.wasmPaths` is set.
- Severity: Minor
- Workaround: accept the CDN fetch (needs network on first use; the MFCC fallback covers offline).
- Suggestion: document the `wasmPaths` / bundler setup for Vite prominently.

### [2026-10-20 18:35] microsoft/wavlm-base-plus-sv has no machine-readable license
- Tool/SDK + version: Hugging Face model `microsoft/wavlm-base-plus-sv` (ONNX copy `Xenova/wavlm-base-plus-sv`)
- Task attempted: confirm the license before shipping a model-based feature.
- Steps taken: read the model card, followed its link to github.com/microsoft/UniSpeech.
- Expected vs actual: expected a license tag. Actual: no tag; the card only refers to the UniSpeech repository, whose LICENSE is CC BY-SA 3.0.
- Severity: Minor
- Workaround: record the license by hand in `docs/VOICE_ID.md`; we do not redistribute the weights.
- Suggestion: add a `license` field to the model card metadata so tooling can read it.

### [2026-10-20 17:30] Avast Web Shield breaks every MCP client on loopback `/mcp`
- Tool/SDK + version: Avast Web Shield (`wsc_proxy`) on Windows; `@modelcontextprotocol/node` 2.1.1, `@modelcontextprotocol/client` 2.3.1, Node 22.
- Task attempted: serve the MCP endpoint over Streamable HTTP on localhost and connect a client.
- Steps taken: ran the MCP server and connected with the SDK client (vitest over real HTTP); reduced it to a plain `node:http` server returning a fixed `Content-Length` body on different paths.
- Expected vs actual: expected normal responses. Actual: for any path ending in `/mcp` (case-insensitive, e.g. `/mcp`, `/foo/mcp`), the proxy rewrites responses that carry `Content-Length` into `transfer-encoding: chunked` without chunk framing. Clients fail with `HPE_INVALID_CHUNK_SIZE`, or hang on the empty `202` responses. `/mcp/x` is unaffected.
- Severity: Major
- Workaround: `server/src/mcp/http.ts` forces chunked framing itself on `/mcp` responses.
- Suggestion: MCP SDK/docs: add AV HTTP filtering (loopback proxying) to the troubleshooting page, with `HPE_INVALID_CHUNK_SIZE` as the symptom. For Avast: do not rewrite framing on loopback traffic.

### [2026-10-20 17:35] `createMcpExpressApp()` silently enables DNS-rebinding Host validation
- Tool/SDK + version: `@modelcontextprotocol/express` 2.0.2
- Task attempted: expose the MCP server through a cloudflared tunnel.
- Steps taken: read the `createMcpExpressApp()` options and typings (`host` defaults to `127.0.0.1`) before mounting /mcp.
- Expected vs actual: expected a plain app. Actual: the default host is `127.0.0.1`, which turns on Host-header validation, so behind a tunnel (Host = tunnel hostname) requests would be rejected. Only visible in the .d.ts comments.
- Severity: Minor
- Workaround: mount the MCP handler into our own Express app; validate Host only when `ALLOWED_HOSTS` is set.
- Suggestion: document that the default host implies Host validation, and what to pass (`allowedHosts`) when running behind a tunnel or proxy; consider a log line when validation is active.

### [2026-10-20 18:05] ext-apps 2.0.3 / Vite 8 widget build notes
- Tool/SDK + version: `@modelcontextprotocol/ext-apps` 2.0.3, `vite` 8.3.x, `vite-plugin-singlefile` 2.3.x, TypeScript 7.
- Task attempted: bundle a vanilla-TS MCP App into one HTML file and typecheck it separately from the server.
- Steps taken: followed `examples/basic-server-vanillajs` (its `vite.config.ts` throws unless an `INPUT` env var is set, which is awkward cross-platform), wrote a config with a fixed input and `root`.
- Expected vs actual: build works (about 1 s) but the single file is about 246 kB, because `App` pulls the MCP client, zod and schemas into the bundle. `import './styles.css'` fails `tsc` with TS2882 unless `vite/client` is in `types`; the example tsconfig has it but this is not mentioned in the docs. Top-level `await app.connect()` works in a module script, but `ontoolresult` must be set before it, as documented only in an example comment.
- Severity: Minor
- Workaround: `types: ["node", "vite/client"]` in the widget tsconfig; fixed `input` in `vite.config.ts`.
- Suggestion: ship a minimal documented Vite config (no env var) and note the bundle size / tree-shaking expectation in the ext-apps README.

### [2026-10-20 23:30] WavLM x-vector speaker ID: default threshold too high, single-thread WASM slow
- Tool/SDK + version: `@huggingface/transformers` (`Xenova/wavlm-base-plus-sv`, q8, WASM), headless Chrome.
- Task attempted: live-turn speaker identification in the browser.
- Steps taken: ran `tools/voice-test.mjs` with Windows TTS voices (David, Zira), 3-clip centroids.
- Expected vs actual: expected the commonly cited 0.85 cosine threshold to accept true speakers. Actual: same-speaker scores were 0.788 to 0.974 and a true clip was rejected; cross-speaker 0.245 to 0.409. Embedding took about 7.4 s per clip single-threaded.
- Severity: Moderate
- Workaround: threshold 0.70, crop to the loudest 3 s, COOP same-origin + COEP credentialless headers with `onnx.wasm.numThreads = min(4, cores)`; 0.9 to 1.3 s per clip afterwards.
- Suggestion: model card for wavlm-base-plus-sv should give a realistic cosine range per speaker pair and note that the first load is about 102 MB; transformers.js docs should say WASM threads need cross-origin isolation (and that `credentialless` works with HF downloads).

### [2026-10-20 20:10] Avast loopback proxy intermittently freezes vitest workers doing `/mcp` HTTP for ~10 s
- Tool/SDK + version: Avast Web Shield (`wsc_proxy`) on Windows; vitest 5.0.5 (forks pool); `@modelcontextprotocol/client` 2.3.1; Node 22.
- Task attempted: phase 4a assistant tests (real server on an ephemeral port + real `/mcp` over loopback, many short-lived servers/clients).
- Steps taken: looped `npm test -w server`; added a temporary event-loop stall detector (100 ms interval) to every worker plus one standalone Node monitor process outside vitest; compared loopback latency for `/mcp` vs `/other`, `/mcp?x=1`, `/mcp/`, `/MCP` and `[::1]`.
- Expected vs actual: expected a stable suite. Actual: roughly 1 full run in 8, every vitest worker's event loop stalls for ~10 s at the same moment while the standalone monitor (no network) does not stall. Tests then fail with `Hook timed out in 10000ms` or `TypeError: fetch failed` / `SocketError: other side closed` (UND_ERR_SOCKET), in new and pre-existing files (`test/mcp/http.test.ts` 405 test, `test/api/rest.test.ts`). Without the assistant tests, 0 of 10 runs failed. `/mcp` loopback requests take about 2x as long as `/other`; a query string, trailing slash, upper case or IPv6 loopback do not avoid the proxy.
- Severity: Major (flaky CI-style runs on this machine)
- Workaround: re-run the suite; the failures are timing-only. No code workaround found inside phase-owned files.
- Suggestion: Avast: do not proxy loopback HTTP, or make the "/mcp" filter opt-in. MCP SDK docs: mention AV loopback proxies (freezes, `other side closed`) in troubleshooting.

### [2026-10-20 21:00] ext-apps basic-host: no auth header, hardcoded sandbox port, needs bun, tsc fails
- Tool/SDK + version: `modelcontextprotocol/ext-apps` v2.0.3 `examples/basic-host`, Windows, Node 22.
- Task attempted: render our MCP App against a bearer-protected `/mcp`.
- Steps taken: cloned the tag, `npm install`, `npm start`.
- Expected vs actual: expected it to run against any server URL. Actual: no way to send an Authorization header; sandbox URL hardcoded to `localhost:8081`; `npm start` requires `bun`; `npm run build` fails (`tsc` missing `@types/cors`); "Call Tool" is the second submit button (first is the theme toggle).
- Severity: Minor
- Workaround: patched the temp clone (requestInit headers, sandbox port 8181), `vite build` for both entries, ran `serve.ts` with `tsx`.
- Suggestion: accept optional headers via `SERVERS` config, make the sandbox port an env var, declare `@types/cors`, document a Node-only start.

### [2026-10-20 21:05] MCP Inspector 2.x CLI/UI differences
- Tool/SDK + version: `@modelcontextprotocol/inspector` 2.11.0.
- Task attempted: run the Checkpoint 2 flow and screenshot the tool list.
- Steps taken: UI via CDP; `--cli --method tools/call`.
- Expected vs actual: expected a "List Tools" button and readable tool errors. Actual: tools list on connect; custom headers only in Server Settings; CLI prints only `{"error":{"code":"tool_is_error"}}` with exit 5 on `isError` (message is in stdout JSON); `npx` start-up ~2.5 s per call.
- Severity: Minor
- Workaround: call the CLI `index.js` directly; read stdout JSON.
- Suggestion: print `content[].text` for `isError` results in CLI mode; allow `--header` in the UI's Add dialog.

### [2026-10-20 21:10] Widget season rows had no separators between stats
- Tool/SDK + version: our widget, seen through ext-apps basic-host v2.0.3.
- Task attempted: screenshot the season view at 800 and 1280 px.
- Steps taken: `get_season_standings` in basic-host.
- Expected vs actual: expected readable stats. Actual: five adjacent spans ran together and wrapped without spacing. A CSS `::before` separator left dangling dots on wrapped lines.
- Severity: Minor
- Workaround: one span with `&middot;` separators in `render.ts`.
- Suggestion: for wrapping inline stat lists, put separators in the text, not in CSS pseudo-elements.

### [2026-10-20 22:50] MCP App host in a cross-origin-isolated page: spec wants a second-origin sandbox proxy
- Tool/SDK + version: `@modelcontextprotocol/ext-apps` 2.0.3 (`app-bridge`, `examples/basic-host` at tag v2.0.3); Chrome headless (new); Vite dev with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` (needed for voice-ID threaded WASM).
- Task attempted: render our MCP App widget on the simulated device page (`/device/:household`).
- Steps taken: read basic-host (double iframe: outer sandbox proxy on a second origin/port, inner `document.write`), then built a host with `new AppBridge(null, …)` + manual `oncalltool`/`onreadresource` handlers proxied to our `/mcp` via `@modelcontextprotocol/client`, and a single `<iframe sandbox="allow-scripts" srcdoc=…>` (opaque origin, no `allow-same-origin`). Order that works: iframe in DOM → create bridge → register handlers → `connect(new PostMessageTransport(win, win))` → set `srcdoc` → wait `oninitialized` → `sendToolInput` + `sendToolResult`.
- Expected vs actual: the spec says a web host MUST use a separate-origin sandbox proxy; under COEP a cross-origin proxy page without CORP/COEP headers would be blocked (basic-host's `serve.ts` sets none). The single opaque-origin srcdoc iframe rendered fine under COOP/COEP (`crossOriginIsolated` stayed true). Gotcha for testing: Chrome runs the sandboxed opaque-origin frame out of process, so CDP `Page.getFrameTree` + `createIsolatedWorld` returns nothing useful; use `Target.setAutoAttach({flatten:true})` and evaluate in the iframe target's session.
- Severity: Minor
- Workaround: single srcdoc iframe with `sandbox="allow-scripts"`; the host keeps the widget live by re-calling the read-only view tool on party-state change and pushing `sendToolResult` (the widget itself never polls).
- Suggestion: ext-apps docs: describe a sanctioned single-frame variant for same-page demo hosts, and say which headers a sandbox proxy needs to be embeddable from a COEP page (`Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`).

### [2026-10-20 22:55] Vite dev proxy + forced chunked framing → `ERR_INCOMPLETE_CHUNKED_ENCODING` on MCP notifications
- Tool/SDK + version: Vite 8.3 dev proxy (`/mcp` → server), server `forceChunked` middleware (Avast workaround), `@modelcontextprotocol/client` 2.3.1 in the browser.
- Task attempted: browser MCP client (device page widget host) through the Vite proxy.
- Steps taken: `curl -i -X POST localhost:5177/mcp … notifications/initialized` vs the same against the server port.
- Expected vs actual: direct → `202` with `Transfer-Encoding: chunked`, curl exit 0. Through the Vite proxy → same headers but `connection: close` and a truncated body (curl exit 18); Chrome logs `net::ERR_INCOMPLETE_CHUNKED_ENCODING` for that POST. The client ignores it (notifications have no response) and all requests/tool calls work.
- Severity: Minor (console noise only)
- Workaround: none needed for the demo.
- Suggestion: server: skip `forceChunked` for empty-body 202 responses (send `Content-Length: 0`).

### [2026-10-21 12:00] Python on this machine: `python` has no pip, nflreadpy unavailable
- Tool/SDK + version: `py -3` (Python 3.14.5), nflverse-data `pbp` release files.
- Task attempted: build the NFL drive-odds table (phase 8a).
- Steps taken: skipped `nflreadpy`; wrote a stdlib-only script that downloads `play_by_play_{year}.csv.gz` with `urllib` and parses with `gzip` + `csv`.
- Expected vs actual: Avast HTTPS interception did not block `urllib` with `ssl.create_default_context()` + `load_default_certs()` (Windows store); all 11 seasons downloaded with verification on.
- Severity: Minor
- Workaround: stdlib-only script, cache in `tools/odds/.cache/` (gitignored).
- Suggestion: nflverse docs: mention the direct release URLs as a no-dependency path.
