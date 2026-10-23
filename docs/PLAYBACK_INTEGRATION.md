# Playback route integration checkpoint

October 23, 2026. Continues the backend checkpoint `fdfea9c`. Worker B's completed delivery through `19cd19f` was fast-forwarded into `feature/basketball-backend`; B had already merged both backend deliveries. No existing worktree was reset, and the product worktree was not edited.

## Backend request fulfilled

`createRoomRouter` now registers B's `createPlaybackRouter` at `/api/rooms/:code/playback`, with one `PlaybackLeases` instance per mounted room router. `RoomStore.roomSummary(code)` and `isHost(code, token)` provide read-only lookup and room-specific host verification. Neither advances replay or persists changes.

The wrapper requires an existing room before dispatch and passes its canonical code to the child router. This is required because the main room service accepts trimmed/case-insensitive codes; treating a padded code as a separate lease key would allow two holders for the same room. Canonicalization and child dispatch happen in one middleware invocation because Express restores route params between separate handlers.

The supplied lease service remains ephemeral and single-process. A restart clears leases; screens must claim again. Public lease responses contain label/expiration, not device IDs or credentials. Devices may voluntarily claim a free lease; `force` replaces a different holder only with that room's host credential. A participant credential, another room's host credential, an empty credential and a wrong credential cannot force takeover.

`server/test/room/playback-routes.test.ts` verifies route registration, case/space aliases, holder renewal/release, room isolation, host takeover, invalid request rejection, missing-room rejection, public serialization and no replay tick/durable write during auxiliary lookup/claim.

## Connected observations

Fresh rehearsal servers used ports 3013/5213, fallback/offline AI, and separate temporary household/room data under the chat workspace. Other worktrees' servers/data were untouched. B's existing connected Playwright scenario was copied outside the repo, changing only its ports and output directory.

- Home -> basketball creation -> two phones -> manual $41,500 lineup and auto lineup -> compact 960x480 display -> six accepted receipts -> final 57–56.
- Display showed the winner and 22 distinct observed celebration states. No page errors were reported.
- The copied scenario keeps clicking the Game tab during its polling loop, so its final phone-tab flag is not evidence for automatic Results selection. A separate fresh phone context restored the rehearsal seat: Results was selected on reload, with no horizontal overflow at 390x844.
- A typed score request through the real `/assistant` API returned the correct 57–56 score. This is command-path evidence, not a microphone or physical audio test.
- An additional 32-participant concurrent HTTP test passed: legal shared-athlete lineups, unique acceptance sequences, 16/16 question counts, one acceptance per repeated request ID, no private credentials in public state, and one season application per participant.

## Product-owned blocker found

The new registered endpoint makes a previously unavailable browser path executable. Two independent browser contexts reproduced a takeover race in `web/src/fx/playbackLease.ts`:

```text
Host selects Play here
  -> current claim effect cleanup sends release(device)
  -> restarted effect sends force claim(device, host token)
  -> force claim succeeds
  -> delayed cleanup release removes the new lease
  -> old screen renews; host loses the next renewal
```

Observed claim responses were `[200, 409, 200, 200, 409]`; the original screen still showed Mute and the host returned to “Sound plays on Shared screen”. The backend's host authorization test passes; a request trace confirms the takeover sends `force: true` with a host credential. Suppressing only the host's cleanup release in an isolated browser diagnostic made takeover and old-holder yield pass, with zero page errors. That intercepted diagnostic establishes the cause; it is not a production fix or completion evidence.

Prepared fix: remove the release request from the claim/retry effect cleanup and put it in a separate cleanup tied only to room code and sound-enabled state. Retrying/taking over must not release the same device's newly acquired lease. Unmount, room change and disabling sound must still release it. Add hook tests for delayed release vs claim, takeover, renewal and unmount.

The Worker A brief excludes `web/`; approval to apply this narrow B-owned fix was requested while backend verification continued. Pending that choice, no B-owned implementation has been changed by A. A reviewable proposed diff and reproduction scripts/screenshots are saved in the local chat workspace at `C:/Users/jiang/Documents/ChatGPT/benchwarmer 2/playback-checkpoint/`. No credentials were printed or included in screenshots/reports.

## Verification and limits

- Before wiring: focused product playback/assistant and backend HTTP checks passed (16 tests).
- Test-first route cases failed with missing endpoints and missing `isHost`; wiring made them pass. The padded-code alias regression then failed before the wrapper correction.
- Full merged server run before the extra concurrency test: 53 files, 832 tests passed.
- Full merged web run: 74 files, 570 tests passed.
- Server/widget/web type checks, extension type check and production build passed. Existing Vite large-chunk warning remains.
- Final `npm run test -w server -- --maxWorkers=1`: 54 files, 833 tests passed, including the new concurrency and registered-route cases. The final server/widget/web type check and `git diff --check` also passed.

M2 remains pending the playback client fix and C's complete connected/adverse-case acceptance. No real microphone, speaker, Echo device, external provider, deployment or publication is claimed. Root manifests, C-owned acceptance tooling and B-owned source were preserved; the product merge brought in B's existing source unchanged.
