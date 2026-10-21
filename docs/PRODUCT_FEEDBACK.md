# Product feedback

Feedback on the tools and SDKs used to build Benchwarmers. Distilled from [FRICTION_LOG.md](FRICTION_LOG.md) (entries cited by title), [MCP_HOSTS.md](MCP_HOSTS.md), [GEMINI.md](GEMINI.md), [AWS.md](AWS.md), [VOICE_ID.md](VOICE_ID.md) and [HANDOFF.md](HANDOFF.md). Anything not exercised is marked **unverified**. Environment: Windows 11, Node 22.23.3.

## Summary

| Tool | Used live? | Build again? |
| --- | --- | --- |
| MCP TypeScript SDK v2 | Yes | Yes |
| MCP Apps / ext-apps | Yes (basic-host, own host) | Yes, with doc fixes |
| MCP Inspector 2.11.0 | Yes | Yes |
| Alexa+ docs / Local Inspector | No (package E404; onboarding not done) | Unknown |
| Bedrock / AWS SDK | No (mocked only) | Unknown |
| Gemini REST + key pool | Yes | Yes |
| transformers.js / WavLM | Yes | Yes, as an opt-in feature |
| Vite 8 | Yes | Yes |
| cloudflared | Brief check only | Yes |
| Avast Web Shield (interference) | n/a | n/a |

## MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `client`, `node`, `express`)

- **Used for:** Streamable HTTP MCP server (stateless, bearer auth, 11 tools) plus the SDK client used by the assistant, tests, and the browser device page. Versions seen: server 2.3.1, client 2.3.1, node 2.1.1, express 2.0.2.
- **What worked:** Negotiated protocol `2025-11-25` (MCP_HOSTS). Runs fine on Node 22. The full Checkpoint 2 flow (setup, draft, pick, leaderboard, season) passed through the real endpoint.
- **What hurt:**
  - "MCP TypeScript SDK v2 protocol version": the supported spec version was only discoverable by grepping `node_modules/@modelcontextprotocol/core/dist`.
  - "`createMcpExpressApp()` silently enables DNS-rebinding Host validation": the default `host` of `127.0.0.1` turns on Host checks that would reject tunnel hostnames. Only visible in `.d.ts` comments. We mounted the handler in our own Express app (HANDOFF section 7).
  - Avast interference with the client and node packages: see the Avast section.
- **Suggestions:**
  - Export and document `SUPPORTED_PROTOCOL_VERSIONS` in the v2 README.
  - Document that the default host implies Host validation, say what to pass (`allowedHosts`) behind a tunnel or proxy, and log when validation is active.
  - Add a troubleshooting entry for AV loopback proxies (`HPE_INVALID_CHUNK_SIZE`, `other side closed`).
- **Build again?** Yes.

## MCP Apps / ext-apps (`App`, `app-bridge`, `basic-host`) 2.0.3

- **Used for:** a vanilla-TS widget (Draft / Tonight / Season views) served as a single HTML resource; rendered in basic-host and in our own host on the simulated device page via `AppBridge` + `PostMessageTransport`.
- **What worked:** The widget rendered in basic-host at about 800 and 1280 px with no widget console errors (MCP_HOSTS section 2). In the custom host, one opaque-origin `srcdoc` iframe rendered fine under COOP/COEP with `crossOriginIsolated` staying true ("MCP App host in a cross-origin-isolated page: spec wants a second-origin sandbox proxy").
- **What hurt:**
  - "ext-apps 2.0.3 / Vite 8 widget build notes": the example `vite.config.ts` throws without an `INPUT` env var; the single file is about 246 kB because `App` pulls in the MCP client, zod and schemas; `import './styles.css'` fails `tsc` (TS2882) without `vite/client` in `types`; `ontoolresult` must be set before `app.connect()`, documented only in an example comment.
  - "ext-apps basic-host: no auth header, hardcoded sandbox port, needs bun, tsc fails": no way to send `Authorization`, sandbox fixed at `localhost:8081`, `npm start` needs bun, `npm run build` misses `@types/cors`, "Call Tool" is the second submit button. We patched a temp clone.
  - "MCP App host in a cross-origin-isolated page...": the spec says a web host MUST use a separate-origin sandbox proxy, but under COEP a cross-origin proxy without CORP/COEP headers would be blocked (basic-host's `serve.ts` sets none; the log reasons about this, it does not record reproducing it). We deviated from the spec with a single `sandbox="allow-scripts"` iframe. Testing gotcha: the sandboxed frame runs out of process, so CDP needs `Target.setAutoAttach({flatten:true})`.
  - Known issue (HANDOFF section 10): `get_game_status` has no widget `_meta`, so hosts cannot show the tonight view from it.
- **Suggestions:**
  - Ship a minimal documented Vite config with no env var; note bundle size and tree-shaking expectations.
  - Document the `vite/client` typing requirement and the `ontoolresult`-before-`connect` ordering in the README, not only in an example.
  - Basic-host: optional headers via `SERVERS` config, sandbox port as an env var, declare `@types/cors`, document a Node-only start.
  - Document a sanctioned single-frame variant for same-page demo hosts, and the headers a sandbox proxy needs to be embeddable from a COEP page (`Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`).
- **Build again?** Yes. Rendering in a real Alexa+ host is **unverified** (HANDOFF section 9 lists it as an assumption).

## MCP Inspector 2.11.0

- **Used for:** Checkpoint 2 flow via UI and `--cli --method tools/call`; tool-list screenshot (11 tools).
- **What worked:** Tools list on connect; the CLI drove the whole flow including the `PLAYER_TAKEN` conflict path (MCP_HOSTS section 1).
- **What hurt:** "MCP Inspector 2.x CLI/UI differences": no "List Tools" button; custom headers only in Server Settings, not the Add dialog; CLI prints only `tool_is_error` and exits 5 on `isError` (details are in stdout JSON); `npx` start-up about 2.5 s per call, which can miss the pick window at SPEED=4.
- **Suggestions:** print `content[].text` for `isError` results in CLI mode; allow `--header` in the UI's Add dialog.
- **Build again?** Yes (workaround: call the CLI `index.js` directly).

## Alexa+ docs / Local Inspector

- **Used for:** only the design constraints we took from the docs (for example 401 without `WWW-Authenticate`, HANDOFF section 8). Alexa+ onboarding was not done and no Alexa+ host was run, so behavior on a real Alexa+ device or host is **unverified**.
- **What worked:** nothing to report first-hand.
- **What hurt:**
  - "Alexa+ Local Inspector package not on the public npm registry": `npm view @alexa-ai/addon-local-inspector version` returned `E404`. Dead end, do not retry (HANDOFF section 7).
  - "Plan asks for Node 24; machine has Node 22": the plan assumed Node 24; the SDK ran fine on 22.
- **Suggestions:** state in Getting Started where the Local Inspector package is hosted (private registry? access request?) and how to get access; document the minimum Node version per toolkit component instead of one global requirement.
- **Workaround used:** MCP Inspector + ext-apps basic-host + our own simulated device page.
- **Build again?** Unknown. Open item for the human: optional Local Inspector access (HANDOFF section 11).

## Amazon Bedrock / AWS SDK (`@aws-sdk/client-bedrock-runtime`, Converse API)

- **Used for:** designed as the content and assistant provider via `ConverseCommand`, Haiku-tier model through a cross-region inference profile (AWS.md). Tested with **mocks only**; the Bedrock path has **never run live** (HANDOFF sections 9 and 10; GEMINI.md: a live Bedrock test is still required).
- **What worked (as designed, not live-verified):** background worker keeps Bedrock out of the request path; zod-validated JSON with one retry; fallback content with zero credentials; usage counters (`getAiUsage()`).
- **What hurt:** no friction-log entries because no live run happened. Open risks, all **unverified**: model access and permissions, inference profile id, real tool-use shapes versus mocks, and empty forced-final text handling (HANDOFF section 10). Because AWS setup was deferred, Gemini served as the live stand-in (GEMINI.md).
- **Suggestions:** none evidenced.
- **Build again?** Unknown. Pending human steps: account, Model access, `aws configure`, `BEDROCK_MODEL_ID`, $5 budget alarm (HANDOFF section 11).

## Gemini (REST `generateContent`, 3.8 Flash, key pool)

- **Used for:** live content generation and the assistant function-call loop, with a teammate key pool and automatic failover (GEMINI.md).
- **What worked:** Keys stay server-side; 401/403 disable a key, 429/5xx/network errors cool it down with `Retry-After`/`RetryInfo` honored; one draft persisted exactly once after failover in a real HTTP/MCP/store checkpoint. Live access and JSON generation were verified with user-supplied keys. Server suite: 519 tests passing serially.
- **What hurt:** "Live Gemini exposed Windows CA trust and model-specific thinking settings": `UNABLE_TO_VERIFY_LEAF_SIGNATURE` until Windows system CAs were loaded; HTTP 400 because MINIMAL thinking is unsupported on 3.8 Flash (LOW works); first successful call took about 22 s, so the deadline is 60 s rather than 15. Silent offline/template fallback masked these failures.
- **Suggestions:** link the per-model supported thinking-level table from model setup docs; explain system-CA opt-in for Node on machines with HTTPS inspection. Per GEMINI.md, keys in one Google project can share quota, so extra keys do not multiply the allowance.
- **Build again?** Yes.

## transformers.js 4.3.1 / WavLM (`Xenova/wavlm-base-plus-sv`)

- **Used for:** on-device speaker identification in a Web Worker (q8, WASM), with an MFCC fallback (VOICE_ID.md).
- **What worked:** after tuning, 0.9 to 1.3 s per clip, with held-out clips ranking their own speaker first. Falls back to MFCC when the model cannot load. Nothing but the model and runtime downloads touches the network.
- **What hurt:**
  - "onnxruntime-web WASM default: CDN fetch while Vite bundles an unused ~27 MB copy": runtime fetch from cdn.jsdelivr.net, unused 26,861 kB WASM emitted into `dist`.
  - "microsoft/wavlm-base-plus-sv has no machine-readable license": no license tag; license traced by hand to UniSpeech (CC BY-SA 3.0). Not legal advice.
  - "WavLM x-vector speaker ID: default threshold too high, single-thread WASM slow": 0.85 rejected a true clip (same-speaker 0.788 to 0.974, cross-speaker 0.245 to 0.409); about 7.4 s per clip single-threaded; first load about 102 MB. Caveat: evidence is two Windows TTS voices, not real people.
  - `Xenova/unispeech-sat-base-plus-sv` is not mapped to an x-vector model in 4.3.1 (HANDOFF section 7).
- **Suggestions:** document `wasmPaths` for Vite prominently; add a `license` field to the model card; give a realistic cosine range per speaker pair and the 102 MB first-load size; document that WASM threads need cross-origin isolation and that `credentialless` works with HF downloads.
- **Build again?** Yes, as an opt-in feature with the fallback. Actual thread use (`crossOriginIsolated`) in the app is **not confirmed** (HANDOFF section 10), and parallel Web Speech plus `getUserMedia` is **unverified** (HANDOFF section 9).

## Vite 8 (COOP/COEP, proxy, single-file widget)

- **Used for:** the web app dev server and build, the dev proxy for `/api` and `/mcp`, and `vite-plugin-singlefile` for the widget.
- **What worked:** widget build in about 1 s. COOP `same-origin` + COEP `credentialless` headers enabled threaded WASM, and the opaque-origin iframe still rendered.
- **What hurt:**
  - "Vite dev proxy + forced chunked framing": through the proxy, the empty 202 for `notifications/initialized` is truncated (curl exit 18), giving one `ERR_INCOMPLETE_CHUNKED_ENCODING` console line per page. Harmless; direct requests are fine.
  - The COOP/COEP headers are set only by Vite dev/preview, so production hosting must set them (VOICE_ID.md section 5a note; HANDOFF section 10).
  - Bundle sizes: widget 246 kB, web main chunk 665 kB, transformers chunk 543 kB (HANDOFF section 10).
  - Widget config awkwardness: see the ext-apps entry.
- **Suggestions:** the log's fix is on our side: skip `forceChunked` for empty-body 202 and send `Content-Length: 0`. No Vite-specific change is evidenced beyond documenting `wasmPaths`.
- **Build again?** Yes.

## cloudflared (quick tunnel)

- **Used for:** exposing `localhost:3001/mcp` for a remote check (MCP_HOSTS section 3).
- **What worked:** `tunnel --url` returned HTTP 200, `text/event-stream`, protocol `2025-11-25`; 401 without the bearer.
- **What hurt:** no friction entry for cloudflared itself. The only tunnel issue was the SDK's Host validation (see the MCP SDK section). Not tested with a real Alexa+ host or under sustained use (**unverified**).
- **Suggestions:** none evidenced.
- **Build again?** Yes.

## Avast Web Shield (`wsc_proxy`) loopback interference

Not a product we chose, but it cost the most time.

- "Avast Web Shield breaks every MCP client on loopback `/mcp`": responses on any path ending in `/mcp` with `Content-Length` are rewritten to `transfer-encoding: chunked` without chunk framing. Clients fail with `HPE_INVALID_CHUNK_SIZE` or hang on empty 202s. `/mcp/x` is unaffected. Workaround: `forceChunked` in `server/src/mcp/http.ts` (do not remove).
- "Avast loopback proxy intermittently freezes vitest workers doing `/mcp` HTTP for ~10 s": about 1 in 8 full runs; `Hook timed out in 10000ms`, `fetch failed`, `UND_ERR_SOCKET`. Workaround: re-run, or run serially (`--maxWorkers=1`, which passed per GEMINI.md).
- **Suggestions:** Avast should not proxy or reframe loopback HTTP, or make the `/mcp` filter opt-in. MCP SDK docs should list AV loopback proxies in troubleshooting with `HPE_INVALID_CHUNK_SIZE` as the symptom. One later MCP check saw no hang on `localhost` (MCP_HOSTS header), so the effect is intermittent.

## Other tooling friction

- "Headless Chrome `--window-size` is not the viewport size": about 95 px shorter viewport in new headless mode; padding the window to `1936,1175` gave 1920x1080. Suggestion: document it or add a `--viewport-size` flag.
