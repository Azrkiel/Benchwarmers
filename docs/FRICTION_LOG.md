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
- Workaround: threshold 0.70, crop to the loudest 3 s, COOP same-origin + COEP credentialless headers with `onnx.wasm.numThreads = min(4, cores)`; about 1.3 s per clip afterwards.
- Suggestion: model card for wavlm-base-plus-sv should give a realistic cosine range per speaker pair and note that the first load is about 102 MB; transformers.js docs should say WASM threads need cross-origin isolation (and that `credentialless` works with HF downloads).
