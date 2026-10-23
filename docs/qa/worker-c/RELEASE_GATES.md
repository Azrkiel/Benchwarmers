# Storage, load, release and rollback acceptance

**Integrated continuation:** [C follow-up](FOLLOWUP.md) and `qa:release:service` now exercise A's implemented SQLite repository and the opt-in feature fixture. The original future-work table below describes the earlier baseline; current pass/fail evidence is in the follow-up reports. Selected single-node backup/load/compatible rollback can close locally. Production topology, strict-session HTTPS clients, licensed feeds and recovery/retention objectives are separate future profiles.

## Current local rollback runbook

C owns the local gate and evidence. A failed receipt, settlement, restore or compatibility check stops candidate promotion; retain the last passing commit and report the failing case. The previous passing compatible candidate is `25ded6a5a72c7d422543c6dbd654f694fdd6ac83`, schema 1. Rehearse recovery from the corrected candidate with:

```sh
npm run qa:service -- --rollback-ref 25ded6a5a72c7d422543c6dbd654f694fdd6ac83
npm run qa:features -- --rollback-ref 25ded6a5a72c7d422543c6dbd654f694fdd6ac83
```

Both commands create private isolated databases, back up the completed game through `VACUUM INTO`, verify a checksum/header/integrity/schema, restore into absent destinations and start the archived previous server there. The feature run additionally compares each private bank and commitment receipt. Reports include the previous full commit and dependency-lock hash. The source database stays available and is never replaced. A failure retains the source, private backup and report for inspection; do not delete a database or break a lock to force recovery.

For an operator-owned incident, stop new writes, preserve the current database and its sidecars, and recover into a different secured directory using a verified backup and a separately installed compatible build. Compare receipts, final/season totals and private accounting before deciding which instance to expose. Never reopen a live database with an older incompatible build or return to stale JSON after SQLite writes. This rehearsal does not switch traffic. Production rollback trigger/owner, recovery objective and any traffic change require the deployment owner's separate runbook.

## Historical baseline gates

These gates do not authorize deployment, provider purchase, video publication or submission. C's scripts exercise isolated local processes and preserve other work.

| Gate | Available C tooling | Required evidence still outside this baseline |
| --- | --- | --- |
| P16.6 backup/restore | `qa:backup`: stopped JSON snapshot, checksums, restored server, seat/lineup/standings/season comparison, corrupt/overwrite rejection | A's wider-service storage adapter, completed-game ledger/receipt/season equivalence, consistency under writes, migrations, encrypted access/retention requirements and recovery objectives |
| P16.7 load | `qa:load`: 32 distinct seats, real lineups and picks, simultaneous 1 Hz private reads, zero-error check, read latency percentiles | Wider-service target topology/data size, agreed sustained duration and budgets, simultaneous transports, write/settlement latency, CPU/memory profile, restart/outage/recovery evidence |
| P16.8 release/rollback | `qa:release`: existing suites/builds/legacy game play-throughs and exact-candidate full service/browser/load/backup artifacts | Previous-version startup against restored data, incompatible migration behavior, rollback trigger/owner/steps, production resource/provider limits, unresolved domain/UI fixes returned to their owners |

The local load default is a **10-second smoke**, not production capacity. Runs under 60 seconds produce a distinct `load-smoke` kind and cannot satisfy the release gate. Use `--duration-ms 60000` or an agreed larger duration (up to 300000); default p95 read budget is 500 ms. The local candidate gate requires at least 60 seconds, 32 participants with real writes, zero errors and p95 <=500 ms; a relaxed `--budget-ms` does not silently relax that gate. These are explicit C demo criteria, not invented master-plan production thresholds. Report read/write counts, all-client participation, errors and percentiles with the candidate fingerprint. Current harness measures private HTTP reads plus real pick writes; it does not claim MCP/voice/database settlement throughput.

For a release candidate:

1. Record one accepted baseline and each worker's exact delivery commit. Preserve deployment edits. Merge small owned slices, retaining the last known-good integration commit.
2. Run all C commands for basketball against the same stable source. Keep football compatibility and the legacy basketball play-through. Avoid editing code while validation runs: source changes invalidate evidence.
3. Review failed checks by owner. A receives domain/storage/idempotency defects; B receives UI/voice/effects defects. Include command, source fingerprint, room, expected/observed behavior and sanitized evidence. Do not patch another worker's files solely to make a gate pass.
4. Run `qa:release` with the evidence directory. A full passing report is a local demo-candidate result only. A script's presence, partial smoke pass or another worker's screenshots cannot replace the required run.
5. For wider service, keep the release blocked until the unimplemented items in the table have measured results. Archive the previous code identifier, compatible private backup, checksum manifest, and concrete restore commands securely. Test restore into a different empty directory and start the previous version there before declaring rollback viable.

JSON backup helper API, usable after stopping the owned server:

```js
import { backup, restore } from './scripts/basketball/storage.mjs';
await backup('/absolute/c-owned-state', '/absolute/new-backup');
await restore('/absolute/new-backup', '/absolute/absent-data-directory');
```

Backups include credentials and private state. Keep them out of Git and public evidence. The helper verifies lengths, SHA-256 digests, expected filenames and JSON validity before creating the restore destination. Matching digests establish copy integrity, not database consistency or trust in an arbitrary external archive.
