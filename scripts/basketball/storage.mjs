import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, json, sha256, writeJson } from './common.mjs';

const names = ['store.json', 'rooms.json'];
export async function backup(state, destination) {
  assert.equal(await exists(path.join(state, 'server.lock')), false, 'Stop the owned server before taking a consistent backup');
  assert.equal((await json(path.join(state, 'owner.json'))).tool, 'benchwarmers-worker-c');
  // Exclusive creation: never overwrite an existing backup, including user files.
  await fs.mkdir(destination, { mode: 0o700 });
  const files = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.join(state, 'data', name));
    JSON.parse(bytes.toString('utf8'));
    await fs.writeFile(path.join(destination, name), bytes, { mode: 0o600, flag: 'wx' });
    files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = { schemaVersion: 1, adapter: 'json-files', createdAt: new Date().toISOString(), files };
  await writeJson(path.join(destination, 'manifest.json'), manifest);
  return manifest;
}
export async function restore(archive, destination) {
  const manifest = await json(path.join(archive, 'manifest.json'));
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.adapter, 'json-files');
  assert.deepEqual(manifest.files.map(f => f.name).sort(), [...names].sort(), 'Unexpected backup file list');
  const verified = [];
  for (const entry of manifest.files) {
    const bytes = await fs.readFile(path.join(archive, entry.name));
    assert.equal(bytes.length, entry.bytes, 'Backup length mismatch');
    assert.equal(sha256(bytes), entry.sha256, 'Backup checksum mismatch');
    JSON.parse(bytes.toString('utf8')); verified.push([entry.name, bytes]);
  }
  // Verification precedes creation; the target must be absent.
  await fs.mkdir(destination, { mode: 0o700 });
  for (const [name, bytes] of verified) await fs.writeFile(path.join(destination, name), bytes, { mode: 0o600, flag: 'wx' });
  return manifest;
}
