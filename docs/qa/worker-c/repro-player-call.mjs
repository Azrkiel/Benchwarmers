// Deterministic regression for A: run with node --import tsx docs/qa/worker-c/repro-player-call.mjs.
// Success means a legitimate clock tick between internal reads no longer rejects the accepted call.
import assert from 'node:assert/strict';
import { RoomStore } from '../../../server/src/room/store.ts';
let clock = 100000;
const store = new RoomStore({ persist: false, now: () => ++clock, enableCommitments: true,
  probabilities: ['harbor', 'summit'].map(optionId => ({ gameId: 'harbor-vs-summit', templateId: 'next_score_team', optionId,
    estimate: { p: .5, version: 'c-regression', label: 'Authored regression probability', source: 'demo_projection', observedAt: 1000, validUntil: 1000000 } })) });
const room = store.create({ gameId: 'harbor-vs-summit', speed: 4 }), code = room.view.room.code;
const seat = store.join(code, { name: 'C monotonic clock' });
store.host(code, { hostToken: room.hostToken, action: 'start' });
let question, window;
for (let i = 0; i < 50 && !window; i++) {
  clock += 500; store.tick();
  question = store.view(code).question; window = store.callCatalog(code).window;
}
assert.ok(question && window);
const { quote } = store.quotePlayerCall(code, { participantToken: seat.participantToken,
  templateId: question.target.templateId, anchorSequence: window.anchorSequence,
  horizonGameElapsedMs: window.maximumHorizonGameElapsedMs, optionId: question.options[0].id, commitPoints: 10 });
const body = { participantToken: seat.participantToken, quoteId: quote.quoteId, requestId: 'c-monotonic-clock' };
const first = store.acceptPlayerCall(code, body), retry = store.acceptPlayerCall(code, body);
assert.deepEqual(retry.commitment, first.commitment);
assert.equal(store.view(code, seat.participantToken).me.bank.reservedPoints, 10);
console.log('PASS: advancing-clock player-call acceptance and same-ID retry');
