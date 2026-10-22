# Implement football room demo

Goal: real participants play Watch Party Fantasy's scripted football game inside Benchwarmers, with shared salary-cap lineups, all-position weighted scoring, mixed predictions, and saved seasons.

Architecture: additive room domain in the existing Express/MCP server, with a versioned persistent store and immutable fictional replay. Phone and shared-screen interfaces use a frozen public/private snapshot contract. Existing household parties remain compatible. Stack: Node22, TypeScript, React19, Express5, MCP SDK, Vitest.

```text
Phone / TV / MCP -> room API -> RoomStore -> replay + scoring
                       |          |
                  validation   JSON persistence -> season once
                       |
                400/401/404/409 -> recoverable UI message
```

File ownership:
- Backend lane: server/src/room/{types,store,scoring,replay}, server/src/shared/room.ts, server/test/room/{store,scoring,replay}.test.ts.
- Frontend lane: web/src/room/*, web/src/home/HomePage.tsx, web/src/App.tsx, web/vite.config.ts. Reuse brand tokens and phone/TV state contract in spec.
- Integration lead: server/src/room/{routes,assistant,mcp}.ts, server/src/index.ts, server/src/mcp/{server,http}.ts, server/test/room/{routes,mcp,assistant}.test.ts; scripts/demo.mjs, docs, package scripts if needed.

- [x] RED replay and scoring: assert imported script has25 players, no warnings,27–24 final, Hugh Jass86 team-rush yards, Phil148 punt yards/3 inside20, Ben8 snaps. Run `npm run test -w server -- test/room/replay.test.ts`; expect missing room module. Port original replay, then expect all assertions pass.
- [x] RED room lifecycle: test30 joins, stable token rejoin, shared captain selection, cap/captain validation, late-join cutoff, pause/resume/speed, conditional probability scoring, unchanged-pick timestamp, changed-pick timestamp, missed-pick streak break, restart, exactly-once season. Implement RoomStore frozen methods from spec. Run `npm run test -w server -- test/room`; expect green.
- [x] RED REST: use `createApp({store,roomStore})`; create/join/lineup/start/pick and read spectator state over real HTTP. Assert401 for other credentials and no future outcomes/tokens in public response. Add `createRoomRouter(roomStore)` before legacy API catchall. Run focused suite; expect green.
- [x] RED MCP and assistant: create MCP client against app with roomStore, assert room tool list and create/join/auto-lineup/host/pick calls; text commands call same service. Extend `createServer(store,roomStore?)`, `mountMcp` options, and main. Tests expecting only legacy tools continue without roomStore. Run focused suites; expect green.
- [x] RED browser: test create/join credential storage, salary-aware five-slot selection, legal automatic lineup, prediction submission, TV join-code display, and API-error recovery using mocked HTTP. Add room routes and primary home entry. Run `npm run test -w web -- src/room`; expect green.
- [x] Wire startup: instantiate RoomStore once, tick with legacy store; serve built web assets if available for one-origin phone access. Configure Vite LAN binding and demo links. Keep secrets out of logs. Document LAN and public-tunnel demo commands.
- [x] Verify `npm test`, `npm run typecheck`, `npm run typecheck:extension`, `npm run build`, `git diff --check`. Run actual server and multiple real HTTP clients through a complete party, restart saved state, inspect phone+TV browser rendering and interactions at desktop/mobile widths. Record only observed results and physical-device limitations.

Baseline before changes: server716/716 and web392/392 pass. Existing linked worktree reused; branch feature/big-room-demo, base6203a3c. User's script clarification authorizes proceeding with the presented integration design.
