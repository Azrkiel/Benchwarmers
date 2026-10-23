# Live basketball access and implementation boundary

Checked October 23, 2026. The user confirmed **no licensed basketball provider access yet**. No account, subscription, credential or paid request was created. Live basketball remains disabled; ordinary rooms still run the fictional scripted adapter. The existing ESPN football importer was not repurposed for live basketball.

## Candidate evaluation

Sportradar remains a candidate for a later licensed adapter. Its official [NBA play-by-play reference](https://developer.sportradar.com/basketball/reference/nba-play-by-play) documents game/team/player identity, team-possession/event data, game status, coverage and entry mode. It lists a three-second cache TTL while in progress; that is not a measured end-to-end latency guarantee or proof of a safe next-shot response window. League/product coverage, timestamp precision, correction behavior, quotas, retention and redistribution rights must be verified for the selected account and matchup.

The official [NBA push-events reference](https://developer.sportradar.com/basketball/reference/nba-push-events) documents authenticated event streaming and session resume within ten minutes of the last message. A future implementation must verify reconnect/resume and authoritative snapshot reconciliation using licensed samples. Continuous ball/player possession and pre-action suspension timing are not established by the current work. Source data access does not establish broadcast-video rights.

No real-game identity or permitted sample is available in this delivery. Therefore provider-specific HTTP parsing, polling/streaming, correction coverage, operational rate limits and redistribution approval remain unverified. No purchased provider or market adapter has been selected for the fictional Harbor/Summit demo.

## Implemented offline foundation

`server/src/live/basketball/provider.ts` defines discovery, initial snapshot, polling/cursor and cancellation contracts. Capabilities distinguish team possession, player possession, continuous ball observations, timestamp precision and verified pre-action suspension. It contains no concrete network adapter, runtime registration or scheduler.

`normalize.ts` validates an **internal transport envelope**, not a vendor wire payload. Future transport adapters must parse their actual vendor payload, supply server `receivedAt`, and map explicit provider game/team/player IDs before calling it. The normalized result retains provider/event identity and revision. Unknown IDs, invalid scoring credits, unsupported fields and game/provider mismatches reject input. A scorer is never relabeled as current ball possession. Event revision/sequence validation here does not provide deduplication, cursor persistence, ordering repair or correction reconciliation.

`freshness.ts` evaluates a source heartbeat, not the interval since the last basket. Proposed defaults are delayed at three seconds and stale at ten seconds. Missing/future/invalid heartbeat times, unsupported input, a known gap or an unreconciled reconnect immediately return unavailable. These are tested policy defaults, not calibrated provider measurements. Every result keeps `microPredictionsEnabled:false`; a healthy heartbeat alone cannot enable next-action calls.

`server/test/live/basketball-boundary.test.ts` uses explicitly synthetic event envelopes. They demonstrate internal validation/mapping/freshness behavior only. No captured live feed, real latency, licensed coverage, streaming recovery or provider correction integration is claimed.

## Remaining gates

1. Select an actual matchup, provider product and permitted access; verify coverage and data-use terms.
2. Implement vendor parsing and a background runner with bounded retry/rate limits, cancellation and durable cursor resume. User reads must remain cached.
3. Reconcile snapshots and ordered event revisions before declaring a source healthy; add append-only accounting corrections and replace season contributions by result version.
4. Implement official pregame cutoff/postponement/abandonment policy in the live room lifecycle. The current scripted pregame cutoff is explicitly host start.
5. Measure timestamp uncertainty, occurrence-to-receive lag and presentation offset. Start with future wall-time interval predictions whose acceptance closes before the outcome interval. Keep micro-predictions disabled without pre-action evidence.
6. Verify operational limits, authorized historical calibration, backup/restore and the chosen deployment. JSON room storage remains single-process.
