# Backend completion and remaining evidence

> Combined-app follow-up: [A/B/C integration](ABC_INTEGRATION.md) supersedes the browser-runner and combined-candidate status recorded below. This file preserves the backend checkpoint and its original evidence.

October 23, 2026. Continues `1e96ec5` in the existing isolated `feature/basketball-backend` worktree. This record distinguishes tested implementation from real-provider, hardware and release acceptance. The user confirmed no licensed basketball data access and asked to finish all remaining backend work.

## Implemented in this wave

| Area | Implementation and observed local scope |
|---|---|
| Provider ingestion | Concrete NBA v8 read-only adapter with synthetic vendor-shaped tests, server-side keys, bounded HTTP/body handling, cancellation, polling/retry, safe source failure and durable cursor checkpoints. |
| Revisions and ordering | Append-only provider revision journal, duplicate/conflict/gap checks, projection replay, quarantined unsupported removals and closed-only final. |
| Accounting corrections | Opt-in complete target/pick history, corrected scoring and join baselines, compensating free-reward/commitment entries, corrected pregame result and season contribution replacement. Trusted internal final reconciliation is integrated with RoomStore's atomic persistence. |
| Timing/tracking | Conservative future wall-time resolver, precision/watermark/late-action void rules and explicit observation geometry/staleness. They do not enable unsafe live targets. |
| Calibration | Offline pregame-only training/later held-out evaluator, sample/minutes reports, bounded weights, affordability and new-version adoption gates. Synthetic inputs keep neutral effective weights. |
| Market references | Reviewed exact mapping, bounded read-only Polymarket adapter and synchronous timestamped cache. Fictional games always omit external percentages; price references never settle sports results. |
| Transactional storage | Opt-in SQLite room and provider stores, stale-write detection, database uniqueness, versioned outcome/season evidence, import/backup/restore interfaces and fail-closed validation. |
| Sessions and abuse | Opt-in secure cookie sessions, role/room/seat isolation, revalidation/expiry/revocation, Origin/CSRF checks, strict-session mode, bounded rate registries, room/seat/discovery caps and private-preview retention. |
| Observability | Bounded aggregate counters/gauges, generated correlation IDs and protected mutation metrics. No tokens, private balances, audio or provider keys are emitted as labels or payload logs. |

Supporting contracts and operational limits are in [live basketball](LIVE_BASKETBALL.md), [market references](MARKETS_BACKEND.md), [outcome corrections](OUTCOME_CORRECTIONS.md), [SQLite runtime](SQLITE_BACKEND.md) and [room security](ROOM_SECURITY.md).

The ordinary entry point retains free scripted play. Storage/session runtime choices are explicit; client JSON cannot enable later gameplay or live sources. There is no public correction mutation endpoint. Existing rooms without complete history are never retroactively assigned invented correction evidence.

## Evidence that cannot be manufactured locally

- Licensed provider access, permitted samples and a selected real matchup are absent. Vendor access/coverage, quotas, entitlement, timestamp occurrence semantics, measured delivery/broadcast lag and real-game lifecycle remain unverified. The fixture-tested transport is not an activated provider-backed room. Ongoing live-game room registration/presentation policy must be verified when that identity and access are selected; the implemented final correction boundary does not claim that ongoing lifecycle is finished.
- The implemented provider's timestamp precision is unknown. Live micro-predictions remain disabled; its heartbeat/TTL is not proof of safe action timing. A verified wall-time occurrence source/watermark is required before enabling longer live interaction windows.
- No actual historical calibration/tracking dataset was provided. Neutral positional weights and unknown continuous tracking remain the runtime truth.
- No real matched market was configured or recorded. External market acceptance/attribution still requires the actual sports identity and reviewed rules. Fictional reference fallback works now.
- Physical Echo/Alexa/microphone/speaker evidence and connected product/release acceptance belong to B/C. User-directed deployment, production account/session topology, retention objectives and measured wider-service load are not implied by a local implementation.

## Verification and C integration

Before integrating other workers: 88 server files / 985 tests and 74 web files / 570 tests passed; workspace type checking and production build passed. SQLite emits the bundled runtime's experimental warning; Vite retains the existing chunk-size warning. The default 64-seat cap was checked against the existing 35-seat compatibility test; no legacy test was weakened.

Integrated B's `ddfd304` and C's `d8680f6` branch tips through merge commits `4ad914a` and `c49c1c5`. C's tooling delivery is present as `a490a04` in that history. Historical reports remain evidence of their original source only. The combined backend implementation is `191c389`; `cc1468b` fixes the real-market presentation contract exposed by the merge, retaining independent team prices, source/method labels and computed staleness. No B/C implementation was manually changed.

The tested service candidate is `cc1468b9803bd35fe1965f650b0fed465b224f9b`, fingerprint `eaa904e1ce74e42770b627e56bcfd22e255427217e66f1ea10ca87ae8b5c0d3b`. Sanitized reports are preserved in [the integration evidence directory](qa/backend-integration-2026-10-23/). Subsequent documentation commits identify that tested candidate; they are not new release acceptance.

- Combined suites: 88 server files / 991 tests and 79 web files / 604 tests passed. The presentation regression additionally failed first, then all 26 market tests passed after the fix.
- Workspace type checking, production build, C's 12 tooling tests and both legacy scripted game play-throughs passed. Existing SQLite experimental and Vite chunk-size warnings remain.
- Final workspace checks use the committed lockfile after a successful `npm ci --offline --ignore-scripts --no-audit --no-fund`. Windows-locked remnants from the old installation were preserved under ignored `server/data/locked-dependencies-20261023`; neither manifest nor lockfile was rewritten. Playwright is installed; browser-runner results above are actual browser execution rather than a dependency-only failure.
- Basketball HTTP/MCP smoke and full service acceptance passed: authorization/privacy, lineups, pause/restart, durable receipts, lost-response retry, request conflict, lock cutoff and final season/restart equivalence.
- The final serial football service acceptance also passed all of those checks, including final season/restart. Earlier interrupted football reports are retained separately.
- C's stopped JSON backup/restore passed, including overwrite refusal and corruption rejection. Separate SQLite tests exercise import, receipt recovery, backup/restore, two-connection stale-write detection, correction history and rollback after an injected mid-write failure.
- One profiled 60-second, 32-client load run passed: 1,920 private reads, 128 real pick writes, zero errors, p95 121.23 ms against the 500 ms budget. Other ordinary runs timed out and are retained. A diagnostic probe recorded simultaneous 211–222 second event-loop gaps across three separate processes; this supports host suspension/scheduling as an explanation, but does not prove the cause of every failed run. Consistently repeatable sustained acceptance remains open; one passing run is not production capacity evidence.
- Browser acceptance failed at `host-ui`: the runner fills `#rm-room-name` before opening the landing page's “Host a party” panel. B's selectors include `hostOpen`, but C's runner never uses it. Later browser checks were unrun. This is a concrete B/C integration issue, not a passing browser gate.
- Manual correctness/security review covered staged save publication, stale-writer detection, append-only source revision integrity, retry idempotency, correction accounting, role isolation, cookie/CSRF/origin checks, public serialization, fixed HTTP origins/redirect rejection and response bounds. Cleanup reused existing sport reducers, scoring, settlement and transaction boundaries. No additional cleanup rewrite was needed. This is scoped review, not production authentication or penetration-test evidence.

No provider purchase, real feed activation, deployment, push or PR was performed. Full release acceptance remains open for the failed/unrun gates and external evidence listed above.
