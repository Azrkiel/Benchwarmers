# In-browser voice ID

## 1. What it does

Voice ID tells the assistant which household member is talking, so a request like "draft Big Mo" is attributed to the right person without the speaker saying their name. Each member enrolls three short sentences on the device. Later, each utterance is turned into a voice embedding and compared with the enrolled voices. If one member is a clear match, the result is a `SpeakerHint` (`{ memberName, confidence, source: 'voice-id' }`) that goes into `AssistantRequest.speaker`. Everything runs in the browser. Audio and embeddings never leave the device.

Where it lives:

- Page: `/voice-lab` (`VoiceLabPage`, routed in `web/src/App.tsx`). Enroll, test, and tune thresholds.
- Module: `web/src/voiceid/`.
- Public API: `web/src/voiceid/index.ts` exports `useVoiceId`, `useUtteranceCapture`, `EnrollPanel`, `VoiceLabPage`, the matching helpers (`DEFAULT_MATCH`, `identify`, `toSpeakerHint`, `cosine`, `centroid`), `createCapture`, `trimSilence`, `speechSeconds`, the embedder factories (`createWorkerEmbedder`, `createMfccEmbedder`, `getSharedEmbedder`), the profile helpers (`loadProfiles`, `saveProfiles`, `storageKey`), and everything in `types.ts` (`Backend`, `WAVLM_MODEL_ID`, `MFCC_MODEL_ID`, `SAMPLE_RATE`, `MIN_SPEECH_SECONDS`).

It is a convenience hint, not authentication. See section 7.

## 2. How it works

```
 mic
  |
  v
 createCapture()                         (main thread, audio.ts)
   getUserMedia({ audio: { channelCount: 1, echoCancellation: true,
                           noiseSuppression: true } })
   AudioContext + ScriptProcessorNode(4096) -> chunks
   stop(): concat -> downmix -> resample to 16 kHz -> trimSilence
  |
  |  Float32Array, 16 kHz mono, speech only
  v
 embedder (embedder.ts)  --postMessage-->  embed.worker.ts   (module Web Worker)
   |                                         |
   |                                         +-- WavLM x-vector (transformers.js, q8, WASM)
   |                                         |     512-d, L2-normalised
   |                                         +-- fallback: MFCC mean+std
   |                                               24-d, L2-normalised
   v
 match.ts  identify(): cosine vs each member's centroid, sorted best first
   accept iff best >= threshold AND (best - runnerUp) >= margin
  |
  v
 toSpeakerHint() -> { memberName, confidence, source: 'voice-id' }   or null
```

Capture details (`audio.ts`):

- `createCapture({ trim? })` returns `{ start, stop, recording, level$, dispose }`. `start()` opens the mic and an `AudioContext`. The script processor is connected through a zero-gain node to the destination so it keeps running without playing the mic back.
- `stop()` disconnects, stops the tracks, closes the context, concatenates the chunks, downmixes to mono (channel average), resamples to 16 kHz (`SAMPLE_RATE`; linear interpolation, with an averaging low-pass first when downsampling), then trims silence unless `trim: false`. Calling `stop()` when not recording resolves to an empty array.
- `trimSilence` uses 20 ms frames. A frame is voiced if its RMS in dBFS is at least `max(-45, loudestFrameDb - 35)`. The clip is cut from 100 ms before the first voiced frame to 100 ms after the last. An all-silent clip becomes empty.
- `level$` reports an RMS level in 0..1 for the UI meter.

Embedding (`embed.worker.ts`, `embedder.ts`, `protocol.ts`):

- The main thread talks to the worker with `ToWorker` (`load`, `embed`) and `FromWorker` (`progress`, `ready`, `embedding`, `error`) messages. Embedding buffers are transferred back to the main thread.
- `Embedder` has `load(onProgress)` (idempotent, concurrent calls share one promise), `embed(audio)`, `info`, and `dispose()`. `getSharedEmbedder()` is a module-level singleton so the model loads once per page.
- WavLM path: `AutoProcessor` + `AutoModelForXVector` from `@huggingface/transformers`, imported dynamically inside the worker only. The embedding is `embeddings.data` run through `l2normalize`.
- If the worker cannot be created, or errors, the embedder switches to `createMfccEmbedder()` on the main thread and records a `fallbackReason`.

Enrollment (`profiles.ts`, `useVoiceId.enroll`):

- Each member records the three `ENROLL_SENTENCES` from `EnrollPanel.tsx`. Each clip must have at least `MIN_SPEECH_SECONDS` = 1.5 s of speech after trimming, otherwise `enroll` rejects with `Error('clip too short')`.
- Every accepted clip adds one L2-normalised embedding to the member's `samples`. At most `MAX_SAMPLES` = 5 are kept, most recent last, so extra clips replace the oldest.
- `centroid` = the mean of the normalised samples, re-normalised (`match.centroid`).
- `identify` compares the utterance embedding with each member's centroid by cosine similarity. `confidence` is the best score clamped to [0, 1].

## 3. Model

| Item | Value |
| --- | --- |
| Model id | `Xenova/wavlm-base-plus-sv` (ONNX conversion of `microsoft/wavlm-base-plus-sv`) |
| Runtime | `@huggingface/transformers` 4.3.1 (transformers.js) |
| Options | `dtype: 'q8'`, `device: 'wasm'`, `env.allowLocalModels = false` |
| File used | `onnx/model_quantized.onnx`, 101,683,453 bytes (about 102 MB) |
| fp32 alternative | `onnx/model.onnx`, 402,471,430 bytes (not used) |
| Output | 512-d x-vector, L2-normalised by us |
| Where it runs | WASM backend inside a module Web Worker, off the main thread |

Network and caching:

- On the first load the worker downloads the model files from huggingface.co. The browser Cache API keeps them, so later visits do not download again.
- transformers.js fetches the ONNX Runtime WASM binary from `cdn.jsdelivr.net` by default (onnxruntime-web 1.31.0-dev at this version).
- The Vite build also emits a roughly 27 MB ONNX Runtime asset, `dist/assets/ort-wasm-simd-threaded.asyncify-*.wasm` (26,861 kB, gzip 6,763 kB). It is not used unless `env.backends.onnx.wasm.wasmPaths` is pointed at it. Pointing it there is a possible follow-up for fully offline hosting. Today the runtime still comes from the CDN.
- Chunking: the worker is `dist/assets/embed.worker-*.js` (about 4 kB). `transformers.web-*.js` (about 543 kB) is loaded only by the worker, so pages that never use voice ID do not pay for it.

### License

- `microsoft/wavlm-base-plus-sv` on Hugging Face has no license tag on its model card. The card points to the `microsoft/UniSpeech` repository for licensing. That repository's `LICENSE` is Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0).
- What that means for us: attribution is required when we present or redistribute the model, and derivatives of the weights must be shared under the same license. We do not modify or redistribute the weights. Our code does not bundle them; the user's browser downloads them directly from Hugging Face. Credit the model (Microsoft WavLM / UniSpeech, converted to ONNX by Xenova) wherever the feature is described. This is not legal advice. Check the license text before any commercial use or before hosting the weights ourselves.
- transformers.js: `node_modules/@huggingface/transformers/package.json` has `"license": "Apache-2.0"`.

## 4. Fallback: MFCC

The MFCC embedder (`mfcc.ts`, `MFCC_MODEL_ID = 'mfcc-v1'`) is pure TypeScript with no model download. It uses 25 ms frames with a 10 ms hop, pre-emphasis 0.97, a Hamming window, a 512-point FFT, 26 mel filters (20 Hz to 8 kHz), log energies, and a DCT to 13 coefficients with c0 dropped. The embedding is the mean and standard deviation of c1..c12 (24 dims), L2-normalised. Input shorter than one frame is zero-padded.

It is used when:

- the model fails to load (offline, huggingface.co or jsdelivr blocked, WASM unsupported, out of memory);
- `Worker` is undefined or construction throws;
- the URL has `?backend=mfcc` on `/voice-lab` (`forceFallback`, reported as `fallbackReason: 'forced fallback'`).

The page and hook expose `backend`, `modelId`, and `fallbackReason`, so the UI shows which one is active.

MFCC mean+std captures coarse spectral shape, not speaker identity. Expect clearly lower accuracy than WavLM, more false accepts between similar voices, and sensitivity to the microphone and room. It exists so the feature degrades instead of breaking. It has its own default thresholds (next section). Profiles are tagged with the backend and model id, so switching backend means re-enrolling.

## 5. Thresholds and calibration

Defaults from `DEFAULT_MATCH` in `match.ts`:

| Backend | threshold | margin |
| --- | --- | --- |
| `wavlm` | 0.70 | 0.05 |
| `mfcc` | 0.90 | 0.02 |

Accept rule: `best.score >= threshold` AND (there is no runner-up OR `best.score - runnerUp.score >= margin`). Otherwise `accepted` is false, with `reason` `'below-threshold'` or `'small-margin'`. Scores are cosine similarity against the member centroid.

Minimum speech: `MIN_SPEECH_SECONDS` = 1.5 s of speech after silence trimming. A shorter clip gives `tooShort: true` and no hint; `useUtteranceCapture().stop()` returns `null` for it.

The defaults are uncalibrated starting points. No real-voice calibration was done in this phase. Calibrate on the actual devices and people before relying on them.

How to calibrate in `/voice-lab`:

1. Pick the household and wait for the model to load (progress bar).
2. Enroll every member (3 sentences each).
3. Use the "Who's talking?" button to test each member several times, at the distance the device will be used, with the TV on if that is realistic.
4. Test at least one voice that is not enrolled.
5. If strangers are accepted, raise the threshold until they are rejected. If real members start getting rejected, the enrollment clips are probably poor; re-enroll in the same conditions as the tests.
6. If two members are confused, raise the margin.
7. The sliders (threshold 0.50 to 0.99, margin 0 to 0.20) re-judge the last result live, so you can replay one clip against different settings without re-recording.

Slider values are held in memory by `setMatchOptions`. They are not persisted. After tuning, put the chosen numbers into `DEFAULT_MATCH`. `useVoiceId` resets to the backend defaults only when the backend changes, not on a reload.

## 6. Storage and privacy

- Key: `bw.voiceid.<householdId>` in `localStorage` (`storageKey(householdId)`), for example `bw.voiceid.garcias`.
- Value: JSON `{ version: 1, profiles }`. Each `VoiceProfile` has `memberId`, `memberName`, `samples` (up to 5 normalised embeddings), `centroid`, `backend`, `modelId`, and `updatedAt` (ISO).
- No audio is stored. Only embeddings (vectors of 512 or 24 numbers).
- `loadProfiles` drops profiles whose `backend` or `modelId` differ from the active model, and entries that are malformed (non-finite numbers, mismatched dimensions, wrong version). That forces re-enrollment after a backend or model change.
- Storage errors (blocked storage, quota, bad JSON) are swallowed: `loadProfiles` returns `[]`, `saveProfiles` returns `false`. Voice ID then works for the session but forgets on reload.
- Nothing, neither audio nor embeddings, is sent to our server. The voiceid code makes no `fetch` calls of its own. The only network traffic is the one-time model download (huggingface.co) and the ONNX Runtime download (cdn.jsdelivr.net) done by transformers.js. The server only ever sees the resulting `SpeakerHint` (a name and a confidence) inside `AssistantRequest.speaker`.
- Clearing: the Clear buttons in `EnrollPanel` (per member; `useVoiceId.clear()` with no argument clears the whole household), or clearing the site's data in the browser. The model cache is separate (browser Cache API) and is also cleared with site data.
- Profiles live in one browser profile on one device. They are not shared between devices.

### 5a. Phase 7b tuning (measured)

Real-model run (`tools/voice-test.mjs`, Windows TTS David vs Zira, 3-clip centroid, headless Chrome):

| Quantity | Before 7b | After 7b |
| --- | --- | --- |
| WavLM default threshold | 0.85 (rejected a true clip) | 0.70 |
| Same-speaker scores | 0.788 to 0.974 | 0.804 to 0.970 (4 held-out clips, own centroid) |
| Cross-speaker scores | 0.245 to 0.409 | 0.414 to 0.701 (4 held-out clips, other centroid) |
| Embed time per clip | about 7.4 s | 0.9 to 1.3 s (perClipMs 907 and 1302 in two runs) |
| First model load | about 3 min (102 MB download) | 20 s once cached |
| MFCC (for reference) | same 0.978 to 0.987, cross 0.930 to 0.947 | unchanged (threshold 0.90) |

Held-out after-scores (own / other speaker centroid): david-3 0.853 / 0.414, david-4 0.804 / 0.701, zira-3 0.970 / 0.422, zira-4 0.958 / 0.446. All four rank their own speaker first and clear 0.70. david-4 scores 0.701 against the other speaker's centroid, so the margin rule (0.804 - 0.701 = 0.103 >= 0.05) is what separates it, not the threshold. Raise the threshold to 0.75 if impostors get accepted.

What changed:
- Each clip is silence-trimmed, then cropped to its loudest window of at most 3 s (`prepareForEmbedding` in `audio.ts`) before WavLM sees it. Enrollment and identify both go through the worker, so both are cropped. MFCC is not cropped. Shorter input is the main speed-up; the multi-threaded WASM setting is the other, and the two were not measured separately.
- The Vite dev and preview servers send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`, and the worker sets `env.backends.onnx.wasm.numThreads = min(4, hardwareConcurrency)`. `credentialless`, not `require-corp`, because HuggingFace model downloads carry no CORP header. The model still loaded and embedded under these headers.
- `identifyDetailed` returns `engine: 'wavlm' | 'mfcc' | 'mfcc-quick'` and `provisional: boolean`. While WavLM is still loading, enrolled members get an instant MFCC guess from a second set of "quick" MFCC profiles (localStorage key `bw.voiceid.<household>.mfcc`, written at every enrollment) with `provisional: true`. Members enrolled before 7b have no quick profile until they enroll again. Treat provisional hints as weaker: MFCC separates voices poorly.

COOP/COEP risk for the device page: the device page will embed an MCP App iframe, and the dev proxy serves `/api` and `/mcp`. With COEP `credentialless`, cross-origin subresources load without credentials, and cross-origin iframes must themselves be embeddable under the policy (they need a compatible COEP or CORP). A same-origin proxied iframe is fine; an iframe served from another origin (for example a tunnel hostname or a sandbox origin) may be blocked, and COOP `same-origin` severs `window.opener` for popups. Not tested with a real MCP App iframe. If the iframe breaks, drop the headers: voice ID then falls back to single-thread WASM (slower, about 7 s per clip before the crop). In production hosting the headers must be set by the host, not Vite.

## 7. Limits

- Similar voices (siblings, parent and child) score close together. Expect the margin rule to reject or confuse them.
- Background noise and TV audio on the couch degrade embeddings. Echo cancellation and noise suppression are requested from the browser, but they do not remove a loud game broadcast.
- Far-field microphones lower accuracy. Enroll at the distance the device is used.
- Short utterances carry less speaker information. Under 1.5 s of speech is rejected outright, and anything near that is less reliable.
- Colds, shouting, whispering, and other voice changes move the embedding away from the enrolled centroid.
- First-load download is about 102 MB plus the runtime. On a slow network that takes a long time, and until it finishes (or fails and falls back) voice ID is not ready.
- Low-end devices: inference is on the CPU through WASM. Expect noticeable latency per utterance on weak hardware.
- Not anti-spoofing. A recording or a similar voice can pass. Treat the hint as a convenience for attribution, never as authentication or authorization.
- Testing: automated tests use mocked embedders. Real-model inference is exercised only by the manual `tools/voice-test.mjs` run (TTS voices, not real people, see 5a).
- Not tested against a real Alexa device.

## 8. Mapping to Alexa+ in a real deployment

Alexa has its own voice recognition for household members ("voice profiles" on the device and account). In a real Alexa+ add-on, the platform, not the add-on, would be the natural place to identify the speaker, and it would pass the recognised person to the add-on or agent in whatever form the platform defines. The specific API or field names for that have not been verified, so this document does not name any.

Our contract is built so that swap does not touch the server: the assistant request carries `speaker?: SpeakerHint` with `source: 'voice-id'`. This browser module is one producer of that value. In a real deployment the platform's identification would replace it and fill the same shape, mapping the recognised profile to a household `memberName`. The server-side code that reads `AssistantRequest.speaker` stays the same. The `source` union also has `'screen'` for attribution from the on-screen user. The enrollment UI and the model download would not be needed in that case.

## 9. Phase-4 wiring guide (device page)

The device page (`web/src/device/DevicePage.tsx`) pairs Web Speech API recognition with voice ID. Import from the barrel with a path relative to `web/src/device`:

```tsx
import { useVoiceId, useUtteranceCapture, EnrollPanel } from '../voiceid';
import { api } from '../lib/api';

function DeviceVoice({ household, partyCode, history }: Props) {
  const voice = useVoiceId(household.id);        // loads the model on mount (autoLoad)
  const capture = useUtteranceCapture();         // push-to-talk clip capture

  async function onMicPress() {
    // Same user gesture: both mic grants happen here.
    await capture.start();
    recognition.start();
  }

  // On the final result (or recognition.onend):
  async function onFinal(text: string) {
    const clip = await capture.stop();           // null if nothing recorded or < 1.5 s of speech
    const hint = clip ? await voice.identify(clip) : null;
    const res = await api.assistant({
      text,
      household: household.id,
      partyCode,
      history,
      speaker: hint ?? undefined,
    });
    // ...render res
  }
}
```

`api.assistant(req: AssistantRequest)` in `web/src/lib/api.ts` POSTs the request to `/api/assistant`. `AssistantRequest` is `{ text, household, partyCode?, history?, speaker? }`.

Notes:

- If `hint` is null (too short, nobody enrolled, below threshold, or ambiguous), fall back to a name in the utterance ("I'm Maya, ...") or have the assistant ask "Who's this?". Do not guess.
- Embed `<EnrollPanel members={household.members} voice={voice} />` in a settings drawer. Pass the same `voice` object from `useVoiceId` so enrollment and identification share profiles.
- Call `capture.start()` on the same user gesture as `recognition.start()`. Browsers require a gesture for `getUserMedia` and `AudioContext`.
- Chrome lets `getUserMedia` and `SpeechRecognition` share the mic at the same time. Safari and Firefox are less predictable: Firefox has no `SpeechRecognition`, and Safari may prompt separately or mute one consumer while the other holds the mic. Test on each target browser. Where recognition cannot coexist with capture, skip voice ID and use the name fallback.
- Await `capture.stop()` before sending the request; it also releases the mic.
- `useVoiceId` uses the shared embedder, so the model loads once per page even if several components call the hook.
