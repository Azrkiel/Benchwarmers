# Deploy (Fly.io)

Live: https://benchwarmers.fly.dev — one machine (iad, shared-cpu-1x, 1 GB) serves the web build, REST, rooms and `/mcp`.

- Config: `fly.toml`, `Dockerfile`, `.dockerignore` (keeps `.env` and its keys out of the image).
- Data: volume `bw_data` mounted at `/app/server/data` (parties, rooms, imported games survive restarts).
- Modes: `AI_MODE=fallback`, `ASSISTANT_MODE=offline` — no cloud keys on the server.
- Secret: `MCP_TOKEN` (random; set with `flyctl secrets set MCP_TOKEN=... --app benchwarmers`). `/mcp` returns 401 without it.
- The machine stays up (`auto_stop_machines = "off"`) because game clocks tick in memory.

Redeploy from the repo root (Git Bash). `--depot=false` avoids the local TLS proxy breaking the Depot builder:

```bash
flyctl deploy --app benchwarmers --remote-only --depot=false --ha=false
```
