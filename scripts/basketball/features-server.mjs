// C-only rehearsal entry point. Never imported by the ordinary application entry point.
import { createApp } from '../../server/src/index.ts';
import { Store } from '../../server/src/game/store.ts';
import { RoomStore } from '../../server/src/room/store.ts';
const now = Date.now();
const probabilities = [
  ['next_score_team', ['harbor', 'summit']],
  ['next_made_field_goal_value', ['two', 'three']],
].flatMap(([templateId, options]) => options.map(optionId => ({
  gameId: 'harbor-vs-summit', templateId, optionId,
  estimate: { p: .5, version: 'c-authored-rehearsal-v1', label: 'Authored C test probability; not a forecast', source: 'demo_projection', observedAt: now, validUntil: now + 1800000 },
})));
const repository = process.env.ROOM_STORAGE === 'sqlite'
  ? new (await import('../../server/src/room/storage/sqlite.ts')).SqliteRoomRepository(process.env.ROOM_SQLITE_FILE)
  : undefined;
const roomStore = new RoomStore({ repository, dataFile: process.env.ROOM_DATA_FILE, speed: 4, enableCommitments: true, enablePregame: true, enableCorrections: true, probabilities });
const app = createApp({ store: new Store(), roomStore });
const server = app.listen(Number(process.env.PORT));
const tick = setInterval(() => roomStore.tick(), 100);
const close = () => { clearInterval(tick); server.close(() => { repository?.close(); process.exit(0); }); };
process.on('SIGINT', close); process.on('SIGTERM', close);
