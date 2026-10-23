# Worker B: device runtime and tracking notes (P14.2-P14.6, P15.3-P15.4)

Date: 2026-10-23. Status: assessment only. Nothing here is a hardware or Alexa integration claim.

## Physical display (P14.2, P14.3) — not run

No Echo Show or other physical smart display was available in this session, so the compact browser display was not opened on hardware, and viewing distance, touch, sleep/wake, network loss and long sessions were not measured on a device. What exists instead:

- `/room/:code/display` has a dedicated compact layout (`?layout=compact`, default at 960x480). It was checked in desktop Chromium at 960x480 with no document scroll or clipped view content. That is layout QA, not device validation.
- The simulator `/display/:household?size=compact` offers a 960x480 preset labeled "Show 5 target" inside a page titled "Simulated smart display".

To validate later (Worker C records the device inventory, P14.1): open the deployed room display on the device's browser, play a full replay, and capture photos of the score, question, countdown and top three from couch distance. Change the compact composition before shrinking type.

## Alexa runtime (P14.4-P14.6) — gated

- The hackathon FAQ says self-hosted MCP servers cannot be connected to real Alexa+ devices or the developer console through the gated preview tools; a simulated web client is accepted. This account has no Alexa developer console access.
- The demo therefore uses real MCP calls (`initialize`, `tools/list`, `tools/call`, including `room_ask` and the room board resource) from browser hosts. Browser speech synthesis is not evidence of an installed skill.
- A classic ASK/APL skill was not prototyped. It is a different runtime with its own session, display and background-speech rules and would need its own decision; it is not a drop-in for the Alexa+ track.
- Proactive speech: the browser display only speaks while its page is open, sound is enabled by a person, and it holds the room playback lease. Whether a real Alexa runtime may announce unsolicited updates during a session is unverified. The phone and shared browser screen remain the fallback for every action.

## Tracking (P15.3, P15.4)

- Prototype: `BasketballCourt` draws a ball only when the snapshot reports `tracking: 'ball'`. It glides only between genuine observations at most 1 s apart, fades after 3 s without a new observation and hides after 10 s, labeled "Ball position out of date". Event coordinates are drawn only as "Event location". Team possession tints the centre circle; which basket a team attacks is not in the data, so no half-court is implied.
- Data reality: the scripted replay supplies team possession at question opportunities and no ball coordinates; no licensed feed with continuous ball data is available. The prototype has only been exercised with synthetic observations in unit tests.
- Interaction benefit (P15.4): with the current data, tracking would not change a fair decision. Player-level or next-shot prompts need a pre-action close signal and response windows of at least 8 s; a moving dot does not provide either. Recommendation: keep score/team-possession presentation and the existing team-level templates; revisit only if Worker A's provider evaluation (P15.1-P15.2) finds time-series ball data with timestamps that let calls close before the action. Worker C publishes the go/no-go (P15.5).
