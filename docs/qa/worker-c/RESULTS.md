# C's observed results

Executed in the isolated Linux cloud checkout on 2026-10-23, using Node 24.19.0, npm 11.9.0 and system Chromium 154.0.8037.57. Base commit: `bc00daa710df77d88c50f986d2661fbec78748ed`. The code fingerprint and timestamps in each report identify the exact tested revision, including C's then-uncommitted tooling. These are current-instance results; no new-task restoration, deployment or environment publication is claimed. Publishing the C Git branch does not publish a running service.

| Check | Observed result |
| --- | --- |
| Frozen install | 301 packages installed with optional CUDA download omitted through the package's supported switch |
| Server suite | 39 files; 743 passed, 1 skipped |
| Web suite | 59 files; 500 passed |
| Type checks | Server, widget, web passed |
| C tooling safety suite | 12 passed; corruption/overwrite/live-state checks, honest report status/redaction, stale/partial evidence rejection, controller-loss cleanup and concurrent evidence-file protection |
| Asset builds | Widget and web production builds passed |
| Legacy basketball and football | Both existing `play-party.ts` self-checks reached final and passed |
| Isolated demo controls | Start/pause/resume passed; two explicit reset operations created distinct seasons and preserved the original room/credential; direct SIGINT shutdown passed |
| Football service | Room/lineup, auth/privacy, actual MCP status, pause/restart, closed-question rejection and final/season restart passed; durable-receipt gate blocked and dependent ID/lost-response checks unrun |
| Connected football browser | Real host, two distinct phones, lineups, pick, typed response, reconnect/seat restoration, API-matched display scores at three sizes, final/restart and zero page exceptions passed; durable response-loss gate blocked on absent UI requestId |
| JSON backup/restore | Restored paused room, credentials, lineup, standings and season in a different server; corrupt backup and overwrite attempts rejected |
| 32-seat local load, 60 seconds | 1,920 private reads; 160 real pick writes; 60 reads per client; zero errors; p50 11.8 ms, p95 28.7 ms, p99 38.4 ms against a 500 ms read budget |
| Basketball room acceptance | Blocked: main lacks the additive basketball identity/creation contract; no football substitution counted |
| Hardware | Capability inventory recorded; no verified physical audio, Echo, camera or Alexa console |
| Tracking | NO-GO / prerequisite hold; no measured licensed observation feed or demonstrated fair interaction window |
| Release | Build/test/legacy checks passed; complete basketball service/browser/load/backup evidence missing, so release remains blocked |

Full football checks intentionally return exit 2 because they include future durable-receipt requirements. This is distinct from a failed existing-game test. The baseline browser smoke (without full receipt/final requirements) passed separately during development. No zero-test run or fixture preview is used as product evidence.

The initial browser runner had a selector mismatch and an early reload-readiness probe, both corrected in C's code. Manual screenshot review found the final-transition overlay issue recorded in [findings for B](INTEGRATION_FINDINGS.md). A TTY interruption in the cloud tool did not yield a completion report; the explicit SIGINT lifecycle check subsequently verified clean normal shutdown. Abrupt controller loss intentionally leaves a stale lock for operator inspection while the child guard stops the server.

Sanitized JSON snapshots are in `evidence/` when attached to this delivery. Private application data, credentials, backups, browser storage and server logs stay outside tracked evidence. Reports are historical observations, not inputs that bypass a new candidate's source/fingerprint checks. A/B must rerun the commands after applying their implementation and resolving the accepted contract/selector adapter.

Remaining gates: original Windows-workspace preservation, official 121-task mapping/master criteria, accepted A/B integration commits, basketball-specific end-to-end/receipts/voice/effects acceptance, actual device/provider evidence if retained in scope, and wider-service storage/load/rollback. C's task coverage and next checkpoints are in [the integration record](../../plans/2026-10-23-worker-c-integration.md).
