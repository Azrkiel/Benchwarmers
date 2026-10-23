# Benchwarmers friction log

Developer experience and product feedback for the hackathon. Updated October 23, 2026.

Benchwarmers uses MCP tools and an MCP App to support a shared sports game night. This log records what made building, integrating, and demonstrating it difficult, what helped, and what tool maintainers could improve. The default demo uses fictional scripted games and runs without cloud credentials.

## Read this first

| Priority | Friction | Current status | Demo impact |
| --- | --- | --- | --- |
| Major | Final scoring animation obscures the winner card | Open in recorded QA; not rechecked here | Recheck the first final frame before recording |
| Major | Cloud installation tries to fetch optional ONNX GPU binaries | CPU-only setup verified | Use the supported install override below |
| Major | Windows HTTPS inspection and MCP loopback interference | Historical workarounds; machine-specific | Rehearse on the recording machine |
| Major | Cross-origin isolation conflicts with embedded video | Route-scoped workaround recorded | Recheck voice and video separately |
| Minor | Tool counts, setup guidance, and evidence are scattered | Partly addressed by this root-level log | Use current runtime evidence |
| Scope gap | Physical Alexa/Echo, real microphone accuracy, live Bedrock | Unverified, not demonstrated by mocks | Describe the device as simulated |

“Resolved” means the cited record reports a fix; it does not mean every platform was retested. Entries below distinguish observations from hypotheses and proposed improvements. Dates in the archive retain their original timezone-unspecified timestamps.

## F01 — Optional GPU download blocks a credential-free cloud install

- **Observed:** October 23, 2026; Linux cloud environment, Node 24.19.0, npm 11.9.0, `onnxruntime-node` 1.30.0.
- **Task and reproduction:** Run `npm ci` at the repository root. The ONNX postinstall attempts a NuGet download and fails with `getaddrinfo EAI_AGAIN api.nuget.org`.
- **Expected / actual:** Installing the browser-based demo should not require extra GPU binaries. An optional backend download instead fails the whole dependency installation. This response establishes a DNS/network failure, not an authentication failure.
- **Impact:** Major for first-time setup; no cloud credentials are needed for the selected app workflow.
- **Workaround and verification:** `ONNXRUNTIME_NODE_INSTALL=skip npm ci` uses the package's documented switch to skip binaries not bundled in npm. Installation, type checks, widget/web builds and the basketball service smoke check passed afterward. CPU binaries remain bundled; GPU execution and real model inference were not validated.
- **Suggestion:** Make GPU installation opt-in or provide a clearly documented CPU/browser-only installation path with a download-specific diagnostic. Preserve TLS and package-integrity verification.

## F02 — Final celebration can hide the result judges need to see

- **Observed:** October 23 integrated browser QA; this is application UX feedback, not an SDK defect.
- **Task and reproduction:** Build the candidate, run `npm run qa:browser -- --no-build`, and inspect the genuine first final frame on `/room/:code/display` at 1920×1080 before reloading.
- **Expected / actual:** The winner card should remain readable. Recorded QA shows the last “2 POINTS” animation and dimming layer covering it even though the final score strip is readable.
- **Impact / status:** Major for recording; open in the cited evidence. API and browser assertions passing did not detect pixel occlusion. No new visual verification is claimed here.
- **Next action:** Adjust celebration presentation in a separate UI change, then capture the first final frame again. A later clear frame does not verify the transition.
- **Evidence:** [Reproduction and candidate identity](docs/qa/worker-c/INTEGRATION_FINDINGS.md#open-for-b-final-scoring-animation-obscures-winner-card), [captured frame](docs/qa/worker-c/integrated-2026-10-23/screens/08-final-display.png).
- **Suggestion:** Add a visual acceptance check specifically for final-state readability while animations are active.

## F03 — HTTPS interception and model settings obscure live-provider failures

- **Observed:** October 20, Windows 11, Node 22.23.3, Gemini REST; historical live-provider record.
- **Expected / actual:** A small model request initially failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Using system CAs produced HTTP 200 for metadata; generation then rejected an unsupported thinking level with HTTP 400. A supported setting succeeded, taking about 22 seconds on the first successful call.
- **Impact:** Major; automatic offline fallback can make a provider failure look like successful live generation.
- **Workaround / status:** System-CA trust with TLS verification retained, model-specific thinking settings, and bounded provider deadlines were recorded as working. Not retested in this cloud setup.
- **Suggestion:** Link model-specific supported settings from onboarding docs, explain system-CA opt-in for inspected Windows networks, and clearly expose which provider or fallback produced a response.
- **Evidence:** [Original observations](docs/FRICTION_LOG.md), [Gemini setup](docs/GEMINI.md).

## F04 — Local HTTP security tooling interferes with MCP transport

- **Observed:** October 20–21, Avast Web Shield on Windows; MCP client 2.3.1, Node transport 2.1.1 and Express helper 2.0.2.
- **Expected / actual:** Ordinary loopback MCP calls encountered invalid chunk framing, empty-202 hangs, and intermittent roughly ten-second stalls. Historical diagnostics associated this with local HTTP interception. Separately, the Express helper's default Host validation complicated tunnel setup.
- **Impact:** Major on the affected Windows machine; no equivalent failure was observed in the current Linux service smoke check.
- **Workaround / status:** Explicit chunk framing and configurable Host checks were implemented. A historical Vite proxy notification truncation remained console noise. Test-worker limits reduced CPU contention; repeated timing failures still require diagnosis rather than an assumed pass.
- **Suggestion:** Document interception symptoms (`HPE_INVALID_CHUNK_SIZE`, socket closure, 202 hangs), proxy behavior and safe tunnel Host configuration together. Preserve DNS-rebinding protection when exposing a service.
- **Evidence:** [Transport observations and latency experiments](docs/FRICTION_LOG.md), [host setup](docs/MCP_HOSTS.md).

## F05 — MCP example hosts require extra integration work

- **Observed:** October 20, ext-apps basic-host 2.0.3 and MCP Inspector 2.11.0, Windows/Node 22.
- **Expected / actual:** The basic-host example lacked configurable bearer headers, hardcoded a sandbox port, required Bun to start, and had a missing type dependency. Inspector placed headers in Server Settings and its CLI error summary hid useful tool error text.
- **Impact:** Minor individually, but several setup detours before the widget could be shown.
- **Workaround / status:** Temporary example-host patches and a Node/tsx startup were recorded as working. The current app provides its own same-origin widget host; external MCP clients still require bearer authentication.
- **Suggestion:** Ship a Node-only quick start, configurable headers and sandbox ports, complete build dependencies, and readable `isError` CLI output.
- **Evidence:** [Detailed original steps](docs/FRICTION_LOG.md), [MCP host guide](docs/MCP_HOSTS.md).

## F06 — Browser voice inference adds download, performance and isolation costs

- **Observed:** October 20–22; Transformers.js 4.3.1, WavLM ONNX model and Vite 8.
- **Expected / actual:** Vite emitted a roughly 27 MB WASM file while runtime inference still fetched a CDN copy. Historical synthetic TTS checks found a commonly cited speaker threshold rejected a true speaker; single-thread embeddings took about 7.4 seconds per clip. Enabling WASM threads required isolation headers that also blocked the YouTube iframe.
- **Impact:** Major for combining voice and video; model loading and calibration also complicate a short demo.
- **Workaround / status:** Recorded mitigations include MFCC fallback, cropped clips, adjusted thresholds and route-scoped isolation that excludes `/watch`. Synthetic checks are not real-person accuracy evidence. Model license metadata required manual investigation; weights are not redistributed.
- **Suggestion:** Publish a Vite asset-path example, explicit first-load costs, model license metadata, representative calibration guidance and a route-scoped isolation recipe.
- **Evidence:** [Voice measurements and limitations](docs/VOICE_ID.md), [original observations](docs/FRICTION_LOG.md).

## F07 — Fragmented documentation makes the correct demo harder to find

- **Observed:** October 23 repository review.
- **Expected / actual:** A reader should find feedback and the current workflow from the README. The log was under `docs/`, without a prominent direct README link. Instructions mix legacy household and current room scenarios. README prose mentions both 30 tools and an older 22-tool Inspector expectation, and its test-count example is historical.
- **Impact:** Minor for development; significant risk of showing one scenario while quoting another scenario's evidence.
- **Change / status:** The main friction log now lives at the root and is linked from README, demo and submission documents. Original entries remain available as history. Conflicting historical counts elsewhere are not treated as current results.
- **Suggestion:** Keep one current quick start and link historical scenarios separately; obtain tool counts from `tools/list` and test totals from the current runner. Keep simulation and live-provider claims explicit.
- **Evidence:** [README](README.md), [recording guide](docs/DEMO_SCRIPT.md), [submission draft](docs/SUBMISSION.md).

## F08 — Automated checks leave hardware and visual gaps

- **Observed:** Existing QA and submission records; scope limitation rather than a reproduced platform bug.
- **Expected / actual:** Typed assistant turns, mocked model tests and headless checks exercise important behavior but do not establish physical Alexa/Echo execution, real microphone identification, live Bedrock access or readable animation frames.
- **Impact / status:** Unverified capabilities must remain out of demonstrated claims. Missing access to the optional Alexa Local Inspector package was historically an npm E404; that alone does not establish whether it is private or discontinued.
- **Next action:** Rehearse the exact recording machine and input mode. Request official access instructions if testing the optional inspector; validate hardware and live providers separately when available.
- **Suggestion:** Provide a public simulation-to-device checklist, clear inspector distribution instructions and sample evidence requirements for each execution mode.
- **Evidence:** [Submission limits](docs/SUBMISSION.md), [recording guidance](docs/DEMO_SCRIPT.md), [original inspector observation](docs/FRICTION_LOG.md).

## Historical fixes and further observations

The [dated archive](docs/FRICTION_LOG.md) retains the full reproduction details, including headless viewport sizing, widget typography, offline-router phrasing, stale Vite modules, transparent iframe composition, Python tooling, native TypeScript binary loss and ESPN import normalization. Those records describe their original machines and candidates; suspected antivirus quarantine is a hypothesis, not a confirmed cause. The old IPv4-binding fix is historical: current Vite configuration binds `0.0.0.0`.

For feedback grouped by tool, see [PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md). For recording order, use [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). This log is the feedback entry point, independent of either document.

## Add an entry

Use a stable ID and evidence; do not turn an untested concern into an observed failure.

```md
## FXX — Concrete problem
- Observed: date, platform, tool/version; or explicitly unverified.
- Task and reproduction: smallest useful command or interaction.
- Expected / actual: include the diagnostic without credentials.
- Impact / status: Blocker | Major | Minor; Open | Mitigated | Resolved | Unverified.
- Workaround and verification: what ran, what passed, what remains untested.
- Suggestion: actionable feedback for the relevant maintainer.
- Evidence: committed report, test, screenshot or documentation link.
```
