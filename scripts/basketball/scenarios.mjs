import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Blocked, Server, assertGame, createRoom, freePort, host, join, roomPath, sleep, until } from './common.mjs';
import { backup, restore } from './storage.mjs';

export const smokeChecks = ['room-contract', 'join-lineup', 'authorization', 'voice-service', 'pause-restart'];
export const acceptanceChecks = [...smokeChecks, 'durable-receipts', 'request-id-conflict', 'lost-response-retry', 'lock-boundary', 'final-season-restart'];
export async function smoke(server, game, report) {
  let room, seat;
  if (!await report.check('room-contract', async () => {
    assert.equal((await server.request('/healthz')).body.ok, true);
    const page = await server.request('/'); assert.match(page.body, /<div id="root"/);
    room = await createRoom(server, game, report);
    return { code: room.code, game };
  })) return;
  if (!await report.check('join-lineup', async () => {
    seat = await join(server, room, 'C Maya', report);
    const view = (await server.request(`${roomPath(room)}/auto-lineup`, { body: { participantToken: seat.participantToken } })).body;
    const lineup = view.me.lineup;
    assert.equal(lineup.flexIds.length, 4); assert.equal(new Set([lineup.captainId, ...lineup.flexIds]).size, 5);
    assert.ok(lineup.salaryUsed <= view.rules.salaryCap);
    const invalid = await server.request(`${roomPath(room)}/lineup`, { body: { participantToken: seat.participantToken, captainId: lineup.captainId, flexIds: Array(4).fill(lineup.captainId) }, expected: 400 });
    assert.ok(invalid.body.code);
    const saved = (await server.request(roomPath(room), { token: seat.participantToken })).body;
    assert.deepEqual(saved.me.lineup, lineup);
  })) return;
  await report.check('authorization', async () => {
    await server.request(`${roomPath(room)}/host`, { body: { hostToken: 'c-invalid-credential', action: 'start' }, expected: 401 });
    await server.request(roomPath(room), { token: 'c-invalid-credential', expected: 401 });
    const publicView = (await server.request(roomPath(room))).body;
    assert.ok(!publicView.me);
    const serialized = JSON.stringify(publicView);
    for (const token of [room.hostToken, seat.participantToken]) assert.ok(!serialized.includes(token), 'Public view exposed a private credential');
  });
  await report.check('voice-service', async () => {
    const reply = (await server.request(`${roomPath(room)}/assistant`, { body: { text: "what's the score?", participantToken: seat.participantToken } })).body;
    assert.ok(reply.reply?.length > 5); assert.equal(reply.view.room.code, room.code);
    const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
    const client = new Client({ name: 'worker-c-acceptance', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
      const { tools } = await client.listTools(); assert.ok(tools.some(t => t.name === 'room_status'));
      const result = await client.callTool({ name: 'room_status', arguments: { code: room.code } }); assert.ok(!result.isError);
      const content = result.structuredContent ?? result.content;
      assert.ok(JSON.stringify(content).includes(room.code));
      return { toolCount: tools.length, realMicrophone: 'unrun', transport: 'Streamable HTTP' };
    } finally { await client.close(); }
  });
  if (!await report.check('pause-restart', async () => {
    await host(server, room, 'start'); await host(server, room, 'pause');
    const before = (await server.request(roomPath(room), { token: seat.participantToken })).body;
    assert.equal(before.room.phase, 'paused');
    await server.stop(); await server.start();
    const after = (await server.request(roomPath(room), { token: seat.participantToken })).body;
    assert.equal(after.room.phase, 'paused'); assert.deepEqual(after.me.lineup, before.me.lineup);
    assert.deepEqual(after.standings, before.standings); assert.equal(after.season.id, before.season.id);
    await host(server, room, 'resume');
  })) return;
  return { room, seat };
}
export async function acceptance(server, game, report, timeout) {
  const context = await smoke(server, game, report);
  if (!context) return;
  const { room, seat } = context;
  const view = await until(async () => {
    const v = (await server.request(roomPath(room), { token: seat.participantToken })).body;
    return v.question?.status === 'open' && v.question.remainingMs > 2000 && v;
  }, timeout, 'An open question');
  const requestId = randomUUID();
  const payload = { participantToken: seat.participantToken, questionId: view.question.id, optionId: view.question.options[0].id, requestId };
  let accepted, receipt;
  const lookup = async () => (await server.request(`${roomPath(room)}/receipts/${requestId}`, { token: seat.participantToken })).body;
  const receiptReady = await report.check('durable-receipts', async () => {
    accepted = (await server.request(`${roomPath(room)}/picks`, { body: payload })).body;
    receipt = accepted.receipt;
    if (!receipt) throw new Blocked('Pick response has no durable receipt; A must supply receipt/lookup contract.');
    assert.ok(JSON.stringify(receipt).includes(requestId), 'Receipt must identify the request');
    const saved = await lookup(); assert.ok(JSON.stringify(saved).includes(requestId));
    await server.stop(); await server.start();
    const restored = await lookup(); assert.deepEqual(restored, saved);
  });
  if (receiptReady) {
    await report.check('lost-response-retry', async () => {
      // Discard the first response after the authoritative service accepted it. This models an ambiguous response without cancelling the operation.
      await server.request(`${roomPath(room)}/picks`, { body: payload });
      const retry = (await server.request(`${roomPath(room)}/picks`, { body: payload })).body;
      assert.deepEqual(retry.receipt, receipt);
      const recovered = await lookup(); assert.ok(JSON.stringify(recovered).includes(requestId));
      const privateView = (await server.request(roomPath(room), { token: seat.participantToken })).body;
      assert.equal(privateView.me.currentPick.optionId, payload.optionId);
    });
    await report.check('request-id-conflict', async () => {
      assert.ok(view.question.options.length > 1);
      const result = await server.request(`${roomPath(room)}/picks`, { body: { ...payload, optionId: view.question.options[1].id }, expected: 409 });
      assert.match(result.body.code, /REQUEST|CONFLICT|IDEMPOT/i);
      assert.deepEqual((await server.request(`${roomPath(room)}/picks`, { body: payload })).body.receipt, receipt);
    });
  }
  await report.check('lock-boundary', async () => {
    await until(async () => {
      const v = (await server.request(roomPath(room))).body;
      return !v.question || v.question.id !== payload.questionId || v.question.status !== 'open';
    }, timeout, 'Original question locks');
    const rejected = await server.request(`${roomPath(room)}/picks`, { body: { ...payload, requestId: randomUUID() }, expected: 409 });
    assert.equal(rejected.body.code, 'PICKS_LOCKED');
  });
  const finalPassed = await report.check('final-season-restart', async () => {
    const final = await until(async () => {
      const v = (await server.request(roomPath(room), { token: seat.participantToken })).body;
      return v.room.phase === 'final' && v;
    }, timeout, 'Authoritative final state');
    assertGame(final, game);
    assert.ok(final.standings.some(row => row.total > 0));
    const season = final.season.standings.find(row => row.participantId === seat.view.me.participantId);
    assert.equal(season.nightsPlayed, 1);
    await server.stop(); await server.start();
    const restored = (await server.request(roomPath(room), { token: seat.participantToken })).body;
    assert.equal(restored.room.phase, 'final'); assert.deepEqual(restored.standings, final.standings);
    assert.deepEqual(restored.season, final.season);
    await server.request(roomPath(room));
    assert.deepEqual((await server.request(roomPath(room))).body.season, final.season, 'Read must not duplicate season accounting');
    return { score: [final.game.home.score, final.game.away.score], standings: final.standings.length };
  });
  if (finalPassed && receiptReady) return { ...context, requestId, receipt };
}
export const backupChecks = ['backup-roundtrip', 'backup-corruption-rejected', 'restore-overwrite-rejected'];
export async function backupScenario(server, game, report) {
  const room = await createRoom(server, game, report);
  const seat = await join(server, room, 'C restore', report);
  await server.request(`${roomPath(room)}/auto-lineup`, { body: { participantToken: seat.participantToken } });
  await host(server, room, 'start'); await host(server, room, 'pause');
  const before = (await server.request(roomPath(room), { token: seat.participantToken })).body;
  await server.stop();
  const archive = path.join(server.directory, 'backup');
  const target = path.join(server.directory, 'restored');
  await fs.mkdir(target, { mode: 0o700 });
  await report.check('backup-roundtrip', async () => {
    const manifest = await backup(server.directory, archive);
    await restore(archive, path.join(target, 'data'));
    const restored = new Server(target, await freePort(), report);
    try {
      await restored.start();
      const after = (await restored.request(roomPath(room), { token: seat.participantToken })).body;
      assert.equal(after.room.phase, 'paused'); assert.deepEqual(after.me.lineup, before.me.lineup);
      assert.deepEqual(after.standings, before.standings); assert.deepEqual(after.season, before.season);
      await host(restored, room, 'resume');
    } finally { await restored.stop(); }
    return { adapter: 'json-files', files: manifest.files.map(f => ({ name: f.name, bytes: f.bytes, sha256: f.sha256 })), scope: 'paused room, seat credentials, lineup, standings, season; not database or completed-game settlement' };
  });
  await report.check('restore-overwrite-rejected', async () => {
    await assert.rejects(restore(archive, path.join(target, 'data')), { code: 'EEXIST' });
  });
  await report.check('backup-corruption-rejected', async () => {
    const broken = path.join(server.directory, 'corrupted-backup');
    await fs.cp(archive, broken, { recursive: true });
    await fs.appendFile(path.join(broken, 'rooms.json'), 'corruption');
    const destination = path.join(server.directory, 'must-not-exist');
    await assert.rejects(restore(broken, destination), /mismatch/);
    await assert.rejects(fs.access(destination), { code: 'ENOENT' });
  });
}
export const loadChecks = ['load-32-clients'];
export function percentile(sorted, fraction) { return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]; }
export async function loadScenario(server, game, report, duration, budget) {
  await report.check('load-32-clients', async () => {
    const room = await createRoom(server, game, report);
    const seats = [];
    for (let i = 0; i < 32; i++) {
      const seat = await join(server, room, `C load ${i + 1}`, report); seats.push(seat);
      await server.request(`${roomPath(room)}/auto-lineup`, { body: { participantToken: seat.participantToken } });
    }
    await host(server, room, 'start');
    const samples = [], failures = [], picks = new Set();
    const deadline = performance.now() + duration;
    const ticks = Array(32).fill(0);
    await Promise.all(seats.map(async (seat, i) => {
      while (performance.now() < deadline) {
        const began = performance.now();
        try {
          const view = (await server.request(roomPath(room), { token: seat.participantToken })).body;
          assert.equal(view.room.participantCount, 32); assert.ok(view.me);
          samples.push(performance.now() - began); ticks[i]++;
          if (view.question?.status === 'open' && view.question.remainingMs > 2000) {
            const key = `${i}:${view.question.id}`;
            if (!picks.has(key)) {
              picks.add(key);
              const payload = { participantToken: seat.participantToken, questionId: view.question.id, optionId: view.question.options[i % view.question.options.length].id, requestId: randomUUID() };
              const accepted = (await server.request(`${roomPath(room)}/picks`, { body: payload })).body;
              assert.equal(accepted.me.currentPick.optionId, payload.optionId);
            }
          }
        } catch (error) { failures.push(error.message); }
        await sleep(Math.max(0, 1000 - (performance.now() - began)));
      }
    }));
    samples.sort((a, b) => a - b);
    const metrics = { clients: 32, durationMs: duration, reads: samples.length, writes: picks.size, minimumReadsPerClient: Math.min(...ticks), errors: failures.length, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95), p99Ms: percentile(samples, .99), budgetP95Ms: budget };
    report.data.metrics = metrics;
    assert.ok(ticks.every(n => n >= 2), 'All 32 clients must complete multiple reads');
    assert.equal(failures.length, 0, `${failures.length} failed operations; first: ${failures[0]}`);
    assert.ok(picks.size >= 32, 'Every participant must have submitted a real pick');
    assert.ok(metrics.p95Ms <= budget, `p95 ${metrics.p95Ms.toFixed(1)}ms exceeds ${budget}ms`);
    return metrics;
  });
}
