# Benchwarmers: hackathon friction log

Building a shared sports game night with MCP tools, an MCP App, and a simulated smart display.

**Main Alexa+ track. Recorded October 20–23, 2026.** This is the main feedback document. The [original dated notes](docs/FRICTION_LOG.md) preserve detailed diagnostics; [product feedback](docs/PRODUCT_FEEDBACK.md) covers the wider tool evaluation.

The MCP server, widget, and credential-free demo gave us a workable foundation. Most integration friction came from connecting that foundation to authenticated hosts, Windows networking, and browser voice inference. The entries below describe the versions we used, rather than claiming the same behavior in every release.

## Feedback at a glance

| Tool or area | What slowed us down | Outcome | Most useful improvement |
| --- | --- | --- | --- |
| MCP Apps / ext-apps 2.0.3 | Example host needed auth, port, and startup changes | Worked with local adaptations | A complete authenticated Node quick start |
| MCP Inspector 2.11.0 | Header setup and tool-error details were hard to discover | UI and CLI flows verified | Show headers at connection setup and readable CLI errors |
| MCP SDK + Windows networking | Loopback interception broke framing and stalled calls | Mitigated on the affected machine | A diagnostic guide for local proxies and Host checks |
| Alexa+ Local Inspector | Public npm lookup returned E404 | Used other MCP hosts; device integration unverified | Explicit distribution and access instructions |
| Gemini + Node TLS | Certificate trust and model settings caused separate failures | Live generation recorded after corrections | Model-specific setup and visible fallback diagnostics |
| Transformers.js / ONNX | Large downloads, calibration, and optional GPU installation | Browser fallback and CPU setup available | Clear browser-only setup and asset guidance |
| Vite + embedded video | Voice isolation headers blocked the video iframe | Route-scoped headers recorded as working | A documented voice-and-video integration recipe |

## Tool and platform friction

### F05 — Getting an authenticated MCP App into the example host

**Context:** ext-apps `basic-host` 2.0.3 on Windows with Node 22. We wanted to render our widget against a bearer-protected MCP endpoint.

**Friction:** The example had no configurable Authorization header, a hardcoded sandbox port, a Bun-based start command, and a build missing `@types/cors`. Each issue was small, but together they turned an example run into an integration task.

**What we did:** Adapted a temporary example checkout to supply transport headers and configurable ports, then built with Vite and served with `tsx`. The widget rendered at roughly 800 and 1280 px. Our app later provided its own same-origin host.

**Feedback:** Ship one authenticated example that installs, builds, and starts with Node alone. Expose server headers and both host ports as configuration.

**Evidence:** [Host commands, screenshots, and observed results](docs/MCP_HOSTS.md#2-ext-apps-basic-host-tag-v203-matches-our-modelcontextprotocolext-apps-203).

### F09 — Inspector works, but important controls and errors are easy to miss

**Context:** MCP Inspector 2.11.0, used for real tool calls through Streamable HTTP.

**Friction:** Custom headers lived in Server Settings rather than the connection dialog. Tools loaded automatically, which differed from instructions expecting a “List Tools” button. On tool errors, the CLI's stderr summary was `tool_is_error`; the useful content was in stdout JSON. Repeated `npx` startup took about 2.5 seconds per call, enough to interfere with short replay windows.

**What we did:** Set headers in Server Settings, inspected the result JSON, and invoked the installed CLI directly for repeated calls. Setup, draft, pick, leaderboard, and season flows were exercised.

**Feedback:** Put authentication alongside the server URL, print tool error text clearly, and document a persistent or direct-invocation workflow for time-sensitive testing.

**Evidence:** [Inspector reproduction and tool-call trace](docs/MCP_HOSTS.md#1-mcp-inspector-2110).

### F04 — A local security proxy made healthy MCP code look broken

**Context:** Windows, Avast Web Shield, MCP client 2.3.1 and Node transport 2.1.1.

**Friction:** Historical diagnostics found responses on paths ending in `/mcp` were reframed incorrectly by local HTTP interception. Symptoms included `HPE_INVALID_CHUNK_SIZE`, empty-202 hangs, socket closures, and intermittent stalls of roughly ten seconds. Parallel test load also caused separate latency-budget failures.

**What we did:** Added explicit chunk framing, investigated direct versus proxied requests, and capped test workers. These mitigations are machine-specific. The Linux onboarding service smoke check passed without the Windows interception symptoms.

**Feedback:** Add a troubleshooting decision tree covering direct requests, dev proxies, local security interception, empty notifications, and CPU contention. A timeout should lead to diagnosis rather than an automatic retry-until-green recommendation.

**Evidence:** [Original framing, stall, and worker-limit experiments](docs/FRICTION_LOG.md), [transport implementation](server/src/mcp/http.ts).

### F10 — Alexa+ inspector access was unclear

**Context:** October 20 lookup of `@alexa-ai/addon-local-inspector`.

**Friction:** `npm view @alexa-ai/addon-local-inspector version` returned E404 from the public npm registry. We could not determine from that response whether a private registry, preview access, or a different installation route was required.

**What we did:** Used MCP Inspector, ext-apps basic-host, and our simulated device page. Those checks validate MCP behavior; they do not establish execution on an Alexa/Echo device.

**Feedback:** Publish the package location, access prerequisites, supported Node version, and a fallback path directly in Getting Started.

**Status:** Access unresolved in the recorded work. [Original lookup](docs/FRICTION_LOG.md).

### F03 — Live model setup failed in two different layers

**Context:** Windows 11, Node 22.23.3, Gemini REST generation.

**Friction:** Requests first failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. After system-CA trust restored connectivity, generation returned HTTP 400 for an unsupported thinking setting. Automatic offline fallback could obscure the distinction between a working app and a working live provider. The first successful generation took about 22 seconds.

**What we did:** Loaded system CAs while retaining TLS verification, used the model's supported setting, and applied bounded deadlines and failover. Live generation succeeded in the recorded Windows session; it was not rerun during Linux onboarding.

**Feedback:** Link the supported settings for each model, document system-CA configuration for inspected networks, and make provider/fallback status visible in diagnostics.

**Evidence:** [Gemini setup and provider behavior](docs/GEMINI.md), [dated failure and correction](docs/FRICTION_LOG.md).

### F01 — An optional GPU download stopped the browser app's installation

**Context:** October 23 cloud setup; Linux, Node 24.19.0, npm 11.9.0, `onnxruntime-node` 1.30.0.

**Friction:** `npm ci` failed during ONNX postinstall with `getaddrinfo EAI_AGAIN api.nuget.org` while fetching extra GPU binaries. The selected workflow used browser inference and did not require those binaries.

**What we did:** Used the package-supported `ONNXRUNTIME_NODE_INSTALL=skip npm ci` option. Installation succeeded, the bundled CPU binding loaded, and tests, type checks, widget/web builds, and the basketball service smoke check passed. Package-integrity and TLS verification remained enabled.

**Feedback:** Make optional GPU installation explicit, document a browser/CPU installation path, and identify the optional download in the failure message.

**Status:** Mitigated for the selected workflow; GPU execution was not tested. The switch skips extra binaries, not the package's bundled CPU runtime. See [dependency declaration and lockfile](package-lock.json).

### F06 — Browser voice ID needed more than loading a model

**Context:** Transformers.js 4.3.1, WavLM ONNX embeddings, browser WASM worker.

**Friction:** The quantized model required about 102 MB on first load. Vite emitted a roughly 27 MB WASM asset while runtime inference still fetched a CDN copy. A commonly cited 0.85 matching threshold rejected a true-speaker synthetic clip, and single-thread embeddings took about 7.4 seconds per clip. The model card also lacked machine-readable license metadata.

**What we did:** Added MFCC fallback, cropped inputs, adjusted matching thresholds, and enabled threaded WASM where isolation allowed it. Recorded synthetic checks reached roughly 0.9–1.3 seconds per clip. These measurements used two TTS voices and do not establish real-person accuracy. Model weights are downloaded at runtime, not redistributed with the app.

**Feedback:** Provide a Vite asset-path example, first-load size estimates, calibration guidance with realistic limitations, and explicit license metadata on the model card.

**Evidence:** [Model, downloads, measurements, and limitations](docs/VOICE_ID.md).

### F11 — Voice isolation and embedded video needed different page policies

**Context:** Vite 8.3.4, browser WASM threads, and the `/watch` YouTube iframe.

**Friction:** Cross-origin isolation enabled voice processing but blocked the video iframe with `ERR_BLOCKED_BY_RESPONSE`. The external embed did not supply the required isolation opt-in. MCP widget sandbox composition added another integration concern; the historical notes distinguish the observed single-frame behavior from assumptions about the example proxy.

**What we did:** Applied isolation headers by route, excluding `/watch` while retaining them for voice pages. Recorded browser checks confirmed video rendering and isolation on the relevant voice routes. The custom demo widget host is not evidence of compliance in every external host.

**Feedback:** Document a combined voice, sandboxed widget, and third-party video example, including the headers each document must supply and the tradeoffs when isolation cannot be used.

**Evidence:** [Dated browser observations](docs/FRICTION_LOG.md), [current Vite middleware](web/vite.config.ts).

### F12 — Real-game import required defensive normalization

**Context:** ESPN's unofficial public college-football API, recorded October 22 import work.

**Friction:** Timeout plays carried stale scores; overtime clocks all read `0:00`; field position used an absolute coordinate; scoring plays could include the conversion; and roster names differed from play text. A successful HTTP response did not imply a consistent replay schema.

**What we did:** Normalized these cases in the converter and used a synthetic fixture for repeatable tests. The fictional, committed demo remains independent of this optional importer.

**Feedback:** An official, versioned schema with scoring, field-position, overtime, and identity semantics would remove substantial guesswork. Until then, keep the adapter isolated and document its limitations.

**Evidence:** [Converter](server/src/live/convert.ts), [synthetic fixture](server/test/fixtures/espn-synthetic.json), [original observations](docs/FRICTION_LOG.md).

## Friction in our own project

### F02 — Passing behavior tests did not guarantee a readable final screen

Recorded October 23 browser QA captured the last scoring animation and dimming layer obscuring the winner card on `/room/:code/display`. The final score strip and API comparisons passed, so those assertions missed the visual problem.

**Status:** Open in the cited candidate's evidence; no new visual pass is claimed by this documentation update. The next check is the genuine first final frame at 1920×1080 after a presentation fix. Inspecting a later clear frame would miss the original problem.

**Lesson:** Add visual acceptance for key transitions, especially the result viewers need to read.

### F07 — Documentation made the current workflow harder to identify

Legacy household instructions, newer room flows, old tool counts, and historical test totals appeared across several documents. The friction log itself was buried under `docs/` without a prominent README link.

**What changed:** This root-level document is linked from the README. The original dated notes remain intact as an archive. Historical counts elsewhere still need to be read in their original context.

**Lesson:** Keep a clear current entry point, label older scenarios, and quote tool/test counts from the candidate actually being demonstrated. [Quick start](README.md#quick-start).

## F08 — What we can demonstrate, and what still needs testing

The recorded work demonstrates MCP calls, widget rendering in tested hosts, scripted gameplay, and credential-free local operation. Linux onboarding recorded 991 passing server tests with one skipped, 607 passing web tests, successful type checks and builds, and a passing basketball service smoke check. These are October 23 results, not a promise about later candidates.

Physical Alexa/Echo execution and real-person microphone accuracy remain unverified in this evidence. Typed simulator turns, synthetic voices, and mocked provider tests should be described by their actual input and execution mode. The final-screen visual issue above remains a separate recording check.

See [testing instructions](docs/TESTING.md) for the demonstrated workflow.

## Adding future feedback

Record the date, tool/version, attempted task, expected and observed behavior, impact, workaround, result, and an actionable improvement. Link a diagnostic, test, or screenshot when available. Keep credentials out of examples and label hypotheses and untested concerns explicitly.
