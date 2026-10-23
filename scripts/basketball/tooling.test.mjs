import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Blocked, Report, assertGame, exists, prepareState, sha256, writeJson } from './common.mjs';
import { backup, restore } from './storage.mjs';
import { candidateEvidence, requireEvidence, requireLoadEvidence } from './evidence.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-c-tooltest-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir;
}
async function fixture(t) {
  const dir = await directory(t);
  const state = await prepareState(path.join(dir, 'state'));
  for (const name of ['store.json', 'rooms.json']) await writeJson(path.join(state, 'data', name), { example: [1, 2], credential: 'test-only-not-a-secret' });
  const archive = path.join(dir, 'backup'); await backup(state, archive);
  return { dir, state, archive };
}
test('restore roundtrip retains exact bytes and refuses an existing destination', async t => {
  const { dir, state, archive } = await fixture(t); const target = path.join(dir, 'restored');
  await restore(archive, target);
  for (const name of ['store.json', 'rooms.json']) assert.deepEqual(await fs.readFile(path.join(target, name)), await fs.readFile(path.join(state, 'data', name)));
  await assert.rejects(restore(archive, target), { code: 'EEXIST' });
  await assert.rejects(backup(state, archive), { code: 'EEXIST' });
});
test('corruption fails before creating the target', async t => {
  const { dir, archive } = await fixture(t);
  await fs.appendFile(path.join(archive, 'rooms.json'), 'bad');
  const target = path.join(dir, 'never-created');
  await assert.rejects(restore(archive, target), /mismatch/); assert.equal(await exists(target), false);
});
test('unsafe backup manifests cannot traverse to another destination', async t => {
  const { dir, archive } = await fixture(t);
  const file = path.join(archive, 'manifest.json'); const manifest = JSON.parse(await fs.readFile(file));
  manifest.files[0].name = '../outside.json'; await writeJson(file, manifest);
  await assert.rejects(restore(archive, path.join(dir, 'restore')), /Unexpected backup file list/);
  assert.equal(await exists(path.join(dir, 'outside.json')), false);
});
test('backup refuses a running state and setup refuses unrelated user files', async t => {
  const { dir, state } = await fixture(t);
  await writeJson(path.join(state, 'server.lock'), { pid: process.pid });
  await assert.rejects(backup(state, path.join(dir, 'live-backup')), /Stop the owned server/);
  const occupied = path.join(dir, 'user-files'); await fs.mkdir(occupied); await fs.writeFile(path.join(occupied, 'important'), 'keep');
  await assert.rejects(prepareState(occupied), /nonempty/);
  assert.equal(await fs.readFile(path.join(occupied, 'important'), 'utf8'), 'keep');
});
test('integrity checks retain parseable JSON requirement even with matching digest', async t => {
  const { dir, archive } = await fixture(t);
  const bytes = Buffer.from('not-json'); await fs.writeFile(path.join(archive, 'rooms.json'), bytes);
  const file = path.join(archive, 'manifest.json'); const manifest = JSON.parse(await fs.readFile(file));
  Object.assign(manifest.files.find(f => f.name === 'rooms.json'), { bytes: bytes.length, sha256: sha256(bytes) }); await writeJson(file, manifest);
  await assert.rejects(restore(archive, path.join(dir, 'restore')), SyntaxError);
});
test('a football substitution cannot satisfy the basketball gate', () => {
  assert.throws(() => assertGame({ room: { code: 'ABC123' }, players: [{}], game: { driveCount: 12 } }, 'basketball'), Blocked);
  assert.throws(() => assertGame({ room: { code: 'ABC123', gameId: 'harbor-vs-summit' }, players: [{}], game: { sport: 'football' } }, 'basketball'), Blocked);
  assertGame({ room: { code: 'ABC123', gameId: 'harbor-vs-summit' }, players: [{}], game: { sport: 'basketball' } }, 'basketball');
});
test('missing required checks block readiness and secrets are redacted from evidence', async t => {
  const dir = await directory(t); const file = path.join(dir, 'report.json');
  const report = new Report('accept', 'basketball', file); report.secret('fake-sensitive-token');
  await report.check('first', () => ({ sample: 'fake-sensitive-token' }));
  assert.equal(await report.finish(['first', 'second']), 2);
  const text = await fs.readFile(file, 'utf8'); assert.ok(!text.includes('fake-sensitive-token'));
  const data = JSON.parse(text); assert.equal(data.status, 'blocked'); assert.equal(data.checks.find(c => c.name === 'second').status, 'unrun');
});
test('a failed assertion cannot be converted into a passed report', async t => {
  const dir = await directory(t); const report = new Report('accept', 'basketball', path.join(dir, 'report.json'));
  await report.check('arithmetic', () => assert.equal(1, 2));
  assert.equal(await report.finish(['arithmetic']), 1);
});
test('release gate excludes stale sources, other games and partial reports', async t => {
  const dir = await directory(t); const source = { head: 'candidate-commit', fingerprint: 'candidate-code' };
  const base = { schemaVersion: 1, game: 'basketball', kind: 'browser', source, status: 'passed', checks: [{ name: 'final', status: 'passed' }] };
  await writeJson(path.join(dir, 'stale.json'), { ...base, source: { ...source, fingerprint: 'old-code' } });
  await writeJson(path.join(dir, 'other-game.json'), { ...base, game: 'football' });
  assert.deepEqual(await candidateEvidence(dir, 'basketball', source), []);
  await writeJson(path.join(dir, 'partial.json'), { ...base, kind: 'browser-smoke' });
  assert.throws(() => requireEvidence([base], 'browser', ['final', 'receipt']), Blocked);
  assert.throws(() => requireEvidence([{ ...base, status: 'blocked' }], 'browser', ['final']), Blocked);
  await writeJson(path.join(dir, 'valid.json'), base);
  const reports = await candidateEvidence(dir, 'basketball', source);
  requireEvidence(reports, 'browser', ['final']);
  assert.throws(() => requireEvidence(reports, 'browser', ['receipt']), Blocked);
});
test('a disconnected controller terminates its owned server child', async t => {
  const guard = pathToFileURL(fileURLToPath(new URL('./parent-guard.mjs', import.meta.url))).href;
  const child = spawn(process.execPath, ['--import', guard, '-e', 'process.send("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.disconnect();
  let timer;
  try {
    const result = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Child survived parent disconnection')), 3000); })]);
    assert.ok(result.signal === 'SIGTERM' || result.code !== 0);
  } finally { clearTimeout(timer); }
});
test('a short or relaxed-budget load smoke cannot pass the candidate gate', () => {
  const base = { kind: 'load', status: 'passed', checks: [{ name: 'load-32-clients', status: 'passed' }], metrics: { clients: 32, durationMs: 60000, budgetP95Ms: 500, p95Ms: 30, errors: 0, writes: 32, minimumReadsPerClient: 10 } };
  requireLoadEvidence([base], ['load-32-clients']);
  for (const change of [{ durationMs: 10000 }, { budgetP95Ms: 1000 }, { errors: 1 }, { writes: 0 }]) assert.throws(() => requireLoadEvidence([{ ...base, metrics: { ...base.metrics, ...change } }], ['load-32-clients']), Blocked);
});
test('another process cannot replace evidence while a run is in progress', async t => {
  const dir = await directory(t); const file = path.join(dir, 'report.json');
  const report = new Report('smoke', 'football', file);
  await report.check('check', () => {});
  await fs.writeFile(file, 'another-run-must-survive', { flag: 'wx' });
  await assert.rejects(report.finish(['check']), { code: 'EEXIST' });
  assert.equal(await fs.readFile(file, 'utf8'), 'another-run-must-survive');
});
