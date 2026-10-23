import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRoom, host, join, roomPath, until } from './common.mjs';
import { persistentResponse } from './service.mjs';

export const featureChecks = ['pregame-receipt', 'http-commitment', 'mcp-commitment', 'voice-confirmation', 'player-call', 'feature-settlement-restart'];
export async function featuresScenario(server, report, timeout) {
  const room = await createRoom(server, 'basketball', report), base = roomPath(room);
  const seats = [];
  for (const name of ['HTTP', 'MCP', 'Voice', 'Call']) seats.push(await join(server, room, `C ${name}`, report));
  const view = async seat => (await server.request(base, { token: seat.participantToken })).body;
  const pregameId = randomUUID(), pregameBody = { participantToken: seats[0].participantToken, optionId: 'harbor', requestId: pregameId };
  if (!await report.check('pregame-receipt', async () => {
    const reference = (await server.request(`${base}/pregame-reference`)).body;
    assert.equal(reference.reference, null); assert.equal(reference.reason, 'fictional_game');
    const first = (await server.request(`${base}/pregame-picks`, { body: pregameBody })).body;
    const retry = (await server.request(`${base}/pregame-picks`, { body: pregameBody })).body;
    assert.deepEqual(retry.receipt, first.receipt);
    assert.equal((await view(seats[0])).me.bank.availablePoints, 100);
  })) return;
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
  const client = new Client({ name: 'c-feature-acceptance', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
  const tool = async (name, args) => {
    const response = await client.callTool({ name, arguments: { code: room.code, ...args } });
    assert.ok(!response.isError, `${name} refused the rehearsal input`); assert.ok(response.structuredContent, `${name} has no structured response`);
    return response.structuredContent;
  };
  const captures = [];
  try {
    await host(server, room, 'start');
    const open = await until(async () => {
      const current = await view(seats[0]); return current.question?.status === 'open' && current.question.remainingMs >= 4000 && current;
    }, timeout, 'A genuine feature question');
    const q = open.question;
    const quoteBody = (i, optionId = q.options[0].id) => ({ participantToken: seats[i].participantToken, questionId: q.id, optionId, commitPoints: i ? 10 : 25 });
    const receiptPath = id => `${base}/commitment-receipts/${id}`;
    await report.check('http-commitment', async () => {
      const bank = (await view(seats[0])).me.bank;
      const { quote } = (await server.request(`${base}/commitment-quotes`, { body: quoteBody(0) })).body;
      // With the declared .5 test probability and no accepted callers: 25 × 2 × 1.10 = 55 total return.
      assert.equal(quote.firstCaller, true); assert.equal(quote.multiplier, 2.2);
      assert.equal(quote.totalReturnPoints, 55); assert.equal(quote.maximumLossPoints, 25);
      const alternate = (await server.request(`${base}/commitment-quotes`, { body: quoteBody(0, q.options[1].id) })).body.quote;
      assert.deepEqual((await view(seats[0])).me.bank, bank, 'A quote spent points');
      const requestId = randomUUID(), body = { participantToken: seats[0].participantToken, quoteId: quote.quoteId, requestId };
      const accepted = (await server.request(`${base}/commitments`, { body })).body;
      const retry = (await server.request(`${base}/commitments`, { body })).body;
      assert.deepEqual(retry, accepted);
      const held = (await view(seats[0])).me.bank;
      assert.equal(held.availablePoints, bank.availablePoints - 25); assert.equal(held.reservedPoints, 25);
      assert.equal(accepted.commitment.totalReturnPoints, quote.totalReturnPoints);
      const conflict = await server.request(`${base}/commitments`, { body: { ...body, quoteId: alternate.quoteId }, expected: 409 });
      assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
      await server.request(receiptPath(requestId), { token: seats[1].participantToken, expected: 404 });
      captures.push({ route: receiptPath(requestId), token: seats[0].participantToken });
    });
    await report.check('mcp-commitment', async () => {
      const { quote } = await tool('room_quote_commitment', quoteBody(1));
      const requestId = randomUUID(), payload = { participantToken: seats[1].participantToken, quoteId: quote.quoteId, requestId };
      const first = await tool('room_commit_points', payload), retry = await tool('room_commit_points', payload);
      assert.deepEqual(first.commitment, retry.commitment);
      assert.equal(first.commitment.commitPoints, 10); assert.equal(first.commitment.totalReturnPoints, quote.totalReturnPoints);
      assert.equal((await view(seats[1])).me.bank.reservedPoints, 10);
      captures.push({ route: receiptPath(requestId), token: seats[1].participantToken });
    });
    await report.check('voice-confirmation', async () => {
      const command = async text => (await server.request(`${base}/assistant`, { body: { text, participantToken: seats[2].participantToken } })).body;
      const before = (await view(seats[2])).me.bank;
      const offer = await command(`put 10 points on ${q.options[0].label}`);
      assert.match(offer.reply, /Offer: commit 10 points/); assert.match(offer.reply, /come back in total/); assert.match(offer.reply, /lose 10/);
      assert.deepEqual((await view(seats[2])).me.bank, before);
      await command('yes'); assert.deepEqual((await view(seats[2])).me.bank, before, 'Plain yes spent points');
      const confirmed = await command('confirm'); assert.equal(confirmed.accepted, true);
      const after = (await view(seats[2])).me;
      assert.equal(after.bank.reservedPoints, 10); assert.equal(after.commitments.length, 1);
      await command('confirm'); assert.deepEqual((await view(seats[2])).me.bank, after.bank);
      captures.push({ route: receiptPath(after.commitments[0].requestId), token: seats[2].participantToken });
    });
    await report.check('player-call', async () => {
      const catalog = (await server.request(`${base}/call-catalog`)).body;
      assert.equal(catalog.enabled, true); assert.ok(catalog.window);
      const input = { participantToken: seats[3].participantToken, templateId: q.target.templateId, anchorSequence: catalog.window.anchorSequence, horizonGameElapsedMs: catalog.window.maximumHorizonGameElapsedMs, optionId: q.options[0].id, commitPoints: 10 };
      const { quote } = (await server.request(`${base}/call-quotes`, { body: input })).body;
      const payload = { participantToken: seats[3].participantToken, quoteId: quote.quoteId, requestId: randomUUID() };
      const first = (await server.request(`${base}/calls`, { body: payload })).body;
      const retry = (await server.request(`${base}/calls`, { body: payload })).body;
      assert.deepEqual(first, retry); assert.equal(first.commitment.totalReturnPoints, quote.totalReturnPoints);
      captures.push({ route: receiptPath(payload.requestId), token: seats[3].participantToken });
    });
    if (!await report.check('feature-settlement-restart', async () => {
      await until(async () => (await server.request(base)).body.room.phase === 'final', timeout, 'Feature final');
      const finals = [];
      for (const seat of seats) {
        const final = await view(seat), own = final.standings.find(row => row.participantId === final.me.participantId);
        assert.equal(final.me.bank.reservedPoints, 0); assert.equal(final.me.commitments.length, 1);
        const call = final.me.commitments[0]; assert.ok(['won', 'lost', 'void'].includes(call.state));
        const net = call.state === 'won' ? call.totalReturnPoints - call.commitPoints : call.state === 'lost' ? -call.commitPoints : 0;
        assert.equal(final.me.bank.settledRiskNet, net);
        assert.equal(final.me.bank.availablePoints, 100 + own.predictionPoints + net, 'Bank must exclude fantasy points and settle the quoted return exactly once');
        assert.equal(final.season.standings.find(row => row.participantId === final.me.participantId).nightsPlayed, 1);
        finals.push(persistentResponse(final));
      }
      const publicView = (await server.request(base)).body;
      assert.ok(!publicView.me); assert.ok(!JSON.stringify(publicView).includes('availablePoints'));
      await server.stop(); await server.start();
      for (let i = 0; i < seats.length; i++) assert.deepEqual(persistentResponse(await view(seats[i])), finals[i]);
      return { provenance: 'authored synthetic probabilities', transports: ['HTTP', 'MCP', 'typed voice router'], commitments: 4, productionEnablement: false };
    })) return;
    return { room, seat: seats[0], requestId: pregameId, retryRoute: '/pregame-picks', retryBody: pregameBody, extraCaptures: [...captures, ...seats.slice(1).map(seat => ({ route: base, token: seat.participantToken }))] };
  } finally { await client.close(); }
}
