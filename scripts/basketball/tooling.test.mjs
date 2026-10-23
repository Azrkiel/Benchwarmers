import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Blocked, Report, Server, assertGame, exists, prepareState, sha256, writeJson } from './common.mjs';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { backup, restore } from './storage.mjs';
import { candidateEvidence, requireEvidence, requireLoadEvidence } from './evidence.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('service transport preserves UTF-8 JSON, credentials and status assertions', async t => {
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    res.writeHead(req.url === '/status' ? 418 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, authorization: req.headers.authorization, body: text ? JSON.parse(text) : null }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new Server('', server.address().port);
  const result = await client.request('/echo', { body: { name: 'Zoë 🏀' }, token: 'synthetic-credential' });
  assert.deepEqual(result.body, { method: 'POST', authorization: 'Bearer synthetic-credential', body: { name: 'Zoë 🏀' } });
  assert.equal((await client.request('/status', { expected: 418 })).status, 418);
  await assert.rejects(client.request('/status'), /expected 200, got 418/);
});

test('service deadline covers both stalled headers and a stalled response body', async t => {
  const server = createServer((req, res) => {
    if (req.url === '/body') { res.writeHead(200); res.write('{'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const client = new Server('', server.address().port);
  for (const route of ['/headers', '/body']) await assert.rejects(client.request(route, { timeout: 50 }), error => error.name === 'AbortError');
});

test('a paused controller can read again after the server expires its idle connection', async t => {
  // A separate server thread can expire a socket while the controller is paused.
  const worker = new Worker(`
    const {parentPort}=require('node:worker_threads');
    const server=require('node:http').createServer((_req,res)=>{res.setHeader('Keep-Alive','timeout=5');res.end('{"ok":true}');});
    server.keepAliveTimeout=1; server.keepAliveTimeoutBuffer=0;
    server.listen(0,'127.0.0.1',()=>parentPort.postMessage(server.address().port));
  `, { eval: true });
  t.after(() => worker.terminate());
  const port = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  const client = new Server('', port);
  assert.equal((await client.request('/')).body.ok, true);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  assert.equal((await client.request('/')).body.ok, true);
});

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
