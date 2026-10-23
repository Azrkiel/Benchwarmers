# Benchwarmers: submission draft

**Submission scope: main Alexa+ track only.**

Hackathon tool feedback and development obstacles: [friction log](../FRICTION_LOG.md).

Draft for owner review. Nothing has been submitted, uploaded or deployed by C. Use the exact recorded candidate and the current [acceptance evidence](qa/worker-c/FOLLOWUP.md) when filling submission fields.

## Project name and tagline

**Benchwarmers** — A shared game night: build a lineup, call the next play, and watch the standings together.

## What it does

The ordinary demo is a free scripted basketball or football watch party. A host creates a room from the homepage, friends join with its code, and each person saves a captain plus four flex players under the salary cap. Predictions open and close on the server's clock. The phone receives a durable acceptance receipt; the shared display shows scores, celebrations, the winner and season results. Room credentials, lineups, receipts and season state persist across restarts.

The compact smart-display simulator uses actual MCP Streamable HTTP through the same-origin server. It lists tools, sends `room_ask`, displays the trace and binds private requests to the browser's saved seat. Browser speech input/output is implemented; C's observed simulator acceptance uses typed input. Explicit actor selection is visible. The physical Alexa/Echo runtime is outside the selected simulation-only scope.

## How it is built

- Node >=22, TypeScript, Express, React and Vite; the tested runtime is recorded in each report.
- A 30-tool MCP surface: 11 household tools and 19 room tools, including room commands, commitment/call review and pregame operations. Read the live tools/list count for the recorded candidate. Historical Inspector screenshots show an older 22-tool build.
- A server-owned scripted game/lineup/prediction engine with durable request IDs, cutoff validation, scoring and season accounting. Models do not decide sports results.
- JSON is the compatibility default. The explicit SQLite profile provides transactional room storage, immutable acceptance evidence and consistent snapshots. C validates one API/timer process; it is not a distributed service claim.
- `AI_MODE=fallback` and `ASSISTANT_MODE=offline` run the demo without cloud credentials. Gemini integration is available, but real model-provider execution is not part of C's acceptance evidence.

## Testing instructions and credentials for judges

**No account, password, API key, paid subscription, or Echo device is required for the standard demo.** Use a recent desktop Chrome browser. This is a simulated Alexa+ experience backed by real MCP calls and fictional scripted games.

### Try the app

The documented hosted demo is https://benchwarmers.fly.dev. If it is unavailable, use the local instructions below. Hosted availability was not independently confirmed during this documentation update because the cloud environment blocked the outbound check.

1. Choose **Host a party**, select basketball or football, and create a room. Note the room code.
2. Join as a player in that browser and save one captain plus four flex athletes within the salary cap. To test another player, use a separate browser profile, private window, or device and enter the room code.
3. **Open the simulated smart display as part of the main test.** On the room's player page, expand **Host controls** and select **Open simulated smart display**. Open it in another tab in the same browser profile where you joined, so it retains access to your seat. You can also open `https://benchwarmers.fly.dev/display/room/YOUR_ROOM_CODE`, replacing `YOUR_ROOM_CODE` with the code from step 1. For local testing, use `http://localhost:3001/display/room/YOUR_ROOM_CODE`.
4. In the simulator, type **“what's the score?”** in **Ask the display** and select **Send**. Select **MCP calls** to inspect the actual `room_ask` call and response. Keep this display open throughout the game. Speech is optional: grant microphone permission if using it, or continue with typed input.
5. Return to the host's player tab, expand **Host controls**, and select **Start game**. Use up to 4× replay speed for a shorter test. You can also select **Open shared screen** for the larger game view.
6. Submit a prediction while its question window is open. To make a prediction through the simulator, select your own seat in its actor selector; guest mode supports public score and standings questions. Check that accepted picks, scores, and standings update across the room and display, then view the final and season results.

Room and participant credentials are created automatically and stored by the browser. Keep the host session open to retain its controls; no shared judge login is needed. Create a fresh room for each independent test.

### Run locally

Requires Node.js 22+ and npm. Clone the public repository and run from its root:

```sh
git clone https://github.com/Azrkiel/Benchwarmers.git
cd Benchwarmers
npm ci
npm run demo
```

Open `http://localhost:3001` in your browser and follow the same steps. Defaults use `AI_MODE=fallback` and `ASSISTANT_MODE=offline`; no `.env` file or Gemini key is needed. If your shell already sets these variables, select those defaults before starting. On CPU-only Linux, use `ONNXRUNTIME_NODE_INSTALL=skip npm ci` to omit optional GPU downloads if needed.

For optional direct **local** MCP Inspector testing, connect to `http://localhost:3001/mcp` using Streamable HTTP and `Authorization: Bearer dev-token-change-me` with the unmodified local defaults. A custom local `MCP_TOKEN` replaces that default. This is not a credential for the hosted service; the in-app simulator needs no manual bearer setup.

Optional automated checks: `npm test`, `npm run typecheck`, and `npm run qa:smoke`. The smoke command starts its own isolated server. Physical Alexa/Echo execution and real-person voice-ID accuracy are outside the verified test scope.

## Optional feature rehearsal

Points commitments, player-created calls and pregame picks remain off in ordinary startup. C's separate private rehearsal enables them using authored test probabilities, then exercises HTTP/MCP/typed-command confirmation, idempotent acceptance, settlement, restart and SQLite restore. The 25-point first-caller example returns 55 total under that fixture's declared `.5` probability. These are synthetic test terms, not measured sports forecasts or live market prices. All amounts are in-game points.

## Evidence to show

A first-final winner-card occlusion remains open for B, with a screenshot and reproduction in [C’s findings](qa/worker-c/INTEGRATION_FINDINGS.md). Automated acceptance does not close this recording-review issue.

Use the connected native room and simulated display from the same room code. Show a saved lineup, an accepted pick receipt, a real MCP trace, score/standings agreement, final results and a rehearsed restart. See [the recording script](DEMO_SCRIPT.md), [operation instructions](BASKETBALL_DEMO.md), and C's current sanitized JSON reports/screenshots. A fixture preview is layout evidence only. State any time compression in the video and preserve the full original capture.

C's extended gate checks app/tooling suites, types/builds, existing-game compatibility, the connected browser/receipt flow, actual SQLite backup/restore, the previous compatible build and two sustained 32-seat load runs. Read exact counts, source fingerprint and latency from the current reports rather than copying historical numbers into a new take.

## Current limits and next steps

There is no licensed live basketball/tracking feed in this candidate. Continuous ball tracking is a recorded NO-GO; scripted score and team possession remain the demo. No measured live-data lag, real matched market, calibrated historical forecast or physical microphone accuracy is claimed. Provider adapters and timing/normalization tests use synthetic inputs where stated.

Production deployment, HTTPS strict-session client acceptance, topology, retention/recovery objectives and real-provider permissions require their own profile and owner decisions. Local rehearsal rollback proves a previous compatible server can read a separate restored SQLite snapshot; it does not authorize an arbitrary down-migration or a production rollout.

The owner reviews hackathon eligibility, narrative, attribution, video and submission before publishing. There is no verified installed Alexa skill, Echo-hosted execution, or live provider game in C's evidence.
