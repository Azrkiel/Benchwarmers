import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Server, exists, freePort, json, root, run, sha256, tempState, writeJson } from './common.mjs';

export const serviceChecks = ['sqlite-snapshot', 'sqlite-restore', 'sqlite-corruption-rejected', 'sqlite-overwrite-rejected', 'compatible-rollback'];
// serverNow is a response clock, not durable game/accounting state. All other fields are compared.
export function persistentResponse(value) { const { serverNow, ...rest } = value; return rest; }
export async function snapshotSqlite(source, archive) {
  assert.ok(await exists(source), 'Source database must already exist');
  await fs.mkdir(archive, { mode: 0o700 });
  const output = path.join(archive, 'rooms.sqlite');
  await run(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/basketball/sqlite-helper.mjs'), source, output]);
  const bytes = await fs.readFile(output);
  const manifest = { schemaVersion: 1, adapter: 'sqlite', createdAt: new Date().toISOString(), bytes: bytes.length, sha256: sha256(bytes) };
  await writeJson(path.join(archive, 'manifest.json'), manifest);
  return manifest;
}
export async function restoreSqlite(archive, destination) {
  const { DatabaseSync } = await import('node:sqlite');
  const manifest = await json(path.join(archive, 'manifest.json'));
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.adapter, 'sqlite');
  const source = path.join(archive, 'rooms.sqlite'), bytes = await fs.readFile(source);
  assert.equal(bytes.length, manifest.bytes, 'Backup length mismatch');
  assert.equal(sha256(bytes), manifest.sha256, 'Backup checksum mismatch');
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0', 'Invalid SQLite header');
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1, 'Unsupported room schema');
  } finally { db.close(); }
  await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
  return manifest;
}
export async function previousBuild(reference, directory) {
  assert.match(reference, /^[0-9a-f]{7,40}$/, 'Rollback ref must be a recorded commit SHA');
  const commit = execFileSync('git', ['rev-parse', '--verify', `${reference}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root });
  const lock = execFileSync('git', ['show', `${commit}:package-lock.json`], { cwd: root });
  assert.equal(sha256(lock), sha256(await fs.readFile(path.join(root, 'package-lock.json'))), 'Previous build needs a separately installed dependency set; refusing to reuse incompatible node_modules');
  await fs.mkdir(directory, { mode: 0o700 });
  const archive = path.join(directory, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, commit], { cwd: root });
  await run('tar', ['-xf', archive, '-C', directory]);
  await fs.symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return { commit, lockfileSha256: sha256(lock) };
}
export async function sqliteScenario(server, context, report, rollbackRef) {
  assert.equal(server.storage, 'sqlite');
  const { room, seat, requestId } = context;
  const endpoints = [{ route: `/api/rooms/${room.code}`, token: seat.participantToken }, { route: `/api/rooms/${room.code}/receipts/${requestId}`, token: seat.participantToken }, ...(context.extraCaptures ?? [])];
  const before = [];
  for (const endpoint of endpoints) before.push(persistentResponse((await server.request(endpoint.route, { token: endpoint.token })).body));
  assert.equal(before[0].room.phase, 'final', 'Storage acceptance requires a completed game');
  const archive = path.join(server.directory, 'sqlite-backup');
  if (!await report.check('sqlite-snapshot', async () => {
    const manifest = await snapshotSqlite(path.join(server.directory, 'data/rooms.sqlite'), archive);
    for (let i = 0; i < endpoints.length; i++) assert.deepEqual(persistentResponse((await server.request(endpoints[i].route, { token: endpoints[i].token })).body), before[i], 'Snapshot changed live state');
    return { ...manifest, method: 'VACUUM INTO through SqliteRoomRepository.backup', sourceProcess: 'running', scope: 'completed fixture; no concurrent-write timing claim' };
  })) return;
  const verify = async (checkoutRoot = root, options = {}) => {
    const state = await tempState('sqlite');
    await restoreSqlite(archive, path.join(state, 'data/rooms.sqlite'));
    const restored = new Server(state, await freePort(), report, { storage: 'sqlite', checkoutRoot, ...options });
    try {
      await restored.start();
      for (let i = 0; i < endpoints.length; i++) assert.deepEqual(persistentResponse((await restored.request(endpoints[i].route, { token: endpoints[i].token })).body), before[i]);
      // A retry of accepted input must recover the receipt, without duplicating settlement or season totals.
      const receipt = before[1].receipt ?? before[1];
      await restored.request(`/api/rooms/${room.code}${context.retryRoute ?? '/picks'}`, { body: context.retryBody ?? { participantToken: seat.participantToken, requestId, questionId: receipt.questionId, optionId: receipt.optionId } });
      assert.deepEqual(persistentResponse((await restored.request(endpoints[0].route, { token: seat.participantToken })).body), before[0]);
    } finally { await restored.stop(); }
  };
  await report.check('sqlite-restore', async () => { await verify(); return { preserved: ['final score', 'seat credential', 'lineup', 'receipt', 'standings', 'season', ...(context.extraCaptures?.length ? ['private feature state'] : [])] }; });
  await report.check('sqlite-overwrite-rejected', async () => {
    const target = path.join(server.directory, 'occupied.sqlite');
    await fs.writeFile(target, 'must survive', { flag: 'wx' });
    await assert.rejects(restoreSqlite(archive, target), { code: 'EEXIST' });
    assert.equal(await fs.readFile(target, 'utf8'), 'must survive');
    await assert.rejects(snapshotSqlite(path.join(server.directory, 'data/rooms.sqlite'), archive), { code: 'EEXIST' });
  });
  await report.check('sqlite-corruption-rejected', async () => {
    const damaged = path.join(server.directory, 'damaged-backup'); await fs.cp(archive, damaged, { recursive: true });
    await fs.appendFile(path.join(damaged, 'rooms.sqlite'), 'damage');
    const target = path.join(server.directory, 'never-created.sqlite');
    await assert.rejects(restoreSqlite(damaged, target), /mismatch/); assert.equal(await exists(target), false);
  });
  await report.check('compatible-rollback', async () => {
    const directory = path.join(server.directory, 'previous-build');
    const metadata = await previousBuild(rollbackRef, directory);
    await verify(directory);
    return { ...metadata, deployment: 'not performed', migration: 'schema 1 -> compatible schema 1', scope: 'previous scripted server, same locked dependencies, separate restored database' };
  });
}
