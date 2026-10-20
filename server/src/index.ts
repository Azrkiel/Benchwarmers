import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { createApiRouter } from './api/routes.js';
import { startAiWorker } from './ai/worker.js';
import { createAiProvider } from './ai/providers.js';
import { GAMES } from './game/games.js';
import { Store } from './game/store.js';

export function createApp(opts: { store: Store }): express.Express {
  const { store } = opts;
  const app = express();
  app.use(cors());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'benchwarmers', time: Date.now() });
  });

  // Phase 2: mount the MCP endpoint here (app.use('/mcp', ...)), BEFORE the /api router below.
  // Phase 4: mount `/api/assistant` here, BEFORE the /api router, or the router's
  // catch-all 404 shadows it.

  app.use('/api', createApiRouter(store));

  return app;
}

export async function main(): Promise<void> {
  const store = new Store(); // DATA_FILE / SPEED env respected by Store defaults
  const app = createApp({ store });
  const port = Number(process.env.PORT) || 3001;
  const server = app.listen(port, () => {
    console.log(`Benchwarmers server listening on http://localhost:${port}`);
  });

  // Background AI worker: never in a request path. Seeded parties were created before it
  // subscribed, so warm scouting notes for every known game once at startup.
  const provider = createAiProvider();
  const worker = startAiWorker({ sink: store, provider, log: (m) => console.warn('[ai]', m) });
  console.log(`AI mode: ${provider.mode}`);
  for (const game of Object.values(GAMES)) {
    provider
      .scoutingNotes(game)
      .then((notes) => store.setScoutingNotes(game.id, notes))
      .catch((err) => console.warn('[ai] scouting notes failed', err));
  }

  const timer = setInterval(() => {
    try {
      store.tick();
    } catch (err) {
      console.error('[tick] failed', err);
    }
  }, 500);

  const shutdown = () => {
    clearInterval(timer);
    worker.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function isEntryPoint(): boolean {
  const entry = path.resolve(process.argv[1] ?? '');
  const self = fileURLToPath(import.meta.url);
  return process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isEntryPoint()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
