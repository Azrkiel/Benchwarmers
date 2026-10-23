# P15.5: continuous-tracking decision

**Final decision for this candidate: NO-GO for continuous ball tracking.** The scripted demo continues with score and team possession. This is a completed scope decision, not a claim that a real provider was evaluated and failed.

C reviewed the integrated [backend evidence](../../BACKEND_COMPLETION.md), A's `normalizeTrackingPoint` boundary, and [B's device/tracking assessment](../worker-b/DEVICE_AND_TRACKING.md). A validates genuine observation geometry, timing and staleness with synthetic data. B renders bounded observations and explicitly distinguishes event locations. B finds no demonstrated fair-decision benefit from the currently available data. The user has no licensed continuous feed, so no measured delivery/broadcast lag, time-series coverage or real-game safe window is available. Synthetic observations and scripted event locations cannot establish those properties.

`npm run qa:tracking` now exits 0 with decision `NO-GO` and the supporting scope/limits. Passing that decision check does not enable tracking or certify the unavailable capability. The extended local release gate requires this recorded decision alongside the actual game/storage evidence. Physical Alexa remains excluded by the accepted simulator-only scope.

Reopen only after A supplies the licensed provider/schema, entity mapping, timestamps, gaps and p50/p95/p99 freshness measurements, and B demonstrates connected interaction benefit, stale-state treatment and a server-enforced fair cutoff. C must independently reproduce those measurements against agreed thresholds before changing the decision to GO. No credentials, private feed samples or invented performance numbers belong in this report.
