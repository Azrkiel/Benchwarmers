# Integrated C evidence, 2026-10-23

See [observed results](../RESULTS.md), [scope and task closures](../FOLLOWUP.md), and [open/resolved findings](../INTEGRATION_FINDINGS.md). JSON snapshots are sanitized copies of the runner's observations, not inputs that bypass a new candidate run. Private databases/backups/credentials/browser storage/server logs remain excluded.

The source baseline is `14d82295c864af5682c403e3bbad6e458549484d`, plus the corrected C implementation fingerprint recorded in each current report. The eventual Git commit includes that tested implementation and documentation/evidence. HEAD changes after committing: rerun acceptance for a future candidate rather than relabeling these historical reports. `regressions/` intentionally has different pre-fix fingerprints and failed statuses.

- `accept.json`, `browser.json`: full default JSON basketball acceptance, real connected phones/shared display/simulator, response-loss recovery and final/restart.
- `sqlite-browser.json`: the same connected browser flow with SQLite storage.
- `football-browser.json`: existing football connected compatibility.
- `service.json`: SQLite game/final/restart, live snapshot, restore, corrupt/overwrite refusal, actual previous-compatible-server recovery.
- `features.json`: private opt-in points/calls/pregame fixture through HTTP/MCP/typed router, exact arithmetic/confirmation/retries, settlement/restart and durable private recovery.
- `backup.json`: JSON backup/restore compatibility.
- `load*.json`: selected single-node 32-seat sustained reads plus actual lineup/pick writes; each report has its own counts, latency and zero-error assertion. These are local observations, not a production capacity benchmark.
- `hardware.json`, `tracking.json`: actual cloud capabilities and completed continuous-tracking NO-GO decision. Physical Alexa is outside the accepted simulation-only scope.
- `release.json`: automated local gate only, including application/tooling suites, types/builds, legacy play-throughs and exact-source evidence requirements. Manual visual review remains separately open.

Screenshots are from the genuine JSON connected browser run, not fixtures. `simulator-mcp-seat.png` shows the real tools/list and saved-seat room_ask trace with typed input; no microphone claim. `06-display-1920.png` is the paused API-matched display. `09-final-restored.png` shows the phone's restored final/season result. **`08-final-display.png` is also an open B defect artifact:** the top final score is correct, but the last-score celebration obscures the winner card on the first final frame. Passing automated assertions do not establish pixel readability, and recording review stays held for B's fix.
