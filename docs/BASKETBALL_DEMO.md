# Basketball integration rehearsal

The integrated application now passes the basketball contract. For C's latest selected-profile gates and results, use [the integrated follow-up](qa/worker-c/FOLLOWUP.md). Earlier baseline blockers in historical reports are superseded by that record.

### Durable single-node rehearsal

```sh
npm run qa:service -- --no-build
npm run qa:features -- --no-build
npm run qa:browser -- --storage sqlite --no-build
npm run qa:load -- --storage sqlite --duration-ms 60000 --no-build
```

The service gate runs real SQLite HTTP/MCP acceptance through final/restart, takes a live `VACUUM INTO` snapshot using A's repository API, restores to a different database, verifies receipts/season/private state and accepted retry idempotency, rejects corruption/overwrites, and starts the previous compatible build against another restored copy. Default rollback reference: `25ded6a5a72c7d422543c6dbd654f694fdd6ac83`. A custom `--rollback-ref` must be an ancestor commit SHA with an identical lockfile; otherwise install that build separately rather than reusing dependencies. Git and `tar` are needed for source export; no worktree, reset, migration downgrade or deployment is performed.

`qa:features` uses a C-only server entry point with explicitly authored `.5` test probabilities and trusted flags for commitments, calls, pregame and complete history. It tests HTTP/MCP/typed-router acceptance, the first-caller 25 -> 55 total-return arithmetic, no spend on quote or plain “yes”, repeated IDs, privacy, real final settlement and restart, then backs up/restores/rolls back that points fixture as above. This is synthetic pricing evidence, not a live forecast, and not browser/microphone proof. The ordinary application entry point remains unchanged and its feature flags remain off.

These commands require a runtime with `node:sqlite` (the integrated backend documents Node 22.23.3; C uses Node 24.19.0). The SQLite experimental warning remains. `--storage sqlite` always points to C's private state directory, never an inherited deployment database. Use a fresh `--state-dir` when switching storage; an owned JSON state cannot silently become SQLite. Include matching storage and state flags on demo control/reset commands.

To close the extended local gate, collect the normal JSON accept/browser/backup/load reports plus SQLite service/features/browser reports and **two distinct** 60-second SQLite loads, and run:

```sh
npm run qa:tracking -- --out path/to/evidence/tracking.json
npm run qa:release:service -- --evidence-dir path/to/evidence
```

All evidence must identify the same source HEAD/fingerprint and selected game/storage. JSON reports cannot satisfy SQLite evidence. The tracking command now records the completed NO-GO decision for continuous tracking using A/B's integrated evidence; a NO-GO decision is not a failed scripted demo. The extended gate covers a local single-node bearer-auth rehearsal, not distributed capacity, strict-session HTTPS client deployment, real sports data, or production rollout.

Worker C's tooling runs the real service in separate data directories. It does not implement basketball, replace A's game rules, or substitute a fixture for a connected product. See [C's handoff](qa/worker-c/README.md) for current results and blockers.

## Install and run

Requires Node >=22 and npm. From the repository root:

```sh
npm ci
npm run demo:basketball
```

On a CPU-only Linux machine, ONNX Runtime's supported `ONNXRUNTIME_NODE_INSTALL=skip` option omits optional CUDA/TensorRT downloads. It does not disable integrity checks. Bash: `ONNXRUNTIME_NODE_INSTALL=skip npm ci`. PowerShell: `$env:ONNXRUNTIME_NODE_INSTALL='skip'; npm ci`. GPU inference is outside this setup.

The command builds the widget and web app, starts one Express process on port 3037, and creates a room with `gameId=harbor-vs-summit` in a fresh season. The response must positively identify basketball. An older server that ignores `gameId` and creates football is reported as blocked (exit 2), and the owned process is stopped. No application patch is applied to conceal this gap.

Default data lives in ignored `server/data/c-integration/data/`; host credentials are saved separately with restrictive permissions in that state directory and never printed. Keep this directory private. On Windows, secure the directory with your user account's filesystem ACLs. A running process holds `server.lock`. If a machine crashes, verify its recorded process is gone and its port is unused before removing the stale lock; the tools never kill an unknown process or automatically break a lock.

The owned server defaults to JSON room storage and the local rehearsal credential policy. Select the isolated SQLite profile with `--storage sqlite`; shell settings never redirect it to an inherited database or strict cookie policy. The extended commands above validate SQLite. Strict-session HTTPS clients remain a separate profile.

Use `--state-dir <new-empty-path>` and `--port <free-port>` for another independent rehearsal. Existing nonempty directories without C's ownership marker are refused. Existing servers and deployment files are left alone. Ctrl+C stops only the owned process. The original `npm run demo` and `npm run demo:reset` still operate the legacy workflow.

## Explicit room targeting

Join the printed room code through the normal phone UI. The capability-probe room is controlled through the CLI; its host credential is not placed into a URL. In another terminal, with the same state directory and game:

```sh
npm run demo:basketball:control -- --room ABC123 --action start
npm run demo:basketball:control -- --room ABC123 --action pause
npm run demo:basketball:control -- --room ABC123 --action resume
npm run demo:basketball:reset -- --room ABC123
```

Replace `ABC123` with the actual printed code. Reset creates a replacement room in a new season and prints its code; it preserves the old room and season history. It does not invent a server deletion endpoint or reset another participant's game. Only rooms created by this C state may be targeted. Include the same `--state-dir` on control/reset if you changed it. For a normal host-phone recording, create the room from the homepage instead; the browser acceptance runner exercises that route.

## Acceptance commands

Each command below boots its own process, chooses an unused port, uses new temporary data, saves JSON evidence, and stops its process. It never attaches to a shared deployment. No credentials or HAR files are saved in evidence.

```sh
npm run qa:smoke
npm run qa:basketball
npm run qa:browser
npm run qa:backup
npm run qa:load -- --duration-ms 60000
npm run qa:hardware
npm run qa:tracking
```

`qa:smoke` covers the selected room contract, invalid lineup preservation, auth/privacy, typed assistant plus actual MCP status, and pause/restart. `qa:basketball` additionally requires durable request receipts, lookup after restart, repeated IDs, conflicting IDs, an ambiguously lost response, lock rejection, final state, and season accounting after restart. It uses the server's clock and waits for genuine question/final states; there is no fast-forward through internal store methods.

`qa:browser` uses Playwright with three separate browser contexts, real host/join/lineup/pick requests, a typed assistant response, reconnect/seat restoration, connected display sizes, response loss, final and restart. It does not prove microphone recognition, speech synthesis, or hardware behavior. Install a browser with `npx playwright install chromium`, or set `CHROMIUM_PATH` to a trusted installed Chrome/Chromium executable. This machine uses `/usr/bin/chromium`. On Windows use PowerShell environment assignment for that variable. No browser download is needed when an executable is supplied.

For B's changed accessible labels/routes, pass `--selectors <json-file>`. Only the UI selectors are replaceable, not the service/game assertions. See [selector contract](qa/worker-c/SELECTORS.md). `qa:browser -- --smoke` omits the durable lost-response and final/restart gates and produces a different report kind; it cannot satisfy the full release gate.

Use `--game football` for football compatibility. The browser runner selects that sport explicitly in the same host form. That result does not count as basketball readiness. Use `--no-build` only after building the exact candidate; this reuses widget/web outputs. By default each workflow rebuilds assets. `--timeout-ms` controls waits (default 240000 per game-state wait, maximum 900000). The JSON-file backup adapter does not validate SQLite or distributed sessions; SQLite restore acceptance uses `qa:service`; the backend also has repository/session tests.

Evidence defaults to ignored `server/data/c-evidence/`. Set `--out <new-file.json>` for an explicit destination; existing reports are refused. Screenshots use a run-specific subdirectory. Exit 0 means all checks required by that command passed; 1 means a failed assertion/operation; 2 means a blocked prerequisite or required unrun gate. Every report includes its game, run ID, UTC timestamps, exact HEAD, code fingerprint, and per-check statuses. Publish only sanitized evidence, never state folders/backups: those contain credentials.

## Candidate and rollback gate

```sh
npm run qa:release -- --evidence-dir server/data/c-evidence
```

This reruns type checks, existing suites, C's tooling tests, both legacy game play-throughs, and widget/web builds. It requires passing full service/browser/load/backup reports for the selected game and exact source fingerprint/HEAD. A smoke report, zero-test run, skipped required gate, stale candidate or football-only report cannot satisfy the basketball gate. Output identifies a local demo candidate only. Wider-service acceptance still needs A's storage/session/observability implementation and measured restore/load/migration evidence; no deployment, release publication, provider purchase or submission happens here.

For rollback rehearsal, stop the owned server, take a verified snapshot using the exported JSON adapter in `scripts/basketball/storage.mjs`, and restore to an absent directory. `qa:backup` demonstrates the actual stopped-process snapshot, checksum verification, corruption/overwrite rejection, and a second server restoring credentials/lineup/standings/season. Keep the old code commit and matching backup together. Never restore over a running data directory. A previous application version must also be tested against the restored snapshot before claiming a production rollback path.
