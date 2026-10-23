#!/usr/bin/env node
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Blocked, Report, Server, assertGame, buildAssets, createRoom, exists, freePort, host, json, npmRun, prepareState, root, source, tempState, writeJson } from './basketball/common.mjs';
import { acceptance, acceptanceChecks, backupScenario, backupChecks, loadScenario, loadChecks, smoke, smokeChecks } from './basketball/scenarios.mjs';
import { browserScenario, browserChecks, browserSmokeChecks } from './basketball/browser.mjs';
import { candidateEvidence, requireEvidence, requireLoadEvidence } from './basketball/evidence.mjs';
import { serviceChecks, sqliteScenario } from './basketball/service.mjs';
import { featureChecks, featuresScenario } from './basketball/features.mjs';

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  game: { type: 'string', default: 'basketball' }, port: { type: 'string' },
  'state-dir': { type: 'string', default: path.join(root, 'server/data/c-integration') },
  out: { type: 'string' }, room: { type: 'string' }, action: { type: 'string' },
  'no-build': { type: 'boolean', default: false }, smoke: { type: 'boolean', default: false },
  'duration-ms': { type: 'string', default: '10000' }, 'timeout-ms': { type: 'string', default: '240000' },
  'budget-ms': { type: 'string', default: '500' }, selectors: { type: 'string' },
  storage: { type: 'string', default: 'json' }, 'rollback-ref': { type: 'string', default: '25ded6a5a72c7d422543c6dbd654f694fdd6ac83' },
  'evidence-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' },
  'service-gates': { type: 'boolean', default: false },
} });
const command = positionals[0];
if (flags.help || !command) {
  console.log(`Benchwarmers room QA tools (Node >=22)\n\nCommands: start, reset --room CODE, control --room CODE --action start|pause|resume,\nsmoke, accept, browser [--smoke] [--selectors FILE], backup, load, inventory, tracking, release, service --storage sqlite, features\n\n--storage json|sqlite selects only private rehearsal data. --service-gates adds SQLite/feature/rollback evidence to release.\nDefault game: basketball (requires A's additive contract). Use --game football for baseline checks.\nstart uses isolated persistent data; checks boot their own isolated server. --no-build reuses assets.\nAll results are JSON; exit 0 = passed, 1 = failed, 2 = blocked/unrun.`);
  process.exit(0);
}
assert.equal(positionals.length, 1, 'Use named flags after the command');
assert.ok(['start', 'reset', 'control', 'smoke', 'accept', 'browser', 'backup', 'load', 'inventory', 'tracking', 'release', 'service', 'features'].includes(command), 'Unknown command');
assert.ok(['basketball', 'football'].includes(flags.game), 'Use --game basketball or football');
assert.ok(['json', 'sqlite'].includes(flags.storage), 'Use --storage json or sqlite');
assert.ok(command !== 'backup' || flags.storage === 'json', 'Use service --storage sqlite for database backup/restore');
assert.ok(command !== 'service' || flags.storage === 'sqlite', 'The service gate requires --storage sqlite');
function integer(value, min, max) { const n = Number(value); assert.ok(Number.isSafeInteger(n) && n >= min && n <= max, `Expected integer between ${min} and ${max}`); return n; }
const timeout = integer(flags['timeout-ms'], 1000, 900000);
const duration = integer(flags['duration-ms'], 3000, 300000);
const budget = integer(flags['budget-ms'], 1, 10000);
const port = flags.port ? integer(flags.port, 1024, 65535) : undefined;
const kind = command === 'browser' && flags.smoke ? 'browser-smoke' : command === 'load' && duration < 60000 ? 'load-smoke' : command;
assert.ok(!flags.smoke || command === 'browser', '--smoke is only for browser');
const output = path.resolve(flags.out ?? path.join(root, 'server/data/c-evidence', `${Date.now()}-${kind}-${randomUUID().slice(0, 8)}.json`));
assert.equal(await exists(output), false, 'Refusing to replace existing evidence');
const report = new Report(kind, flags.game, output);
report.data.source = await source();
report.data.storage = flags.storage;
report.data.features = command === 'features';
let server;
const stop = async () => { if (server) await server.stop(); };
const required = {
  start: ['startup', 'selected-game'], reset: ['targeted-new-room'], control: ['targeted-host-action'],
  smoke: ['startup', ...smokeChecks], accept: ['startup', ...acceptanceChecks],
  browser: ['startup', ...browserChecks], 'browser-smoke': ['startup', ...browserSmokeChecks],
  backup: ['startup', ...backupChecks], load: ['startup', ...loadChecks], 'load-smoke': ['startup', ...loadChecks],
  inventory: ['hardware-inventory'], tracking: ['tracking-decision'],
  service: ['startup', ...acceptanceChecks, ...serviceChecks],
  features: ['startup', ...featureChecks, ...(flags.storage === 'sqlite' ? serviceChecks : [])],
  release: ['typecheck', 'tests', 'tooling-tests', 'assets', 'compatibility-basketball', 'compatibility-football', 'candidate-evidence', 'rollback-evidence', ...(flags['service-gates'] ? ['sqlite-evidence', 'tracking-decision'] : [])],
}[kind];
if (command !== 'start') for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  try {
    await stop();
    await report.check('interrupted', () => { throw new Blocked(`Runner interrupted by ${signal}`); });
    await report.finish(required);
  } finally { process.exit(signal === 'SIGINT' ? 130 : 143); }
});
try {
  if (['reset', 'control'].includes(command)) {
    await report.check(required[0], async () => {
      assert.match(flags.room ?? '', /^[A-Z0-9]{4,12}$/, 'An explicit --room CODE is required');
      const state = path.resolve(flags['state-dir']);
      const owner = await json(path.join(state, 'owner.json'));
      assert.equal(owner.tool, 'benchwarmers-worker-c'); assert.equal(owner.root, await fs.realpath(root));
      const lock = await json(path.join(state, 'server.lock')); process.kill(lock.pid, 0);
      assert.equal(lock.storage ?? 'json', flags.storage, 'Storage flag does not match the running rehearsal');
      const saved = await json(path.join(state, 'credentials.json'));
      const previous = saved.rooms[flags.room]; assert.ok(previous, 'Room is not owned by this demo state'); report.secret(previous.hostToken);
      const target = new Server(state, lock.port, report);
      const view = (await target.request(`/api/rooms/${flags.room}`)).body; assertGame(view, flags.game);
      assert.equal(view.season.id, previous.seasonId, 'Room identity changed');
      if (command === 'control') {
        assert.ok(['start', 'pause', 'resume'].includes(flags.action), 'Choose an explicit --action start|pause|resume');
        await host(target, { code: flags.room, hostToken: previous.hostToken }, flags.action);
        return { room: flags.room, action: flags.action };
      }
      // No room deletion or whole-season reset endpoint is assumed. Replace only the explicitly selected rehearsal target.
      const next = await createRoom(target, flags.game, report);
      saved.rooms[next.code] = { hostToken: next.hostToken, seasonId: next.view.season.id };
      await writeJson(path.join(state, 'credentials.json'), saved);
      console.log(`Replacement room: ${next.code}. Previous room ${flags.room} preserved.`);
      return { previousRoom: flags.room, replacementRoom: next.code, previousPreserved: true };
    });
  } else if (command === 'inventory') {
    await report.check('hardware-inventory', async () => {
      const devicePaths = ['/dev/snd', '/dev/video0', '/dev/nvidia0'];
      const devices = [];
      for (const device of devicePaths) devices.push({ path: device, exposed: await exists(device) });
      const variableNames = ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'CHROMIUM_PATH'];
      return { platform: os.platform(), arch: os.arch(), logicalCpus: os.availableParallelism(), memoryBytes: os.totalmem(), devices, bindings: variableNames.map(name => ({ name, present: !!process.env[name] })), microphone: 'not verified', echo: 'not accessible', alexaConsole: 'not verified', speech: 'browser simulation only; no hardware claim' };
    });
  } else if (command === 'tracking') {
    await report.check('tracking-decision', async () => {
      // A safe gate decision is possible without fabricating measurements.
      report.data.decision = 'NO-GO';
      report.data.limitations.push('No licensed time-series feed or measured real-game freshness/interaction data is available. A provides normalization tests and B synthetic rendering tests; these do not establish continuous tracking.');
      return { decision: 'NO-GO', capability: 'continuous ball tracking', evidence: [], permittedDemo: 'scripted score and team possession', reopenWhen: 'licensed timestamped observations, measured gaps/latency and demonstrated fair prediction windows' };
    });
  } else if (command === 'release') {
    for (const [name, script] of [['typecheck', 'typecheck'], ['tests', 'test'], ['tooling-tests', 'test:integration-tools']]) await report.check(name, () => npmRun(script));
    await report.check('assets', buildAssets);
    for (const [name, game] of [['compatibility-basketball', 'harbor-vs-summit'], ['compatibility-football', 'riverton-vs-ironwood']]) {
      await report.check(name, async () => {
        const { run } = await import('./basketball/common.mjs');
        await run(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'server/scripts/play-party.ts'), '--game', game], { cwd: path.join(root, 'server') });
      });
    }
    const readEvidence = () => candidateEvidence(flags['evidence-dir'], flags.game, report.data.source, flags.storage);
    await report.check('candidate-evidence', async () => {
      const reports = await readEvidence();
      requireEvidence(reports, 'accept', acceptanceChecks); requireEvidence(reports, 'browser', browserChecks); requireLoadEvidence(reports, loadChecks);
      return { fingerprint: report.data.source.fingerprint, deployment: 'not performed', scope: 'local demo candidate only; wider service gates remain manual' };
    });
    await report.check('rollback-evidence', async () => { requireEvidence(await readEvidence(), 'backup', backupChecks); return { scope: 'isolated JSON-file restore; production rollback and database migrations unverified' }; });
    if (flags['service-gates']) {
      await report.check('sqlite-evidence', async () => {
        const reports = await candidateEvidence(flags['evidence-dir'], flags.game, report.data.source, 'sqlite');
        requireEvidence(reports, 'service', [...acceptanceChecks, ...serviceChecks]);
        requireEvidence(reports, 'features', [...featureChecks, ...serviceChecks]);
        requireEvidence(reports, 'browser', browserChecks);
        const loads = requireLoadEvidence(reports, loadChecks);
        assert.ok(new Set(loads.map(r => r.runId)).size >= 2, 'Two distinct passing SQLite load runs are required');
        return { scope: 'single-node rehearsal, legacy bearer policy; strict-session HTTPS and production topology unverified', loads: loads.map(r => ({ runId: r.runId, p95Ms: r.metrics.p95Ms })) };
      });
      await report.check('tracking-decision', async () => {
        const reports = await candidateEvidence(flags['evidence-dir'], flags.game, report.data.source, 'json');
        requireEvidence(reports, 'tracking', ['tracking-decision']);
        assert.ok(reports.some(r => r.kind === 'tracking' && r.status === 'passed' && r.decision === 'NO-GO'));
        return { decision: 'NO-GO', capability: 'continuous ball tracking', demo: 'scripted score and possession only' };
      });
    }
  } else {
    const persistent = command === 'start';
    const state = persistent ? await prepareState(path.resolve(flags['state-dir']), { storage: flags.storage }) : await tempState(flags.storage);
    report.data.stateDirectory = state;
    server = new Server(state, port ?? (persistent ? 3037 : await freePort()), report, { storage: flags.storage, features: command === 'features' });
    const ready = await report.check('startup', async () => {
      if (!flags['no-build']) await buildAssets();
      assert.ok(await exists(path.join(root, 'web/dist/index.html')), 'Missing built web assets');
      assert.ok(await exists(path.join(root, 'server/src/mcp/widget/dist/benchwarmers.html')), 'Missing built MCP widget');
      await server.start();
      return { isolatedData: true, storage: flags.storage, port: server.port, assets: flags['no-build'] ? 'reused at caller request' : 'rebuilt' };
    });
    if (ready) {
      if (command === 'start') {
        const selected = await report.check('selected-game', async () => {
          const room = await createRoom(server, flags.game, report);
          const file = path.join(state, 'credentials.json');
          const saved = await exists(file) ? await json(file) : { rooms: {} };
          saved.rooms[room.code] = { hostToken: room.hostToken, seasonId: room.view.season.id };
          await writeJson(file, saved);
          console.log(`C ${flags.game} demo room: ${room.code}. Port ${server.port}. Join path /room/${room.code}.`);
          console.log(`Host from a second terminal: npm run demo:basketball:control -- --room ${room.code} --action start${flags.game === 'football' ? ' --game football' : ''}${flags.storage === 'sqlite' ? ' --storage sqlite' : ''}`);
          return { room: room.code };
        });
        if (selected) {
          const signal = await Promise.race([new Promise(resolve => { process.once('SIGINT', () => resolve('SIGINT')); process.once('SIGTERM', () => resolve('SIGTERM')); }), server.exited.then(() => 'unexpected-exit')]);
          assert.notEqual(signal, 'unexpected-exit', 'Demo server exited unexpectedly');
        }
      } else if (command === 'smoke') await smoke(server, flags.game, report);
      else if (command === 'service') {
        const context = await acceptance(server, flags.game, report, timeout);
        if (context) await sqliteScenario(server, context, report, flags['rollback-ref']);
      }
      else if (command === 'features') {
        const context = await featuresScenario(server, report, timeout);
        if (context && flags.storage === 'sqlite') await sqliteScenario(server, context, report, flags['rollback-ref']);
      }
      else if (command === 'accept') await acceptance(server, flags.game, report, timeout);
      else if (command === 'browser') await browserScenario(server, flags.game, report, { smoke: flags.smoke, selectors: flags.selectors, timeout });
      else if (command === 'backup') await backupScenario(server, flags.game, report);
      else if (command === 'load') await loadScenario(server, flags.game, report, duration, budget);
    }
  }
} catch (error) {
  await report.check('runner', () => { throw error; });
} finally {
  try { await stop(); } catch (error) { await report.check('shutdown', () => { throw error; }); }
}
const currentSource = await source();
if (currentSource.fingerprint !== report.data.source.fingerprint || currentSource.head !== report.data.source.head) await report.check('source-stability', () => { throw new Error('Source changed during validation. Rerun against a stable candidate.'); });
process.exitCode = await report.finish(required);
