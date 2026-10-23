# C: integrated acceptance and storage follow-up

Baseline: integrated main `14d8229` (full SHA in reports), following merge #31. C fast-forwarded the clean cloud checkout; Deployment files and other worker changes were preserved. A one-line domain correction and its regression test were applied with the owner’s explicit scope exception, as described below. This record supersedes the missing-basketball/receipt status in the first C delivery. The original 121-task master file is still absent; this updates the 16 C IDs supplied by the user without inventing other workers' acceptance criteria.

## Selected scope

- Ordinary demo: fictional basketball and football, JSON persistence, free predictions, native shared display and simulated smart display. No external feed is enabled.
- Durable rehearsal: one API/timer process, SQLite schema 1, legacy bearer transport. This is the topology A documents as supported. No horizontal scaling, production deployment, live credential or strict-session client compatibility claim is made.
- Optional features: C's private fixture enables points/calls/pregame/complete history with authored test probabilities. It uses the real room/MCP/assistant services, not a fake implementation. These flags remain off in ordinary startup.
- Device: simulation only, accepting B's recorded owner decision. Real Echo/Alexa access is excluded. Typed simulator commands prove MCP routing and actor binding, not speech recognition or acoustic output.
- Tracking: final NO-GO for continuous tracking because the implementation has only synthetic normalization/rendering evidence and no licensed measured feed. Scripted team possession remains usable.

## New gates

| Command | Evidence |
| --- | --- |
| `qa:browser` | Existing complete connected workflow plus actual `/display/room/:code` MCP tools/list and room_ask, guest vs saved-seat contexts, sanitized visible trace, zero simulator exceptions; desktop simulator capture and an explicit shared-display final/restart assertion |
| `qa:service` | SQLite game to final; receipts/season after restart; live consistent repository backup; checksummed/integrity-checked restore; corrupt/overwrite refusal; previous-build API rollback |
| `qa:features` | Pregame receipt; 25-point first-caller offer returns 55 total; HTTP/MCP retries; typed voice quote/explicit confirm; plain yes does not spend; voluntary call; actual settlement; bank/season restart; backup and previous-build restore including private bank/commitment receipts |
| `qa:load --storage sqlite` | 32 genuine seats, lineups and pick writes with private 1 Hz reads; strict zero-error/500 ms p95 gate; two distinct 60-second reports required |
| `qa:release:service` | App/tooling suites, types/builds, legacy games, exact-source JSON demo evidence, SQLite/feature/browser/repeated-load evidence, compatible restore and completed tracking decision |

The rollback target is previous passing candidate `25ded6a5a72c7d422543c6dbd654f694fdd6ac83`. C exports its tracked source into a private temporary directory, verifies the previous lockfile is identical, reuses the matching installed dependencies, and starts the previous server against a separate restored database. No current checkout is reset and no running store is overwritten. Comparisons retain all response fields except `serverNow`, which is a response clock; receipts, final game state, private accounting, lineups and season are compared. The accepted pregame/pick retry is replayed and must not duplicate accounting.

Backup acceptance establishes a completed fixture snapshot while the source process remains running. It does not claim a measured concurrent-write overlap, provider correction incident, disaster recovery objective, or arbitrary incompatible down-migration. The prior compatible build supports the same schema; returning to an old JSON file after SQLite accepts writes remains invalid.

## A/B handoff

Base commit: `14d82295c864af5682c403e3bbad6e458549484d`. Tested implementation fingerprint: `dc2faf5e00ad083c302a1b5ab05945f7118cd566f135bf9cfcae173fd9d72a96`. No public route/schema or client contract changes. No dependency request; the lockfile is unchanged. New root commands: `qa:service`, `qa:features`, `qa:release:service`. A can review the authorized `store.ts` timestamp correction and its regression; B receives the open final-frame presentation case. All helpers, reproducer, reports and commands are in the repository; no local Windows files are required.

## Evidence and status

The automated extended release gate passed all 10 checks: 991 server tests passed (1 existing skipped), 604 web tests and 22 tooling tests passed, with types/builds/legacy games and exact-source evidence accepted. All three 60-second 32-seat load runs had zero errors; JSON p95 was 69.1 ms and SQLite repeats 188.4 / 203.6 ms. Manual recording review remains held on B’s first-final occlusion.

Current sanitized reports and selected screenshots are under [integrated-2026-10-23](integrated-2026-10-23/). The report source fingerprint includes C's validation code. Reports are observations of their recorded candidate; after applying another change, rerun the gate rather than treating historical snapshots as fresh acceptance. No private databases, backups, browser state, raw audio or credentials are committed.

Observed checks and load metrics are summarized in [RESULTS.md](RESULTS.md). Original baseline reports remain available for comparison. Visual review corrected two C capture issues before final collection: the simulator now has a desktop viewport rather than inheriting the phone width, and final display capture now waits for the display's own final state. Current integration findings supersede the old absent-contract/request-ID findings; manual review also found the last-score animation obscuring the native basketball winner card on the first final frame. This remains B-owned and holds recording review; the readable top score strip and passing automated assertions do not close pixel occlusion. See the open case in [integration findings](INTEGRATION_FINDINGS.md).

## Authorized domain correction

The integrated feature gate found a real millisecond-boundary bug: a voluntary call and its accepted commitment used separate timestamp reads, violating persistence validation and returning HTTP 500. The owner authorized C to reuse `commitment.acceptedAt` as `playerCall.createdAt` and add an advancing-clock regression. See [the reproducible finding](INTEGRATION_FINDINGS.md). Pre-fix failures remain historical evidence; final gates run against the corrected source.

## Task closure

| C task | Current disposition |
| --- | --- |
| P00.1 | Cloud inventory/preservation complete; Windows dirty checkouts not mounted and were not touched |
| P00.2 | Common base recorded; integrated main includes the A/B/C delivery history; no reset or worker overwrite |
| P00.4 | Install/toolchain and integrated check evidence recorded |
| P00.5 | Football and legacy basketball compatibility retained and checked |
| P09.1–P09.2 | Isolated start/control/reset available; explicit room targeting preserves old seasons |
| P09.3–P09.4 | Connected and adverse workflows include durable response loss, IDs, locks, restart and simulator MCP |
| P09.5–P09.6 | Operation guide, truthful submission draft and recording script updated; recording/publication remain owner actions |
| P09.7 | Automated candidate gate executable with strict exact-source evidence; manual final-transition recording review held for B |
| P14.1 | Capability report recorded; physical device gate excluded by accepted simulation-only scope |
| P15.5 | NO-GO decision completed using integrated A/B evidence; no invented provider measurements |
| P16.6 | Selected SQLite backup/restore includes final receipts/season and gated bank/commitment state |
| P16.7 | Single-node 32-seat sustained evidence; no production capacity claim |
| P16.8 | Local gate and previous-compatible-build rollback; deployment and production policy remain outside this task |

Actual pass/fail outcomes in the JSON reports govern these selected-profile closures. A future production profile requires its own HTTPS/session clients, retention/recovery objectives, provider policy, topology and rollout/rollback approval; it is not implied by this local gate.
