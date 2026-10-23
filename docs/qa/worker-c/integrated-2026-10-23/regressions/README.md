# Pre-fix failure evidence

These failed reports belong to the candidate **before** the authorized timestamp correction; they cannot satisfy the final candidate gate. `pre-fix-features.json` is the ordinary real HTTP/MCP/typed-router feature run. `pre-fix-diagnostic-features.json` repeats it with a private external preload that only logs a redacted exception stack; this instrumented run is diagnostic evidence, not an independent acceptance pass. It did not alter time or service behavior. The diagnostic module and private server logs are not committed.

Observed failure: legitimate `POST /api/rooms/:code/calls` returned HTTP 500 / `INTERNAL`. Its absent fourth call then caused the expected four-seat settlement assertion to fail. Restore/rollback checks stayed unrun rather than being counted as passed.

Redacted diagnostic stack:

```text
Error: Invalid room data: uncommitted player call. Restore a valid backup; the existing file has not been replaced.
  at validateSavedRooms (server/src/room/persistence.ts)
  at RoomStore.transact (server/src/room/store.ts)
  at RoomStore.acceptCommitment (server/src/room/store.ts)
  at RoomStore.acceptPlayerCall (server/src/room/store.ts)
```

The linked call used a later wall-clock read for `createdAt` than the accepted commitment's `acceptedAt`. The owner authorized the one-line invariant fix and regression. The standalone [advancing-clock reproducer](../../repro-player-call.mjs) failed before that change and passed after it; the formal Vitest regression now exercises that boundary. Corrected-candidate reports are one directory above.
