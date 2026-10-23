# Worker B: device experience and tracking (P14, P15.3-P15.4)

Date: 2026-10-23.

## Decision: simulated device only (P14 scope change)

Owner decision (2026-10-23): no Alexa connection and no physical Echo device. The screens are the virtual, simulated experience. P14.2-P14.6 (physical display validation, Alexa developer access, classic skill evaluation, real-device proactive limits) are dropped rather than deferred. Worker C's P14.1 hardware inventory is moot for the same reason.

What replaces them:

- `/display/room/:code`: simulated smart display for a game room. Generic bezel (no third-party marks), presets Compact 960x480 (Show 5 target), Small 1280x800, Large 1920x1080, `?clean=1` for recording. The page title says "Simulated smart display".
- The room display inside it is the same native compact/medium/tv composition as `/room/:code/display`, not a scaled TV page.
- The talk bar (hold Space, Talk button, typed input, quick prompts) uses real MCP over Streamable HTTP through `/api/mcp-widget`: `tools/list` on open, then `tools/call room_ask` per request, all visible in the "MCP calls" panel. This is the simulated Alexa+ path the hackathon accepts. Browser speech recognition and synthesis stand in for a device microphone and speaker.
- Actor binding stays explicit: "Speaking as" is Guest (public questions) or this browser's own seat; the simulator never guesses a speaker. Host commands work only with the host credential this browser holds.
- Proactive speech: the screen speaks game announcements only while its page is open, sound is enabled by a person, and it holds the room's playback lease. Replies to a request are spoken on the screen that was asked.

Claims to avoid: no statement that anything runs on a real Echo or as an installed Alexa skill.

## Tracking (P15.3, P15.4)

- Prototype: `BasketballCourt` draws a ball only when the snapshot reports `tracking: 'ball'`. It glides only between genuine observations at most 1 s apart, fades after 3 s without a new observation and hides after 10 s, labeled "Ball position out of date". Event coordinates are drawn only as "Event location". Team possession tints the centre circle; which basket a team attacks is not in the data.
- Data reality: the scripted replay supplies team possession at question opportunities and no ball coordinates; no licensed feed with continuous ball data is available. The prototype is exercised only with synthetic observations in unit tests.
- Interaction benefit (P15.4): with the current data, tracking would not change a fair decision. Player-level or next-shot prompts need a pre-action close signal and windows of at least 8 s; a moving dot provides neither. Recommendation: keep score/team-possession presentation and the team-level templates; revisit only if A's provider evaluation finds timestamped time-series ball data. Worker C publishes the go/no-go (P15.5).
