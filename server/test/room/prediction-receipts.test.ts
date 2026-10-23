import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';

it('durably receipts a basketball pick, retries after lock, rejects reuse and isolates participants', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basketball-receipt-'));
  try {
    let now = 1000; const dataFile = path.join(dir, 'rooms.json');
    let store = new RoomStore({ dataFile, now: () => now });
    const created = store.create({ gameId: 'harbor-vs-summit', speed: 4 }); const code = created.view.room.code;
    const seat = store.join(code, { name: 'Fan' }); const other = store.join(code, { name: 'Other' });
    store.host(code, { hostToken: created.hostToken, action: 'start' }); now += 100000;
    const open = store.view(code);
    const input = { participantToken: seat.participantToken, requestId: 'pick-1', questionId: open.question!.id, optionId: 'harbor' };
    expect(() => store.pick(code, { ...input, requestId: undefined })).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk'); });
    expect(() => store.pick(code, input)).toThrow(expect.objectContaining({ code: 'ROOM_SAVE_FAILED' })); vi.restoreAllMocks();
    expect(() => store.receipt(code, seat.participantToken, input.requestId)).toThrow(expect.objectContaining({ code: 'RECEIPT_NOT_FOUND' }));
    const accepted = store.pick(code, input);
    expect(accepted.receipt).toMatchObject({ requestId: 'pick-1', questionId: input.questionId, optionId: 'harbor', acceptedAt: now, acceptanceSequence: 1 });
    expect(store.pick(code, input).receipt).toEqual(accepted.receipt);
    expect(store.view(code).version).toBe(accepted.version);
    const second = store.pick(code, { ...input, participantToken: other.participantToken, requestId: 'other-pick' });
    expect(second.receipt!.acceptanceSequence).toBe(2);
    expect(() => store.receipt(code, other.participantToken, 'pick-1')).toThrow(expect.objectContaining({ code: 'RECEIPT_NOT_FOUND' }));
    expect(() => store.receipt(code, created.hostToken, 'pick-1')).toThrow(expect.objectContaining({ code: 'BAD_CREDENTIAL' }));
    now += 8000; store.view(code);
    expect(store.pick(code, input).receipt).toEqual(accepted.receipt);
    expect(() => store.pick(code, { ...input, optionId: 'summit' })).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    store = new RoomStore({ dataFile, now: () => now + 100000 });
    expect(store.receipt(code, seat.participantToken, 'pick-1')).toEqual(accepted.receipt);
    expect(store.pick(code, input).receipt).toEqual(accepted.receipt);
    expect(store.view(code)).not.toHaveProperty('receipt');
  } finally { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); }
});

it('excludes late joiners from the open question and uses the server cutoff at equality', () => {
  let now = 1000; const store = new RoomStore({ persist: false, now: () => now });
  const created = store.create({ gameId: 'harbor-vs-summit', speed: 4 }); const code = created.view.room.code;
  const seat = store.join(code, { name: 'Early' });
  store.host(code, { hostToken: created.hostToken, action: 'start' }); now += 100000;
  const view = store.view(code); const question = view.question!;
  expect(question.target).toMatchObject({ templateId: 'next_score_team', anchorSequence: expect.any(Number), horizonGameElapsedMs: expect.any(Number) });
  expect(question.target!.eligibleParticipantIds).toEqual([seat.participantId]);
  const late = store.join(code, { name: 'Late' });
  expect(() => store.pick(code, { participantToken: late.participantToken, requestId: 'late', questionId: question.id, optionId: 'harbor' })).toThrow(expect.objectContaining({ code: 'NOT_ELIGIBLE' }));
  now = question.locksAt - 1;
  store.pick(code, { participantToken: seat.participantToken, requestId: 'early', questionId: question.id, optionId: 'harbor' });
  now++;
  expect(() => store.pick(code, { participantToken: seat.participantToken, requestId: 'cutoff', questionId: question.id, optionId: 'summit' })).toThrow(expect.objectContaining({ code: 'PICKS_LOCKED' }));
});
