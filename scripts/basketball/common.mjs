import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export class Blocked extends Error {}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
export async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function writeJson(file, data, { exclusive = false } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (exclusive) {
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return;
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await fs.rename(temp, file);
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code ?? signal}`)));
  });
}
// Use npm's PATH wrapper on Windows, where npm itself is a .cmd file.
export async function npmRun(script) {
  if (process.env.npm_execpath) return run(process.execPath, [process.env.npm_execpath, 'run', script]);
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { shell: process.platform === 'win32' });
}
export async function source() {
  const { execFileSync } = await import('node:child_process');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    if (!/^(server\/|web\/|scripts\/|package(?:-lock)?\.json$)/.test(file) || /\/(data|dist|node_modules)\//.test(file)) continue;
    hash.update(file + '\0');
    try { hash.update(await fs.readFile(path.join(root, file))); } catch (e) { if (e.code !== 'ENOENT') throw e; hash.update('DELETED'); }
  }
  return { head, fingerprint: hash.digest('hex') };
}
export class Report {
  constructor(kind, game, output) {
    this.data = { schemaVersion: 1, runId: randomUUID(), kind, game, startedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, checks: [], limitations: [] };
    this.output = output;
    this.secrets = new Set();
  }
  secret(value) { if (value) this.secrets.add(value); return value; }
  redact(text) { for (const secret of this.secrets) text = text.split(secret).join('[REDACTED]'); return text; }
  async check(name, action) {
    const started = performance.now();
    try {
      const detail = await action();
      this.data.checks.push({ name, status: 'passed', ms: Math.round(performance.now() - started), ...(detail === undefined ? {} : { detail }) });
      console.log(`PASS ${name}`); return true;
    } catch (error) {
      const status = error instanceof Blocked ? 'blocked' : 'failed';
      this.data.checks.push({ name, status, ms: Math.round(performance.now() - started), message: this.redact(error.message) });
      console.log(`${status.toUpperCase()} ${name}: ${this.redact(error.message)}`); return false;
    }
  }
  async finish(required) {
    const names = this.data.checks.map(c => c.name);
    assert.equal(new Set(names).size, names.length, 'duplicate check names');
    for (const name of required) if (!names.includes(name)) this.data.checks.push({ name, status: 'unrun', message: 'A prerequisite did not complete.' });
    this.data.source = await source();
    this.data.completedAt = new Date().toISOString();
    this.data.status = this.data.checks.some(c => c.status === 'failed') ? 'failed' : required.length > 0 && this.data.checks.every(c => c.status === 'passed') && required.every(name => this.data.checks.some(c => c.name === name && c.status === 'passed')) ? 'passed' : 'blocked';
    await writeJson(this.output, JSON.parse(this.redact(JSON.stringify(this.data))), { exclusive: true });
    console.log(`Evidence: ${this.output}`);
    return this.data.status === 'passed' ? 0 : this.data.status === 'failed' ? 1 : 2;
  }
}
export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
export async function prepareState(directory, metadata = {}) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const marker = path.join(directory, 'owner.json');
  const actual = await fs.realpath(directory);
  if (await exists(marker)) {
    const previous = await json(marker);
    assert.equal(previous.tool, 'benchwarmers-worker-c');
    assert.equal(previous.root, await fs.realpath(root), 'State belongs to a different checkout');
  } else {
    assert.equal((await fs.readdir(directory)).length, 0, 'Refusing to adopt a nonempty state directory');
    await writeJson(marker, { tool: 'benchwarmers-worker-c', root: await fs.realpath(root), ...metadata });
  }
  await fs.mkdir(path.join(actual, 'data'), { recursive: true, mode: 0o700 });
  return actual;
}
// Build through the repository's existing scripts.
export async function buildAssets() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const invoke = args => process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args]) : run(command, args, { shell: process.platform === 'win32' });
  await invoke(['run', 'build:widget', '-w', 'server']);
  await invoke(['run', 'build', '-w', 'web']);
}
export class Server {
  constructor(directory, port, report) { this.directory = directory; this.port = port; this.report = report; this.base = `http://127.0.0.1:${port}`; }
  async start() {
    assert.ok(!this.child, 'Server already running');
    // Never attach to or terminate an existing listener on the requested port.
    const listener = net.createServer();
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(this.port, '0.0.0.0', resolve); });
    await new Promise(resolve => listener.close(resolve));
    this.lock = await fs.open(path.join(this.directory, 'server.lock'), 'wx', 0o600);
    await this.lock.writeFile(JSON.stringify({ pid: process.pid, port: this.port }));
    const log = await fs.open(path.join(this.directory, 'server.log'), 'a', 0o600);
    this.token = this.report?.secret(randomUUID()) ?? randomUUID();
    const child = spawn(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(path.join(root, 'scripts/basketball/parent-guard.mjs')).href, path.join(root, 'server/src/index.ts')], {
      cwd: path.join(root, 'server'), stdio: ['ignore', log.fd, log.fd, 'ipc'],
      env: { ...process.env, PORT: String(this.port), DATA_FILE: path.join(this.directory, 'data/store.json'), ROOM_DATA_FILE: path.join(this.directory, 'data/rooms.json'), AI_MODE: 'fallback', ASSISTANT_MODE: 'offline', MCP_TOKEN: this.token, ALLOWED_HOSTS: 'localhost,127.0.0.1', SPEED: '4', ROOM_SPEED: '4' },
    });
    this.child = child;
    let launchError;
    child.once('error', error => { launchError = error; });
    this.exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    await log.close();
    try {
      await until(async () => {
        if (launchError) throw launchError;
        assert.equal(child.exitCode, null, 'Server exited; inspect private server.log');
        try { return (await this.request('/healthz')).body.ok; } catch (e) { if (child.exitCode !== null) throw e; return false; }
      }, 30000, 'Server readiness');
    } catch (e) { await this.stop(); throw e; }
  }
  async stop() {
    const child = this.child;
    if (!child) { await this.unlock(); return; }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    let timer;
    try { await Promise.race([this.exited, new Promise((_, reject) => { timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Server required forced shutdown; clean storage snapshot is unsafe')); }, 10000); })]); }
    finally {
      clearTimeout(timer); this.child = undefined;
      await this.unlock();
    }
  }
  async unlock() {
    if (!this.lock) return;
    await this.lock.close(); this.lock = undefined;
    await fs.unlink(path.join(this.directory, 'server.lock'));
  }
  async request(route, { body, token, expected = 200, timeout = 10000 } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    // Each probe owns its socket: a paused controller must not reuse an idle
    // connection the server expired. No hidden retries or relaxed deadlines.
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest(this.base + route, {
        method: payload === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(timeout), agent: false,
        headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }, response => {
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, text }));
      });
      request.on('error', reject); request.end(payload);
    });
    const text = response.text;
    let data; try { data = JSON.parse(text); } catch { data = text; }
    assert.equal(response.status, expected, `${route}: expected ${expected}, got ${response.status} (${data?.code ?? 'no error code'})`);
    return { status: response.status, body: data };
  }
}
export async function until(action, timeout, description) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await action(); if (result) return result; await sleep(200); }
  throw new Error(`Timed out: ${description}`);
}
export function assertGame(view, game) {
  assert.ok(view?.room?.code && view.players?.length, 'Malformed room snapshot');
  if (game === 'football') {
    const sport = view.game?.sport ?? view.room?.sport;
    assert.ok(sport === 'football' || (!sport && view.game?.driveCount > 0), 'Not a football room');
  } else {
    const id = view.game?.id ?? view.room?.gameId ?? view.game?.gameId;
    if (id !== 'harbor-vs-summit' || (view.game?.sport ?? view.room?.sport) !== 'basketball') throw new Blocked('Basketball contract unavailable: require game id harbor-vs-summit and sport basketball; refusing football substitution.');
  }
}
export async function createRoom(server, game, report) {
  const result = (await server.request('/api/rooms', { body: { name: `C ${game} acceptance`, seasonId: `c-${randomUUID().slice(0, 12)}`, speed: 4, ...(game === 'basketball' ? { gameId: 'harbor-vs-summit' } : {}) }, expected: 201 })).body;
  report?.secret(result.hostToken);
  assertGame(result.view, game);
  assert.ok(result.hostToken, 'Missing host credential');
  return { code: result.view.room.code, hostToken: result.hostToken, view: result.view };
}
export async function join(server, room, name, report) {
  const result = (await server.request(`/api/rooms/${room.code}/join`, { body: { name }, expected: 201 })).body;
  assert.ok(result.participantToken); report?.secret(result.participantToken); return result;
}
export const roomPath = room => `/api/rooms/${room.code}`;
export const host = (server, room, action) => server.request(`${roomPath(room)}/host`, { body: { hostToken: room.hostToken, action } });
export async function tempState() { return prepareState(await fs.mkdtemp(path.join(os.tmpdir(), 'bw-c-'))); }
