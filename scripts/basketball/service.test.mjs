import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { candidateEvidence } from './evidence.mjs';
import { exists, json, prepareState, sha256, writeJson } from './common.mjs';
import { persistentResponse, restoreSqlite, snapshotSqlite } from './service.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'c-sqlite-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source.sqlite'), archive = path.join(directory, 'backup');
  const db = new DatabaseSync(source);
  db.exec("CREATE TABLE fixture(value TEXT);INSERT INTO fixture VALUES('snapshot');PRAGMA user_version=1;"); db.close();
  await snapshotSqlite(source, archive);
  return { directory, source, archive };
}
test('SQLite snapshot uses a consistent copy and preserves an occupied restore target', async t => {
  const { directory, source, archive } = await fixture(t);
  const db = new DatabaseSync(source); db.exec("INSERT INTO fixture VALUES('later');"); db.close();
  const target = path.join(directory, 'restored.sqlite'); await restoreSqlite(archive, target);
  const restored = new DatabaseSync(target, { readOnly: true });
  try { assert.deepEqual(restored.prepare('SELECT value FROM fixture').all().map(r => r.value), ['snapshot']); } finally { restored.close(); }
  const before = await fs.readFile(target);
  await assert.rejects(restoreSqlite(archive, target), { code: 'EEXIST' });
  assert.deepEqual(await fs.readFile(target), before);
});
test('corrupt SQLite backup is rejected before writing any restored database', async t => {
  const { directory, archive } = await fixture(t);
  await fs.appendFile(path.join(archive, 'rooms.sqlite'), 'corrupt');
  const target = path.join(directory, 'never.sqlite');
  await assert.rejects(restoreSqlite(archive, target), /mismatch/); assert.equal(await exists(target), false);
});
test('matching checksum cannot authorize a newer incompatible SQLite schema', async t => {
  const { directory, archive } = await fixture(t), file = path.join(archive, 'rooms.sqlite');
  const db = new DatabaseSync(file); db.exec('PRAGMA user_version=2'); db.close();
  const bytes = await fs.readFile(file), manifest = await json(path.join(archive, 'manifest.json'));
  await writeJson(path.join(archive, 'manifest.json'), { ...manifest, bytes: bytes.length, sha256: sha256(bytes) });
  const target = path.join(directory, 'never.sqlite');
  await assert.rejects(restoreSqlite(archive, target), /Unsupported room schema/); assert.equal(await exists(target), false);
});
test('a JSON rehearsal report cannot satisfy a SQLite candidate', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'c-context-test-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = { head: 'head', fingerprint: 'code' };
  await writeJson(path.join(directory, 'json.json'), { schemaVersion: 1, kind: 'load', game: 'basketball', storage: 'json', source });
  assert.deepEqual(await candidateEvidence(directory, 'basketball', source, 'sqlite'), []);
});
test('persistent comparison excludes only serverNow and retains all accounting fields', () => {
  const a = { serverNow: 1, me: { bank: { availablePoints: 25 } }, receipt: { requestId: 'id' } };
  assert.deepEqual(persistentResponse(a), persistentResponse({ ...a, serverNow: 2 }));
  assert.notDeepEqual(persistentResponse(a), persistentResponse({ ...a, me: { bank: { availablePoints: 26 } } }));
});
test('owned state cannot silently switch from JSON to SQLite', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'c-storage-owner-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await prepareState(directory, { storage: 'json' });
  await assert.rejects(prepareState(directory, { storage: 'sqlite' }), /fresh state directory/);
});
