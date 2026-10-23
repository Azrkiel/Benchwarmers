# Backend completion and remaining evidence

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

C's `3abb214` adds integration tools and historical evidence from `bc00daa`, not acceptance of this newer backend. The current candidate must be rerun; C's original blocked findings are not automatically carried over as current failures. Post-integration results will be appended here after the exact candidate is checked. No provider purchase, real feed activation, deployment, push or PR is part of this work.
