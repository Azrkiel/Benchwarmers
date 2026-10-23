# Backend contract checkpoint: football adapter and durable room state

Date: October 23, 2026. Assignment: Worker A. Branch: `feature/basketball-backend`.
Base: `bc00daa710df77d88c50f986d2661fbec78748ed` (`origin/main`, refreshed before work).
Workspace: `C:/Users/jiang/Benchwarmers-basketball-backend`.

The user approved this provisional upstream base while Worker C's reconciled integration baseline is pending. The original dirty checkout at `C:/Users/jiang/Downloads/xvant/Benchwarmers` was preserved. This checkpoint is an initial backend delivery, not completion of the 61-task Worker A assignment or the basketball demo.

## Task status

| Task | Status and evidence |
|---|---|
| P01.1 | Football characterized before extraction: 27–24 final, captain salary/points, three legal auto-lineups, drive windows and pause/speed behavior, persisted progress, credential continuity and once-only season application. Existing room tests and added `adapters.test.ts` cover these behaviors. |
| P01.2 | Complete for the first delivery. `RoomSportAdapter` owns catalog, rules, replay beats, minimum response budget, timing, question creation/resolution, raw scoring and public game projection. Existing football logic is extracted into `sports/football.ts`. Adapter contracts have no dependency on football beat types, HTTP, persistence or credentials. |
| P01.3 | Additive snapshot metadata and discriminated sport context are implemented. Legacy football fields remain present. Basketball context is a type contract only until its adapter is delivered. |
| P01.4 | Partial. REST and the shared MCP creation schema accept optional `gameId`; omission and the explicit football ID select football. Unknown and not-yet-registered games return `400 GAME_NOT_SUPPORTED` before creating any room or season. Basketball is deliberately not registered yet. B owns MCP descriptions and future basketball command behavior. |
| P01.5 | Implemented for current football data. Full shape/reference validation precedes migration; a private `.v1.bak` preserves the original bytes. Successful migration writes version 2. Unknown versions, invalid relationships and conflicting existing backups stop startup visibly without replacing the source. |
| P01.6 | Implemented. Each synchronous mutation stages room/season copies, validates, versions and persists before its response is serialized. Write failure restores the committed in-memory state and returns `503 ROOM_SAVE_FAILED`. Tests cover create, join, lineup, host, pick, replay tick and final/season rollback. |

Phase 01 remains open until explicit basketball creation works. Phases 02–04 and the remaining A-owned tasks are pending. Void/stale runtime fixtures and request receipts will arrive with their owning phases; they are not simulated here as supported features. Worker C still owns integration acceptance and the master task status.

## Browser-safe exports

Import public types from `server/src/shared/room.ts`. `RoomSnapshot` is the complete new response type; `RoomView` retains optional additive fields so existing client fixtures compile during migration. Every actual `RoomStore` response supplies the new fields.

| Field | Meaning |
|---|---|
| `version` | Positive, durable snapshot version scoped to the room. A committed room change increases it. Shared season changes also increase affected room versions. Reads at a fixed clock, identical retries and rejected mutations do not increase it. Live replay advancement is itself a committed change. |
| `serverNow` | Server clock in Unix milliseconds at serialization. Use it for countdown offset; a client timestamp cannot backdate a command. |
| `rulesVersion` | Saved scoring/rules identifier, currently `football-v1`. The saved room rules remain authoritative. |
| `game.gameId` | Currently `morning-wood-vs-swiss-cheese`. Do not send the household engine's `riverton-vs-ironwood` ID to this adapter. |
| `game.sport` | Currently `football`; the context type also supports `basketball`. |
| `game.sourceMode` | Currently `scripted`. |
| `game.sourceStatus` | Currently `healthy`; the shared type reserves `delayed`, `stale` and `unavailable` for later source handling. |
| `game.context` | Football possession team ID, `ballOn`, `down`, and `toGo`. In lobby/final, possession/down/toGo are null. Legacy field-position fields are preserved. |

Basketball context explicitly separates team/player possession, optional normalized ball observations, and tracking capability. Unknown values are null. These fields never imply continuous tracking from a shot location.

Public views include visible play history only. Credentials, future replay beats and unresolved answers are never serialized. Private `me` requires the participant credential and does not include the credential itself. A host credential cannot impersonate a participant.

After restart, the durable replay position and remaining active response time are restored. Downtime is excluded. Rebased deadlines are committed with a new snapshot version so clients do not discard them as an old response. Reset the version comparison when changing rooms; a public snapshot and a private `me` snapshot have different visibility and should not be treated as interchangeable solely because their room versions match.

## Request/response behavior

The existing endpoint shapes are preserved. Tokens shown below are placeholders; public fixture files contain no tokens.

| Operation | Request | Success | Relevant failures |
|---|---|---|---|
| Create | `POST /api/rooms`, `{name?, seasonId?, speed?, gameId?}` | `201 {view: RoomSnapshot, hostToken}` | `400 BAD_REQUEST`, `BAD_SPEED`, `BAD_SEASON`, `GAME_NOT_SUPPORTED`; `503 ROOM_SAVE_FAILED` |
| Join/rejoin | `POST /api/rooms/:code/join`, `{name, participantToken?}` | `201 {view, participantId, participantToken}` | `401 BAD_CREDENTIAL`, `409 NAME_TAKEN` or `ROOM_FINAL`, `404 ROOM_NOT_FOUND`, `503 ROOM_SAVE_FAILED` |
| Public/private state | `GET /api/rooms/:code`, optional `Authorization: Bearer <participantToken>` | `200 RoomSnapshot` | `401 BAD_CREDENTIAL` or malformed-header `UNAUTHORIZED`, `404 ROOM_NOT_FOUND`, `503 ROOM_SAVE_FAILED` if replay advancement cannot persist |
| Manual lineup | `POST /api/rooms/:code/lineup`, `{participantToken, captainId, flexIds}` | `200 RoomSnapshot`, including `me.lineup.salaryUsed` | `400 BAD_PLAYER`, `BAD_LINEUP`, `DUPLICATE_PLAYER`, `OVER_CAP`; `401 BAD_CREDENTIAL`, `409 LINEUPS_LOCKED`, `503 ROOM_SAVE_FAILED` |
| Automatic lineup | `POST /api/rooms/:code/auto-lineup`, `{participantToken, style?}` | `200 RoomSnapshot`; styles `balanced`, `stars`, `value` | `400 BAD_STYLE` (schema errors use `BAD_REQUEST`), `401 BAD_CREDENTIAL`, `409 LINEUPS_LOCKED`, `503 ROOM_SAVE_FAILED` |
| Free pick | `POST /api/rooms/:code/picks`, `{participantToken, questionId, optionId}` | `200 RoomSnapshot`, including `me.currentPick` | `400 BAD_OPTION`, `401 BAD_CREDENTIAL`, `409 PICKS_LOCKED`, `503 ROOM_SAVE_FAILED` |
| Host | `POST /api/rooms/:code/host`, `{hostToken, action, speed?}` | `200 RoomSnapshot`; actions `start`, `pause`, `resume`, `set_speed` | `401 BAD_HOST_CREDENTIAL`, `409 BAD_PHASE`, `400 BAD_SPEED`, `503 ROOM_SAVE_FAILED` |
| Receipt lookup | Planned for Phase 04 | Not implemented in this checkpoint | Current router fallback is `404 NOT_FOUND`; do not build a receipt confirmation flow against it yet. |

Errors use `{error: string, code: string}`. REST schema errors use `400 BAD_REQUEST`. The shared creation schema is already consumed by `room_create` without edits to B-owned MCP implementation files. B's command/parser/voice tests and new MCP descriptions remain B's responsibility.

Repeated identical free picks preserve their original timing fraction. Changing a free pick before lock uses the new acceptance time. This is the existing football behavior, not the later request-ID receipt protocol. A failed lineup save leaves the previous accepted lineup intact. A failed final write leaves both the room and season at the previous committed result; retry records the final once.

## Storage and migration

`ROOM_DATA_FILE` and `RoomStore({dataFile})` retain their existing meaning. There are no new dependencies or environment settings. The legacy household data store is unchanged.

`persistence.ts` validates durable structures, unique identifiers, season/participant references, known lineup athletes, salary arithmetic, replay position and question picks/results. Version 1 receives the football adapter/rules identifiers and initial room versions after validation. Version 2 preserves those fields.

Migration writes `<dataFile>.v1.bak` before replacing the source. An existing backup is reused only if its contents exactly match the original being migrated; conflicting bytes cause an actionable startup error. Both backups and temporary files are created with mode `0600` where supported. Do not commit these private files. New files use unique temporary names, flush before rename, and clean up temporary files on failure.

This remains synchronous, single-process JSON storage. It does not provide cross-process transactions or the Phase 16 database/session policy. Deploying this migration requires a server that understands version 2; downgrading to an older server requires a separately managed restore, not blindly replacing current results with the migration backup.

## Fixtures and observed checks

`server/test/room/fixtures/football-contract.json` contains actual public snapshots from an isolated `createApp` HTTP smoke run: lobby, open, locked, resolved and final. The source store used only newly generated rehearsal identities and was removed after the run. Neither the host nor participant credential is in the fixture.

Observed checks for this checkpoint:

- Before extraction: 6 room test files, 21 tests passed; both workspace type checks passed.
- Test-first additions: 12 expected failures demonstrated missing metadata/game rejection/migration/rollback; three new auto-lineup characterizations already passed.
- Restart regression: one expected failing test showed deadlines rebased without a version increase; the implementation then passed it.
- `npm run test -w server -- --maxWorkers=1`: final run, 42 files, 764 tests passed, including preservation of an already accepted lineup/pick after a failed edit.
- `npm run test -w web`: 59 files, 500 tests passed.
- `npm run typecheck`: server, widget and web passed.
- `npm run build`: passed; Vite reports the existing large-bundle warning for chunks over 500 kB.
- Full `createApp` HTTP smoke: health, legacy basketball `DEMO`, unsupported-game rejection, explicit football creation, join, lineup, free pick, offline restart preserving response time, 27–24 final, and once-only season after a second restart all passed.
- Local smoke/fixture command: `node --import tsx 'C:/Users/jiang/Documents/ChatGPT/benchwarmer 2/backend-checkpoint-smoke.mjs'`, run from the backend worktree. This local rehearsal file is outside the delivery patch; C retains ownership of portable cross-system acceptance tooling.
- Manual diff review covered staging/publish order, adapter extraction, restart deadline versioning and terminal/season rollback. No unresolved correctness finding remained in this checkpoint.
- Manual security review checked unknown-game dispatch, participant/host authorization continuity, persistence error disclosure, temporary/backup creation, and public snapshots/fixtures for credentials and future answers. No new vulnerability was identified in that scoped review. Wider-service auth and cross-process storage remain pending Phase 16 work.
- Cleanup review retained the existing score/replay functions, removed football constants and prediction rules from the room store, and kept dependency manifests, B-owned implementation and C-owned tooling unchanged. `git diff --check` passed.

No browser, microphone, physical display, paid provider or live basketball evidence is claimed. No deployment, push or PR was performed.

## Integration requests and next work

Worker C can integrate the initial adapter/contract/migration boundary into its selected baseline and rerun connected acceptance. B can consume `RoomSnapshot` and the public fixtures for shells and football compatibility. No dependency or script request is needed. B/C should keep basketball room creation and receipt-dependent confirmation gated until A's next deliveries.

Next A work: audit `harbor-vs-summit`, implement the validated basketball reducer/replay and catalog, register the basketball adapter, then deliver possession-aware prediction targets and receipts. Preserve football's existing response window behavior while giving basketball its planned eight-second active window.
