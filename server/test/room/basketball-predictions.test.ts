import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveBasketballTarget } from '../../src/room/predictions/resolve.js';
import type { BasketballTarget } from '../../src/room/types.js';
import { vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { basketball } from '../../src/room/sports/basketball.js';
const target: BasketballTarget = { templateId: 'next_made_field_goal_value', anchorSequence: 20, horizonGameElapsedMs: 180000, eligibleParticipantIds: [] };
const event = (sequence: number, scoreValue?: 1|2|3) => ({ id: `e${sequence}`, revision: 1, sequence, gameId: 'demo', gameElapsedMs: 120000, occurredAt: 1, receivedAt: 1, kind: scoreValue ? 'score' as const : 'shot_attempt' as const, teamId: 'harbor', playerId: 'har-pg-1', scoreValue });
it('excludes the anchor, free throws and misses from next-made-field-goal resolution', () => {
  expect(resolveBasketballTarget(target, event(20, 2))).toBeUndefined();
  expect(resolveBasketballTarget(target, event(21, 1))).toBeUndefined();
  expect(resolveBasketballTarget(target, event(22))).toBeUndefined();
  expect(resolveBasketballTarget(target, event(23, 2))).toEqual({ optionId: 'two' });
  // Several ordered events can share the horizon timestamp; a miss must not void a later make there.
  expect(resolveBasketballTarget(target, { ...event(24), gameElapsedMs:180000 })).toBeUndefined();
  expect(resolveBasketballTarget(target, { ...event(25,3), gameElapsedMs:180000 })).toEqual({optionId:'three'});
});
it('counts free throws as next score and respects the horizon and named team', () => {
  expect(resolveBasketballTarget({ ...target, templateId: 'next_score_team' }, event(21, 1))).toEqual({ optionId: 'harbor' });
  const window = { ...target, templateId: 'team_scores_in_window' as const, teamId: 'summit' };
  expect(resolveBasketballTarget(window, event(21, 2))).toBeUndefined();
  expect(resolveBasketballTarget(window, { ...event(22, 1), teamId: 'summit' })).toEqual({ optionId: 'yes' });
  expect(resolveBasketballTarget(window, { ...event(22, 1), gameElapsedMs: 180001 })).toEqual({ optionId: 'no' });
  expect(resolveBasketballTarget(target, { ...event(22), kind: 'final' })).toEqual({ voidReason: 'No eligible scoring event before the target closed.' });
});
it('persists a no-event void with zero reward and no streak reset', () => {
  let now = 1000;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'basketball-void-'));
  const dataFile=path.join(dir,'rooms.json');
  const original = basketball.question.bind(basketball);
  const spy = vi.spyOn(basketball, 'question').mockImplementation((beat, opensAt, duration) => {
    const question = original(beat, opensAt, duration);
    if(question?.target) question.target.horizonGameElapsedMs = beat.gameElapsedMs;
    return question;
  });
  try {
    let store = new RoomStore({ dataFile, now: () => now });
    const created = store.create({ gameId:'harbor-vs-summit',speed:4 });const code=created.view.room.code;
    const seat=store.join(code,{name:'Fan'});
    const saved=JSON.parse(fs.readFileSync(dataFile,'utf8'));saved.rooms[0].participants[0].streak=3;
    fs.writeFileSync(dataFile,JSON.stringify(saved));store=new RoomStore({dataFile,now:()=>now});
    store.host(code,{hostToken:created.hostToken,action:'start'});now+=100000;
    const open=store.view(code);
    store.pick(code,{participantToken:seat.participantToken,requestId:'void-pick',questionId:open.question!.id,optionId:'harbor'});
    now+=8000;const view=store.view(code);
    expect(view.question).toMatchObject({status:'void',voidReason:expect.any(String)});
    expect(view.question!.result).toBeUndefined();
    expect(view.standings[0]).toMatchObject({predictionPoints:0,streak:3});
    store=new RoomStore({dataFile,now:()=>now+60000});
    expect(store.view(code).question!.status).toBe('void');
    expect(store.view(code).standings[0].streak).toBe(3);
  } finally { spy.mockRestore(); fs.rmSync(dir,{recursive:true,force:true}); }
});
