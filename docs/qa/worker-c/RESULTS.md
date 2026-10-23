# C's observed results

## Integrated follow-up

The integrated main baseline is `14d8229`. See [the current C follow-up](FOLLOWUP.md) for selected scope, task closure and commands. The original pre-integration results below remain historical.

The new evidence covers JSON basketball/football compatibility, the saved-seat simulator MCP path, real SQLite final/receipt recovery, the opt-in points/calls/pregame fixture, and backup/restore plus previous compatible build `25ded6a5a72c7d422543c6dbd654f694fdd6ac83`. Ordinary startup remains free scripted play; feature pricing uses explicitly authored test inputs in a separate C entry point. Physical Alexa is excluded, and the continuous-tracking decision is NO-GO.

Final per-command outcomes, source identity and metrics are in `integrated-2026-10-23/`. Reports identify their tested source before the final documentation commit; a later candidate must be rerun. Neither Git publication nor passing this local gate deploys a service.

### Corrected-candidate observations

Source HEAD `14d82295c864af5682c403e3bbad6e458549484d`, implementation fingerprint `dc2faf5e00ad083c302a1b5ab05945f7118cd566f135bf9cfcae173fd9d72a96`. C's authorized timestamp correction and advancing-clock test are included. No dependency/lockfile or deployment configuration changes occurred.

| Check | Observed result |
| --- | --- |
| Full app suites | Server: 88 files, 991 passed and 1 existing skipped; web: 79 files, 604 passed |
| Type checks / assets | Server, widget and web types; widget and web production builds passed |
| C safety suite | 22 passed, including SQLite corruption/schema/overwrite, storage ownership and exact-source/storage evidence checks |
| Automated extended release | 10/10 passed, including both legacy game play-throughs and every required current JSON/SQLite artifact; deployment not performed; manual visual hold remains |
| Focused player-call tests | 2 files, 15 passed; deterministic advancing-clock reproducer passes after failing before the fix |
| Default JSON basketball | 11/11 service checks and 11/11 connected browser checks passed |
| SQLite service and browser | 16/16 service checks and 11/11 connected browser checks passed |
| Optional points/calls/pregame | 12/12 checks passed, including actual HTTP/MCP/typed confirmation, 25 -> 55 authored arithmetic, four settlements, private bank/receipt restart/restore |
| Compatible API rollback | Previous commit `25ded6a5a72c7d422543c6dbd654f694fdd6ac83` booted against separate restored schema-1 databases and preserved normal/feature state and accepted-input retries |
| Football connected browser | 11/11 passed with explicit sport selection and final/restart |
| JSON backup compatibility | 4/4 passed; corruption and overwrite refused |
| Hardware and tracking | Inventory recorded; simulation-only scope accepted; continuous-tracking NO-GO completed, without provider measurements |
| Manual visual review | Open B defect: last scoring animation obscures the native final winner card; recording review held. Top score strip remains readable. Screenshots and reproduction attached |

Each load run used 32 distinct seats for 60 seconds, with 1,920 private reads, 128 pick writes, at least 60 reads per client and **zero errors**. Default budget: p95 <=500 ms. These are single-node local rehearsals; they do not measure production capacity, write/settlement percentiles, MCP concurrency or a multi-process deployment. Load collection overlapped the separate football browser acceptance in the same cloud instance (see report timestamps), so these observations include other local activity.

| Storage / run | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| JSON | 36.8 | 69.1 | 84.5 |
| SQLite 1 | 93.8 | 188.4 | 217.0 |
| SQLite 2 | 95.7 | 203.6 | 231.0 |

The pre-fix HTTP 500 and dependent settlement failures are retained under `integrated-2026-10-23/regressions/`. They are not counted as passing evidence for the corrected candidate.

## Original pre-integration record


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
