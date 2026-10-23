# Basketball integration rehearsal

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

The owned server explicitly uses JSON room storage and the local rehearsal credential policy. Shell settings for SQLite or strict cookie sessions do not redirect this workflow to another database or deployment. These tools validate the default rehearsal; use the backend's dedicated SQLite/session tests for those opt-in modes.

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

Use `--game football` for football compatibility. The browser runner selects that sport explicitly in the same host form. That result does not count as basketball readiness. Use `--no-build` only after building the exact candidate; this reuses widget/web outputs. By default each workflow rebuilds assets. `--timeout-ms` controls waits (default 240000 per game-state wait, maximum 900000). The JSON-file backup adapter does not validate SQLite or distributed sessions; SQLite restore checks live in the backend test suite.

Evidence defaults to ignored `server/data/c-evidence/`. Set `--out <new-file.json>` for an explicit destination; existing reports are refused. Screenshots use a run-specific subdirectory. Exit 0 means all checks required by that command passed; 1 means a failed assertion/operation; 2 means a blocked prerequisite or required unrun gate. Every report includes its game, run ID, UTC timestamps, exact HEAD, code fingerprint, and per-check statuses. Publish only sanitized evidence, never state folders/backups: those contain credentials.

## Candidate and rollback gate

```sh
npm run qa:release -- --evidence-dir server/data/c-evidence
```

This reruns type checks, existing suites, C's tooling tests, both legacy game play-throughs, and widget/web builds. It requires passing full service/browser/load/backup reports for the selected game and exact source fingerprint/HEAD. A smoke report, zero-test run, skipped required gate, stale candidate or football-only report cannot satisfy the basketball gate. Output identifies a local demo candidate only. Wider-service acceptance still needs A's storage/session/observability implementation and measured restore/load/migration evidence; no deployment, release publication, provider purchase or submission happens here.

For rollback rehearsal, stop the owned server, take a verified snapshot using the exported JSON adapter in `scripts/basketball/storage.mjs`, and restore to an absent directory. `qa:backup` demonstrates the actual stopped-process snapshot, checksum verification, corruption/overwrite rejection, and a second server restoring credentials/lineup/standings/season. Keep the old code commit and matching backup together. Never restore over a running data directory. A previous application version must also be tested against the restored snapshot before claiming a production rollback path.
