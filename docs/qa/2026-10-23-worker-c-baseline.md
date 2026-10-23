# Worker C baseline and integration checkpoint

Observed 2026-10-23 in the isolated cloud environment. This is baseline evidence, not completion of the basketball plan.

## Workspace preservation and baseline

- Original checkout: `/workspace/Benchwarmers`; initial branch `work`.
- Initial tracked and untracked status: clean. No deployment changes were present in this cloud checkout.
- Recorded common baseline: `bc00daa710df77d88c50f986d2661fbec78748ed`, matching the read-only remote main observation.
- Created local branch `feature/basketball-integration` at that exact commit. No reset, merge, push, or existing branch overwrite was performed.
- The Windows checkouts named in the assignment are unavailable here. Their dirty files, local-only commits, and preservation cannot be verified from this machine. This report does not claim P00.1 complete.
- Use this existing isolated cloud checkout. Do not create additional worktrees unless requested. Coordinate the common base before merging independent worker deliveries.

## Installation and baseline checks

Node 24.19.0, npm 11.9.0; repository requires Node >=22. Five available CPUs and approximately 34 GB RAM were reported.

`npm ci --cache /workspace/.npm-cache --no-audit --no-fund` initially failed when ONNX Runtime tried to download optional CUDA providers from api.nuget.org (EAI_AGAIN). The package's own install script documents `ONNXRUNTIME_NODE_INSTALL=skip`; its metadata identifies the extra Linux x64 downloads as CUDA/TensorRT providers. CPU packages remain installed. No checksum or TLS verification was disabled.

Successful installation:

```sh
cd /workspace/Benchwarmers
ONNXRUNTIME_NODE_INSTALL=skip npm ci --cache /workspace/.npm-cache --no-audit --no-fund
```

| Check | Observed outcome |
| --- | --- |
| Frozen dependency installation | 299 packages installed |
| `npm run typecheck` | Server, widget, web passed |
| `npm test` | Server: 39 files, 743 passed, 1 skipped; web: 59 files, 500 passed; exit 0 |
| `AI_MODE=fallback ASSISTANT_MODE=offline npm run demo` | Widget and web built; server started on 3001 |
| Local HTTP smoke | Health ok, built web entry present, game catalog responded |
| Football room functional smoke | Create 201, read 200, join 201, auto-lineup 200 with four flex players; public view omits hostToken |

The ad hoc smoke initially assumed top-level room code/phase. Source inspection established `create.view.room.code` and `view.room.phase`; corrected assertions passed. These were probe errors, not repository defects. No connected basketball browser, restart, lost-response, storage, load, or release gate has run here.

Logs for this instance: `/tmp/benchwarmers-baseline-tests.log` and `/tmp/benchwarmers-demo.log`. Build outputs, node_modules, and server/data are ignored. The smoke created one named football room and participant in the local ignored data; it did not reset existing state.

## Available deliveries and missing source of truth

Read-only remote inspection found Worker B's branch at `6f3e9221a386cd353ba157842d09e99c1885509b`. Its delivery report describes integrated A contract/replay/points commits and connected browser evidence. Those are worker-reported results, not independent C verification. No patches were merged into C.

The requested master `2026-10-23-basketball-vision-implementation.md` and large A/B assignment briefs were absent from main and the inspected B/snapshot trees. The 121-task ownership map and exact task acceptance criteria cannot be reconstructed safely from C's brief alone. Obtain those files and resolve whether this turn is implementation or planning-only before executing dependent integration work.

B reports a simulated-device-only owner decision in its DEVICE_AND_TRACKING report. That differs from the supplied C brief's hardware gate. Treat this as a pending scope discrepancy until reconciled with the authoritative plan.

## C ownership and gate status

| Tasks | Status |
| --- | --- |
| P00.1 | Cloud inventory recorded; Windows preservation unverified |
| P00.2 | Local integration branch and common base recorded; cross-worker agreement unverified |
| P00.4 | Baseline install, type checks, tests and startup verified as above |
| P00.5 | Baseline football smoke and existing suites passed; integrated candidate compatibility pending |
| P09.1–P09.7 | Pending exact plan and accepted A/B candidate; no full-product claim |
| P14.1 | No `/dev/snd`, `/dev/video0`, or `/dev/nvidia0` exposed; no physical microphone, Echo, camera, or Alexa console verified; scope discrepancy pending |
| P15.5 | Pending A provider evidence and authoritative criteria; B reports synthetic-only ball tracking and recommends possession presentation |
| P16.6–P16.8 | Backup/restore, load, and release/rollback gates unrun; no deployment authorized |

C owns integration tooling, shared manifests/lockfile, plan coordination, demo documentation and cross-system evidence. Gameplay and product/voice implementation remain with A and B. No extra workers were started and no external messages were sent.

## Reusable cloud setup

Saved configuration fields: `install_script` (CPU dependency installation and widget/web builds), `start_skill` (existing checkout, demo startup and readiness, development command, validation and data preservation). Save was confirmed; publication and fresh-task restoration have not been tested. Review/save the draft in environment settings, then publish the prepared environment when desired.
