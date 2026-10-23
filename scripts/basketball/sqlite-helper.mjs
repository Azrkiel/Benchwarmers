// Executed with --import tsx; uses A's supported storage API rather than copying an open WAL file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SqliteRoomRepository } from '../../server/src/room/storage/sqlite.ts';
const [source, destination] = process.argv.slice(2);
assert.ok(source && destination && fs.existsSync(source));
const repository = new SqliteRoomRepository(source);
try { repository.backup(destination); } finally { repository.close(); }
