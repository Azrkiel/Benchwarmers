# Transactional room storage and runtime

October 23, 2026. The existing JSON store remains the compatibility default. SQLite is an explicit local/single-node option, implemented with the bundled Node 22.23.3 `node:sqlite` driver; that runtime emits its experimental-feature warning. No new package or native dependency was installed for storage. These tests establish this runtime's behavior, not a production availability or scale claim.

## Server selection

`createRoomRuntime(environment)` is used by the ordinary server entry point. Supported trusted server settings:

| Setting | Default | Behavior |
|---|---|---|
| `ROOM_STORAGE` | `json` | `json` or `sqlite`; other values stop startup. |
| `ROOM_DATA_FILE` | `data/rooms.json` | Existing JSON path. |
| `ROOM_SQLITE_FILE` | `data/rooms.sqlite` | Explicit SQLite path, used only in SQLite mode. |
| `ROOM_SESSIONS` | `off` | `on` enables the private cookie boundary. |
| `ROOM_SESSION_ORIGINS` | empty | Comma-separated exact HTTPS origins; required for session mode. |
| `ROOM_ALLOW_LEGACY_CREDENTIALS` | false in session mode | Only literal `true` retains direct bearer/body mutations when session mode is enabled. Public join/create bootstrap and public reads remain available. |

Pregame, commitments, correction history and live sources are not enabled by these storage/security settings. The entry point continues to use ordinary free scripted play. `createApp({roomSecurity})` and constructor options support isolated integration callers; clients cannot supply these settings through room JSON. Runtime shutdown closes the SQLite connection after the HTTP server drains.

## Transactions and uniqueness

`SqliteRoomRepository` implements `RoomRepository.load/save`. RoomStore stages copies, validates, writes, then renders the response. SQLite uses `BEGIN IMMEDIATE`, WAL, full synchronous writes and a bounded busy timeout. Snapshot revision compare-and-swap rejects a stale writer with `ROOM_VERSION_CONFLICT`; no accepted result is returned for a failed save. Ordinary reads/mutations synchronize from the shared repository rather than relying indefinitely on an old in-memory copy.

The authoritative snapshot and relational indexes commit together. Database constraints enforce room/participant identity, participant-target commitments, scoped pick/commitment request IDs, acceptance sequences and ledger posting IDs/amount bounds. Outcome versions are unique per room/target/revision. Complete-history rooms retain versioned season contributions plus one current contribution head; corrections replace the active contribution while preserving its prior version. Each result version is immutable in that contribution history.

`SqliteProviderCheckpointStore(file,{provider,gameId,catalog})` may share the same file. Separate checkpoint heads use stale-writer CAS; provider event/revision rows have unique keys and immutable update/delete triggers. The checkpoint is replay-validated before save and load. An event journal commits before publication. If publication fails or the process stops, the durable journal is retained and the same `resultVersion` can be published again; RoomStore's final correction service is idempotent by version. This is at-least-once publication with an idempotent consumer, not a cross-resource network transaction.

One API/timer process remains the supported deployment boundary. SQLite protects storage writes, but source leadership, presentation clock ownership, session registries, metrics and request-rate buckets have not become a distributed service. Do not interpret two-connection transaction tests as permission to horizontally scale the full app.

## Migration, backup and retention

`repository.importJson(source)` accepts a valid version-2 JSON snapshot into an **empty** SQLite room store. It preserves the original JSON bytes and rejects an occupied destination. It does not guess a migration from unsupported formats. `repository.backup(newDestination)` uses a consistent SQLite snapshot via `VACUUM INTO`, refuses overwrite and creates a private file where filesystem modes are supported. Restore by copying that backup into a different empty location and opening a compatible server against the copy.

Backups include credentials, private banks and complete event histories. Keep them outside Git/public evidence and enforce deployment-appropriate filesystem access. The supplied tests restore isolated copies and verify receipt/room identity, contribution state and provider authority. C still owns the chosen deployment's operational backup/recovery objectives and load/rollback acceptance.

Switching `ROOM_STORAGE` back to an old JSON file is **not** a rollback after accepting SQLite writes: it would discard newer receipts and settlements. Preserve a compatible backup and server build; do not run code that strips newer points, pregame or correction fields. No down-migration or overwrite restore is performed automatically.

The service retains accepted receipts, ledger postings, source revisions and contribution evidence. It does not automatically erase completed financial/correction history. Room storage is bounded at 100 rooms by default; discovery returns at most 20 and rooms accept at most 64 seats, preserving the legacy 35-seat contract. Operators must archive/rotate under an explicit backup and retention decision rather than silently delete accepted data. Expired unaccepted quote previews retire on a subsequent quote; accepted quote evidence remains. Outstanding previews are bounded at 20 per actor and 256 per room, with `429 QUOTE_LIMIT_REACHED` at capacity.

## Verification

Test-first checks cover real RoomStore writes/receipts/restart, two connections, stale-writer rejection, SQL uniqueness, failure midway through index writes, original-JSON preservation, overwrite rejection and backup restore. SQLite correction tests preserve old/new contribution versions while keeping one played night. Provider checkpoint tests cover immutable revisions, projection tampering, head-write rollback, source identity isolation and restart after publisher failure. Optional metrics failures cannot turn a durable acceptance into an error.

The integrated backend run before B/C merges passed 88 server files / 985 tests, 74 web files / 570 tests, all workspace type checks and production build. Final post-integration evidence is recorded in the completion checkpoint.
