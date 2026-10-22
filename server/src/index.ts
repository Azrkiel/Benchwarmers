import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { createApiRouter, type GameImporter } from './api/routes.js';
import { importGame, loadImportedGames } from './live/ingest.js';
import type { AiContentProvider, Game } from './shared/types.js';
import { startAiWorker } from './ai/worker.js';
import { createAiProvider } from './ai/providers.js';
import { mountMcp } from './mcp/http.js';
import { createAssistantRouter } from './assistant/routes.js';
import { GAMES } from './game/games.js';
import { Store } from './game/store.js';
import { loadConfig } from './config.js';
import { existsSync } from 'node:fs';
import { RoomStore } from './room/store.js';
import { createRoomRouter } from './room/routes.js';

export function createApp(opts: { store: Store; importer?: GameImporter; roomStore?: RoomStore; webDir?: string }): express.Express {
  const { store } = opts;
  const app = express();
  app.use(cors());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'benchwarmers', time: Date.now() });
  });

  mountMcp(app, { store, roomStore: opts.roomStore, token: process.env.MCP_TOKEN ?? 'dev-token-change-me' });
  // /api/assistant must mount BEFORE the /api router, or its catch-all 404 shadows it.
  app.use(createAssistantRouter({ token: process.env.MCP_TOKEN ?? 'dev-token-change-me' }));

  if(opts.roomStore) app.use('/api/rooms', createRoomRouter(opts.roomStore));
  app.use('/api', createApiRouter(store, { importer: opts.importer }));
  if(opts.webDir && existsSync(path.join(opts.webDir,'index.html'))){
    app.use(express.static(opts.webDir));
    app.get('/{*splat}',(req,res,next)=>{
      if(req.path.startsWith('/api') || req.path.startsWith('/mcp'))return next();
      res.sendFile(path.join(opts.webDir!,'index.html'));
    });
  }

  return app;
}

/** Background scouting notes for a game; never blocks a request. */
function warmScoutingNotes(provider: AiContentProvider, store: Store, game: Game): void {
  provider
    .scoutingNotes(game)
    .then((notes) => store.setScoutingNotes(game.id, notes))
    .catch((err) => console.warn('[ai] scouting notes failed', err));
}

export async function main(): Promise<void> {
  loadConfig();
  const store = new Store(); // DATA_FILE / SPEED env respected by Store defaults
  const roomStore = new RoomStore({dataFile:process.env.ROOM_DATA_FILE??'data/rooms.json',speed:Number(process.env.ROOM_SPEED)||1});
  const provider = createAiProvider();
  const warmNotes = (game: Game) => warmScoutingNotes(provider, store, game);
  const restored = loadImportedGames();
  if (restored) console.log(`Restored ${restored} imported game(s)`);
  const app = createApp({ store, roomStore, webDir:fileURLToPath(new URL('../../web/dist',import.meta.url)), importer: (q) => importGame(q, { onNewGame: warmNotes }) });
  const port = Number(process.env.PORT) || 3001;
  const server = app.listen(port, () => {
    console.log(`Benchwarmers server listening on http://localhost:${port}`);
  });

  // Background AI worker: never in a request path. Seeded parties were created before it
  // subscribed, so warm scouting notes for every known game once at startup.
  const worker = startAiWorker({ sink: store, provider, log: (m) => console.warn('[ai]', m) });
  console.log(`AI mode: ${provider.mode}`);
  for (const game of Object.values(GAMES)) warmNotes(game);

  const timer = setInterval(() => {
    try {
      store.tick();
      roomStore.tick();
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
