import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { canonicalTargetKey, canonicalTargetId } from '../../src/room/calls/catalog.js';
import { validateSavedRooms } from '../../src/room/persistence.js';

function setup(dataFile?:string, enabled=true) {
  let now=1000;
  const probabilities=['next_score_team','next_made_field_goal_value'].flatMap(templateId=>
    ['harbor','summit','two','three'].flatMap(optionId=>[360000,359999,359998,359997,30001,990000].map(horizonGameElapsedMs=>({
      gameId:'harbor-vs-summit',templateId,optionId,anchorSequence:horizonGameElapsedMs===990000?36:2,horizonGameElapsedMs,
      estimate:{p:.366,version:'authored-test',label:'Authored test input',source:'demo_projection',observedAt:0,validUntil:10000000},
    }))));
  const options={persist:!!dataFile,dataFile,now:()=>now,enableCommitments:enabled,probabilities};
  let store=new RoomStore(options);
  const room=store.create({gameId:'harbor-vs-summit',speed:4}),code=room.view.room.code;
  const seats=['Maya','Leo','Sam','Priya','Alex'].map(name=>store.join(code,{name}));
  store.host(code,{hostToken:room.hostToken,action:'start'});now+=100000;
  const question=store.view(code).question!;
  const input=(seat=0,horizon=360000)=>({participantToken:seats[seat].participantToken,templateId:'next_score_team' as const,
    anchorSequence:question.target!.anchorSequence,horizonGameElapsedMs:horizon,optionId:'harbor',commitPoints:25});
  const quote=(seat=0,horizon=360000)=>store.quotePlayerCall(code,input(seat,horizon));
  const accept=(quoteId:string,seat=0,requestId=`call-${seat}`)=>store.acceptCommitment(code,{participantToken:seats[seat].participantToken,quoteId,requestId});
  return {get store(){return store;},code,seats,room,question,input,quote,accept,advance(ms:number){now+=ms;},restart(disabled=false){store=new RoomStore({...options,enableCommitments:!disabled});}};
}

it('publishes only supported catalog entries and canonicalizes semantics, excluding actor and option',()=>{
  const s=setup();
  const catalog=s.store.callCatalog(s.code);
  expect(catalog.enabled).toBe(true);
  expect(catalog.templates.map(t=>t.templateId)).toEqual(['next_score_team','next_made_field_goal_value']);
  expect(catalog.templates[0].optionIds).toEqual(['harbor','summit']);
  expect(catalog.window).toMatchObject({anchorSequence:2,maximumHorizonGameElapsedMs:360000});
  const target=s.question.target!;
  expect(canonicalTargetKey('harbor-vs-summit',target)).toBe(canonicalTargetKey('harbor-vs-summit',{...target,eligibleParticipantIds:['different']}));
  expect(canonicalTargetKey('harbor-vs-summit',target)).not.toBe(canonicalTargetKey('harbor-vs-summit',{...target,horizonGameElapsedMs:359999}));
  const disabled=setup(undefined,false);expect(disabled.store.callCatalog(disabled.code).enabled).toBe(false);
});

it('requires reviewed commitment, rejects unsupported/stale/unsafe input, and leaves no empty public target',()=>{
  const s=setup();
  expect(()=>s.store.quotePlayerCall(s.code,{...s.input(),templateId:'player_layup' as never})).toThrow(expect.objectContaining({code:'TARGET_UNSUPPORTED'}));
  expect(()=>s.store.quotePlayerCall(s.code,{...s.input(),anchorSequence:1})).toThrow(expect.objectContaining({code:'STALE_ANCHOR'}));
  expect(()=>s.store.quotePlayerCall(s.code,{...s.input(),horizonGameElapsedMs:360001})).toThrow(expect.objectContaining({code:'BAD_HORIZON'}));
  expect(()=>s.store.quotePlayerCall(s.code,{...s.input(),commitPoints:0})).toThrow(expect.objectContaining({code:'BAD_COMMIT_AMOUNT'}));
  const {quote}=s.quote();
  expect(s.store.view(s.code).calls).toEqual([]);
  expect(s.store.view(s.code,s.seats[0].participantToken).me!.bank!.availablePoints).toBe(100);
  expect(()=>s.accept(quote.quoteId,1)).toThrow(expect.objectContaining({code:'BAD_QUOTE'}));
  s.advance(8000);
  expect(()=>s.accept(quote.quoteId)).toThrow(expect.objectContaining({code:'QUOTE_EXPIRED'}));
  expect(s.store.view(s.code).calls).toEqual([]);
});

it('deduplicates prompted and voluntary targets, freezes creator terms, and prices followers from accepted support',()=>{
  const s=setup();
  const creator=s.quote();expect(creator.quote.firstCaller).toBe(true);
  const before=s.quote(1);
  const accepted=s.accept(creator.quote.quoteId);
  expect(()=>s.accept(before.quote.quoteId,1)).toThrow(expect.objectContaining({code:'QUOTE_CHANGED'}));
  const follower=s.quote(1);
  expect(follower.quote.targetId).toBe(creator.quote.targetId);
  expect(follower.quote.firstCaller).toBe(false);
  expect(follower.quote.totalReturnPoints).toBeLessThan(creator.quote.totalReturnPoints);
  s.accept(follower.quote.quoteId,1);
  expect(s.store.view(s.code).calls).toHaveLength(1);
  expect(s.store.view(s.code).calls![0]).toMatchObject({creatorId:s.seats[0].participantId,createdAt:101000});
  expect(s.store.getCommitmentReceipt(s.code,s.seats[0].participantToken,'call-0')).toEqual(accepted.commitment);
  expect(()=>s.store.quoteCommitment(s.code,{participantToken:s.seats[0].participantToken,questionId:s.question.id,optionId:'summit',commitPoints:25})).toThrow(expect.objectContaining({code:'CALL_ALREADY_COMMITTED'}));
  s.advance(10000);
  const view=s.store.view(s.code,s.seats[0].participantToken);
  expect(view.calls![0].status).toBe('resolved');
  expect(view.calls![0].result!.optionId).toBe(view.lastQuestion!.result!.optionId);
  expect(view.me!.bank).toMatchObject({availablePoints:150,reservedPoints:0,settledRiskNet:50});
  expect(view.standings.find(row=>row.participantId===s.seats[0].participantId)!.predictionPoints).toBe(0);
});

it('keeps an existing prompted answer consistent when the same target is committed voluntarily',()=>{
  const s=setup();
  s.store.pick(s.code,{participantToken:s.seats[0].participantToken,questionId:s.question.id,optionId:'summit',requestId:'free-before-call'});
  s.accept(s.quote().quote.quoteId);
  expect(s.store.view(s.code,s.seats[0].participantToken).me!.currentPick!.optionId).toBe('harbor');
  expect(()=>s.store.pick(s.code,{participantToken:s.seats[0].participantToken,questionId:s.question.id,optionId:'summit',requestId:'change-after-call'})).toThrow(expect.objectContaining({code:'CALL_ALREADY_COMMITTED'}));
});

it('rechecks room capacity at acceptance and leaves no target from a losing race',()=>{
  const s=setup();const pending=s.quote(3,359997);
  s.accept(s.quote(0).quote.quoteId,0);
  s.accept(s.quote(1,359999).quote.quoteId,1);
  s.accept(s.quote(2,359998).quote.quoteId,2);
  expect(()=>s.accept(pending.quote.quoteId,3)).toThrow(expect.objectContaining({code:'CALL_LIMIT_REACHED'}));
  expect(s.store.view(s.code).calls).toHaveLength(3);
  expect(s.store.view(s.code,s.seats[3].participantToken).me!.bank!.availablePoints).toBe(100);
});

it('blocks pause-time acceptance and retains real-time quote expiry after replay resumes',()=>{
  const s=setup();const {quote}=s.quote();
  s.store.host(s.code,{hostToken:s.room.hostToken,action:'pause'});
  expect(()=>s.accept(quote.quoteId)).toThrow(expect.objectContaining({code:'PICKS_LOCKED'}));
  s.advance(9000);s.store.host(s.code,{hostToken:s.room.hostToken,action:'resume'});
  expect(()=>s.accept(quote.quoteId)).toThrow(expect.objectContaining({code:'QUOTE_EXPIRED'}));
  expect(s.store.view(s.code).calls).toHaveLength(0);
});

it('enforces per-person exposure, room cap, target uniqueness and durable creation cooldown',()=>{
  const s=setup();
  s.accept(s.quote().quote.quoteId);
  expect(()=>s.quote()).toThrow(expect.objectContaining({code:'CALL_ALREADY_COMMITTED'}));
  expect(()=>s.quote(0,359999)).toThrow(expect.objectContaining({code:'CALL_LIMIT_REACHED'}));
  s.accept(s.quote(1,359999).quote.quoteId,1);
  s.accept(s.quote(2,359998).quote.quoteId,2);
  expect(()=>s.quote(3,359997)).toThrow(expect.objectContaining({code:'CALL_LIMIT_REACHED'}));
  // Joining an existing target does not allocate a fourth target.
  s.accept(s.quote(3).quote.quoteId,3);
  expect(s.store.view(s.code).calls).toHaveLength(3);
});

it('rolls back target/hold/receipt on save failure and recovers retries and settlement across disabled restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'player-calls-'));
  try {
    const s=setup(path.join(dir,'rooms.json'));
    const {quote}=s.quote();
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.accept(quote.quoteId)).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(s.store.view(s.code).calls).toEqual([]);
    expect(s.store.view(s.code,s.seats[0].participantToken).me!.bank!.availablePoints).toBe(100);
    const accepted=s.accept(quote.quoteId);
    s.restart(true);
    expect(s.accept(quote.quoteId)).toEqual(accepted);
    expect(()=>s.quote(1)).toThrow(expect.objectContaining({code:'FEATURE_DISABLED'}));
    s.advance(10000);
    expect(s.store.view(s.code,s.seats[0].participantToken).me!.commitments![0].state).toBe('won');
    expect(s.accept(quote.quoteId).commitment.state).toBe('won');
    const publicState=JSON.stringify(s.store.view(s.code));
    expect(publicState).not.toMatch(/quoteId|commitUnits|availablePoints|participantToken/);
    s.restart(true);expect(s.store.view(s.code).calls).toHaveLength(1);
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});

it('settles losing and void calls without a second debit or free reward',()=>{
  const lost=setup();
  const offer=lost.store.quotePlayerCall(lost.code,{...lost.input(),optionId:'summit'});
  lost.accept(offer.quote.quoteId);lost.advance(10000);
  expect(lost.store.view(lost.code,lost.seats[0].participantToken).me!.bank).toMatchObject({availablePoints:75,reservedPoints:0,settledRiskNet:-25});
  const voided=setup();voided.accept(voided.quote(0,30001).quote.quoteId);voided.advance(10000);
  const view=voided.store.view(voided.code,voided.seats[0].participantToken);
  expect(view.me!.bank).toMatchObject({availablePoints:100,reservedPoints:0,settledRiskNet:0});
  expect(view.calls![0].status).toBe('void');
});

it('shares the field-goal resolver and requires exact probability semantics for a different horizon',()=>{
  const s=setup();
  expect(()=>s.quote(0,350000)).toThrow(expect.objectContaining({code:'PROBABILITY_UNAVAILABLE'}));
  const {quote}=s.store.quotePlayerCall(s.code,{...s.input(),templateId:'next_made_field_goal_value',optionId:'two'});
  s.accept(quote.quoteId);s.advance(10000);
  const view=s.store.view(s.code,s.seats[0].participantToken);
  expect(view.calls![0].result!.optionId).toBe('two');expect(view.me!.commitments![0].state).toBe('won');
});

it('persists cooldown after a fast settlement and does not let retries allocate a new target',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'call-cooldown-'));
  try {
    const s=setup(path.join(dir,'rooms.json'));s.advance(7999);
    const {quote}=s.quote();const original=s.accept(quote.quoteId);s.restart();
    let view=s.store.view(s.code);
    for(let i=0;i<60&&view.question?.id===s.question.id;i++){s.advance(250);view=s.store.view(s.code);}
    // The next authored window is reached within the creator cooldown at speed four.
    expect(view.question!.id).not.toBe(s.question.id);
    const input={...s.input(),templateId:'next_score_team' as const,anchorSequence:view.question!.target!.anchorSequence,horizonGameElapsedMs:view.question!.target!.horizonGameElapsedMs};
    expect(()=>s.store.quotePlayerCall(s.code,input)).toThrow(expect.objectContaining({code:'CALL_LIMIT_REACHED'}));
    expect(s.accept(quote.quoteId).commitment.callId).toBe(original.commitment.callId);
    expect(s.store.view(s.code).calls).toHaveLength(1);
    s.advance(123999-view.serverNow);
    const next=s.store.quotePlayerCall(s.code,input);s.accept(next.quote.quoteId,0,'after-cooldown');
    expect(s.store.view(s.code).calls).toHaveLength(2);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('validates draft identity, safe bounds and creator links before restoring durable calls',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'call-validation-')),dataFile=path.join(dir,'rooms.json');
  try {
    const s=setup(dataFile);s.accept(s.quote().quote.quoteId);
    const saved=JSON.parse(fs.readFileSync(dataFile,'utf8'));
    const wrongOwner=structuredClone(saved);wrongOwner.rooms[0].playerCalls[0].creatorId=s.seats[1].participantId;
    expect(()=>validateSavedRooms(wrongOwner)).toThrow(/uncommitted player call/);
    const unsafe=structuredClone(saved);const draft=unsafe.rooms[0].points.quotes[0].playerCall;
    draft.view.target.horizonGameElapsedMs=360001;draft.key=canonicalTargetKey('harbor-vs-summit',draft.view.target);
    expect(()=>validateSavedRooms(unsafe)).toThrow(/player call/);
    const identity=structuredClone(saved);identity.rooms[0].points.quotes[0].playerCall.view.id='invented';
    expect(()=>validateSavedRooms(identity)).toThrow(/player call/);
    const unsafeConsistent=structuredClone(saved),r=unsafeConsistent.rooms[0];
    for(const draft of [r.playerCalls[0],r.points.quotes[0].playerCall]){
      draft.view.target.horizonGameElapsedMs=360001;draft.key=canonicalTargetKey(r.gameId,draft.view.target);draft.view.id=canonicalTargetId(draft.key);
    }
    for(const record of [r.points.quotes[0],r.points.calls[0]]){record.targetId=r.playerCalls[0].view.id;record.questionId=record.targetId;}
    expect(()=>validateSavedRooms(unsafeConsistent)).toThrow(/player call/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('rolls back voluntary settlement on disk failure and applies season risk once through final',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'call-final-')),dataFile=path.join(dir,'rooms.json');
  try {
    const s=setup(dataFile);s.accept(s.quote().quote.quoteId);
    const before=fs.readFileSync(dataFile,'utf8');s.advance(10000);
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.store.tick()).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(fs.readFileSync(dataFile,'utf8')).toBe(before);
    let view=s.store.view(s.code,s.seats[0].participantToken);
    for(let i=0;i<10&&view.room.phase!=='final';i++){s.advance(100000);view=s.store.view(s.code,s.seats[0].participantToken);}
    expect(view.room.phase).toBe('final');expect(view.game.home.score).toBe(57);expect(view.game.away.score).toBe(56);
    expect(view.me!.bank).toMatchObject({availablePoints:150,reservedPoints:0,settledRiskNet:50});
    const season=view.season.standings;s.restart();expect(s.store.view(s.code).season.standings).toEqual(season);
    expect(season.find(row=>row.participantId===s.seats[0].participantId)!.points).toBe(view.standings.find(row=>row.participantId===s.seats[0].participantId)!.total);
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});

it('uses the accepted commitment timestamp when the clock advances between internal reads',()=>{
  let clock=100000;
  const store=new RoomStore({persist:false,now:()=>++clock,enableCommitments:true,
    probabilities:['harbor','summit'].map(optionId=>({gameId:'harbor-vs-summit',templateId:'next_score_team',optionId,
      estimate:{p:.5,version:'clock-regression',label:'Authored regression probability',source:'demo_projection',observedAt:1000,validUntil:1000000}}))});
  const room=store.create({gameId:'harbor-vs-summit',speed:4}),code=room.view.room.code;
  const seat=store.join(code,{name:'Advancing clock'});
  store.host(code,{hostToken:room.hostToken,action:'start'});
  for(let i=0;i<50&&!store.callCatalog(code).window;i++){clock+=500;store.tick();}
  const question=store.view(code).question!,window=store.callCatalog(code).window!;
  expect(window).toBeTruthy();
  expect(question.target!.templateId).toBe('next_score_team');
  const {quote}=store.quotePlayerCall(code,{participantToken:seat.participantToken,
    templateId:'next_score_team',anchorSequence:window.anchorSequence,
    horizonGameElapsedMs:window.maximumHorizonGameElapsedMs,optionId:question.options[0].id,commitPoints:10});
  const input={participantToken:seat.participantToken,quoteId:quote.quoteId,requestId:'advancing-clock'};
  const accepted=store.acceptPlayerCall(code,input);
  expect(store.acceptPlayerCall(code,input).commitment).toEqual(accepted.commitment);
  expect(store.view(code,seat.participantToken).me!.bank!.reservedPoints).toBe(10);
  expect(store.view(code).calls).toHaveLength(1);
});
