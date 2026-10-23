# Worker C handoff

**Integrated follow-up:** A/B/C are now on main. [Current acceptance](FOLLOWUP.md) supersedes the original missing-backend findings below. The supported release profiles are the ordinary scripted JSON demo and an explicitly isolated single-node SQLite rehearsal. `qa:features` tests opt-in points/calls/pregame without changing production flags.

Use the current `main` delivery in your own preserved checkout; do not cherry-pick the original pre-integration range onto an already integrated branch. Install the shared lockfile with `npm ci`, then follow [current commands and task closure](FOLLOWUP.md). This continuation adds scripts without changing dependencies or regenerating the lockfile. The owner-authorized domain timestamp fix and the open B final-transition case are documented in [findings](INTEGRATION_FINDINGS.md).

## Historical independent-delivery instructions

The following instructions and adapter notes describe C's first, pre-integration handoff. They remain provenance, not a request to reapply that range to current main.

This folder and `scripts/basketball/` are C's independent delivery. Copy or cherry-pick C's change onto A/B's candidate; there is no dependency on a Windows worktree or files outside this repository. The root manifest adds only Playwright 1.56.1 plus named integration scripts; no server/web dependencies change. Resolve a concurrent lockfile change by retaining the candidate's dependency requirements and regenerating the shared lockfile once; do not replace it wholesale.

After preserving your local work, fetch C's independent branch and apply its commit(s) to your own integration candidate:

```sh
git fetch origin feature/basketball-integration
git cherry-pick bc00daa710df77d88c50f986d2661fbec78748ed..origin/feature/basketball-integration
```

Do not reset your branch or overwrite A/B's work. If manifests conflict, resolve their combined requirements and regenerate the lockfile once. [Observed results](RESULTS.md) and the portable report/selector formats below make the delivery reviewable before integration.

Start with [demo operations](../../BASKETBALL_DEMO.md), [C's task/checkpoint record](../../plans/2026-10-23-worker-c-integration.md), [selector contract](SELECTORS.md), [hardware evidence](HARDWARE.md), [tracking hold](TRACKING.md), [wider-service gates](RELEASE_GATES.md), and [findings for A/B](INTEGRATION_FINDINGS.md).

## Hand-off to A

No gameplay implementation is included. The runner expects additive room APIs already described by the assignment:

| Operation | Expected boundary |
| --- | --- |
| Create | `POST /api/rooms` with gameId, name, seasonId, speed; 201 `{view,hostToken}` |
| Sport identity | `view.game.sport` or `view.room.sport` = basketball; game id `harbor-vs-summit` in game.id/game.gameId/room.gameId |
| Join | `POST /api/rooms/:code/join`; 201 `{view,participantToken}` |
| Private snapshot | `GET /api/rooms/:code`, bearer participant token; public request omits me and credentials |
| Lineup | `POST .../auto-lineup` and `.../lineup`; private snapshot; invalid duplicate players rejected, old lineup retained |
| Host | `POST .../host` with hostToken and action start/pause/resume |
| Pick | `POST .../picks` with participantToken, questionId, optionId, requestId; private snapshot plus durable `receipt` |
| Receipt lookup | `GET .../receipts/:requestId`, participant bearer; stable response across restart |
| Reused ID | Same payload returns identical receipt; changed option with same ID returns 409 and conflict code |
| Lock | New ID for a closed/old question returns 409 `PICKS_LOCKED`; existing accepted receipt remains recoverable |
| Assistant/MCP | Room `.../assistant` accepts `{text,participantToken}` and returns `{reply,view}`; MCP `room_status` accepts code |

These expectations are C's explicit test adapter, not authority to change A's accepted contract. If the accepted contract differs, update C's adapter and document the additive contract decision. Do not change A's implementation merely to satisfy guessed fields. The original master plan is unavailable in this cloud checkout.

## Hand-off to B

`qa:browser` boots the real application and uses native UI events for host, join, lineup, host-start, pick and assistant. Browser contexts do not share seats. No tokens are injected into localStorage and no fixture flag is accepted. Update the selector JSON to match your real controls; keep response and authoritative-state assertions. The default selectors target this checkout's existing football UI. The suite reports missing basketball support clearly rather than counting that UI as basketball.

Real microphone/speaker, actual Echo/Alexa console, sound lease competition, accessibility assistive-technology checks and tracking feed evidence remain separate gates. Provide observations/measurements, not screenshots of fixture state as proof of a connected workflow.

## Delivery format

```text
Assignment: A or B
Task IDs:
Base commit:
Delivery commit/range:
Owned paths changed:
New/changed contracts or exports:
Dependency/script request:
Checks run and observed outcomes:
Browser/provider/device evidence:
Known limits or external prerequisites:
Next worker/milestone unblocked:
```

Keep provider keys, room credentials, microphone audio and private browser state out of deliveries. C's JSON reports deliberately omit those values. See `RESULTS.md` for actual C runs; a script being available is not the same as its gate passing.
