# Benchwarmers: submission draft

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
- `AI_MODE=fallback` and `ASSISTANT_MODE=offline` run the demo without cloud credentials. Gemini/Bedrock integrations exist but real model-provider execution is not part of C's acceptance evidence.

## Optional feature rehearsal

Points commitments, player-created calls and pregame picks remain off in ordinary startup. C's separate private rehearsal enables them using authored test probabilities, then exercises HTTP/MCP/typed-command confirmation, idempotent acceptance, settlement, restart and SQLite restore. The 25-point first-caller example returns 55 total under that fixture's declared `.5` probability. These are synthetic test terms, not measured sports forecasts or live market prices. All amounts are in-game points.

## Evidence to show

The first-final winner-card occlusion from [C’s findings](qa/worker-c/INTEGRATION_FINDINGS.md) is fixed: the final now replaces any scoring animation still playing, so no hoop or dim layer covers the winner card ([first final frame, 1920×1080](qa/worker-b/first-final-1920.png)). Recheck the first final frame in the recorded take.

Use the connected native room and simulated display from the same room code. Show a saved lineup, an accepted pick receipt, a real MCP trace, score/standings agreement, final results and a rehearsed restart. See [the recording script](DEMO_SCRIPT.md), [operation instructions](BASKETBALL_DEMO.md), and C's current sanitized JSON reports/screenshots. A fixture preview is layout evidence only. State any time compression in the video and preserve the full original capture.

C's extended gate checks app/tooling suites, types/builds, existing-game compatibility, the connected browser/receipt flow, actual SQLite backup/restore, the previous compatible build and two sustained 32-seat load runs. Read exact counts, source fingerprint and latency from the current reports rather than copying historical numbers into a new take.

## Current limits and next steps

There is no licensed live basketball/tracking feed in this candidate. Continuous ball tracking is a recorded NO-GO; scripted score and team possession remain the demo. No measured live-data lag, real matched market, calibrated historical forecast or physical microphone accuracy is claimed. Provider adapters and timing/normalization tests use synthetic inputs where stated.

Production deployment, HTTPS strict-session client acceptance, topology, retention/recovery objectives and real-provider permissions require their own profile and owner decisions. Local rehearsal rollback proves a previous compatible server can read a separate restored SQLite snapshot; it does not authorize an arbitrary down-migration or a production rollout.

The owner reviews hackathon eligibility, narrative, attribution, video and submission before publishing. There is no verified installed Alexa skill, Echo-hosted execution, live Bedrock call or live provider game in C's evidence.
