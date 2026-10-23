import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { RoomStore, RoomError } from '../../src/room/store.js';

const probability={p:.366,version:'authored-demo-v1',label:'Authored demo probability; not a live forecast',source:'demo_projection',observedAt:0,validUntil:10000000};
const probabilities=[{gameId:'harbor-vs-summit',templateId:'next_score_team',optionId:'harbor',estimate:probability}];
function setup(options:{dataFile?:string;enableCommitments?:boolean}={}){
  let now=1000;
  const make=()=>new RoomStore({persist:!!options.dataFile,dataFile:options.dataFile,now:()=>now,enableCommitments:options.enableCommitments??true,probabilities});
  let store=make();const room=store.create({gameId:'harbor-vs-summit',speed:4});const code=room.view.room.code;
  const seat=store.join(code,{name:'Fan'});const other=store.join(code,{name:'Other'});
  store.host(code,{hostToken:room.hostToken,action:'start'});now+=100000;const question=store.view(code).question!;
  return {get store(){return store;},code,seat,other,question,room,advance(ms:number){now+=ms;},restart(){store=make();return store;}};
}
it('keeps the bank private, persists a hold before publishing, freezes the free answer, and settles once',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'commitment-store-'));
  try {
    const s=setup({dataFile:path.join(dir,'rooms.json')});
    expect(s.store.view(s.code)).not.toHaveProperty('me');
    const before=s.store.view(s.code,s.seat.participantToken);
    expect(before.me!.bank).toMatchObject({availablePoints:100,reservedPoints:0});
    const input={participantToken:s.seat.participantToken,questionId:s.question.id,optionId:'harbor',commitPoints:25};
    const {quote}=s.store.quoteCommitment(s.code,input);
    expect(s.store.view(s.code,s.seat.participantToken).me!.bank!.availablePoints).toBe(100);
    const request={participantToken:s.seat.participantToken,quoteId:quote.quoteId,requestId:'commit-1'};
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.store.acceptCommitment(s.code,request)).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(s.store.view(s.code,s.seat.participantToken).me!.bank!.availablePoints).toBe(100);
    expect(()=>s.store.getCommitmentReceipt(s.code,s.seat.participantToken,'commit-1')).toThrow(expect.objectContaining({code:'RECEIPT_NOT_FOUND'}));
    const {commitment}=s.store.acceptCommitment(s.code,request);
    expect(commitment).toMatchObject({state:'pending',commitPoints:25,totalReturnPoints:75});
    expect(s.store.view(s.code,s.seat.participantToken).me!.bank).toMatchObject({availablePoints:75,reservedPoints:25,settledRiskNet:0});
    expect(()=>s.store.pick(s.code,{participantToken:s.seat.participantToken,requestId:'change-free',questionId:s.question.id,optionId:'summit'})).toThrow(expect.objectContaining({code:'CALL_ALREADY_COMMITTED'}));
    expect(()=>s.store.getCommitmentReceipt(s.code,s.other.participantToken,'commit-1')).toThrow(expect.objectContaining({code:'RECEIPT_NOT_FOUND'}));
    s.advance(60000);s.restart();
    expect(s.store.acceptCommitment(s.code,request).commitment).toEqual(commitment);
    let view=s.store.view(s.code,s.seat.participantToken);
    for(let i=0;i<100&&view.room.phase!=='final';i++){s.advance(100000);view=s.store.view(s.code,s.seat.participantToken);}
    expect(view.me!.bank).toMatchObject({reservedPoints:0,settledRiskNet:50,correctionDebt:0});
    expect(view.me!.bank!.availablePoints).toBe(150+view.standings.find(row=>row.participantId===s.seat.participantId)!.predictionPoints);
    expect(view.me!.commitments![0].state).toBe('won');
    const row=view.standings.find(row=>row.participantId===s.seat.participantId)!;
    expect(row.total).toBeCloseTo(row.fantasyPoints+row.predictionPoints+50,2);
    const season=view.season.standings;
    s.restart();expect(s.store.view(s.code).season.standings).toEqual(season);
    expect(JSON.stringify(s.store.view(s.code))).not.toMatch(/grantPoints|availablePoints|quoteId|commitUnits|pending/);
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});

it('defaults commitments off and rejects missing probability without blocking free predictions',()=>{
  const disabled=setup({enableCommitments:false});
  expect(disabled.store.view(disabled.code,disabled.seat.participantToken).me).not.toHaveProperty('bank');
  expect(()=>disabled.store.quoteCommitment(disabled.code,{participantToken:disabled.seat.participantToken,questionId:disabled.question.id,optionId:'harbor',commitPoints:25})).toThrow(expect.objectContaining({code:'FEATURE_DISABLED'}));
  const enabled=setup();
  expect(()=>enabled.store.quoteCommitment(enabled.code,{participantToken:enabled.seat.participantToken,questionId:enabled.question.id,optionId:'summit',commitPoints:25})).toThrow(expect.objectContaining({code:'PROBABILITY_UNAVAILABLE'}));
  expect(()=>enabled.store.quoteCommitment(enabled.code,{participantToken:enabled.seat.participantToken,questionId:enabled.question.id,optionId:'summit',commitPoints:25})).toThrow(RoomError);
  expect(enabled.store.pick(enabled.code,{participantToken:enabled.seat.participantToken,requestId:'free',questionId:enabled.question.id,optionId:'summit'}).receipt).toBeDefined();
});

it('binds a pending confirmation to actor, quote and target, and expires it strictly',()=>{
  const s=setup();const input={participantToken:s.seat.participantToken,questionId:s.question.id,optionId:'harbor',commitPoints:25};
  expect(()=>s.store.confirmPendingCommitment(s.code,{participantToken:s.seat.participantToken,requestId:'unrelated-yes'})).toThrow(expect.objectContaining({code:'NO_PENDING_CONFIRMATION'}));
  const {quote}=s.store.quoteCommitmentForVoice(s.code,input);
  expect(()=>s.store.confirmPendingCommitment(s.code,{participantToken:s.other.participantToken,requestId:'wrong-actor'})).toThrow(expect.objectContaining({code:'NO_PENDING_CONFIRMATION'}));
  const accepted=s.store.confirmPendingCommitment(s.code,{participantToken:s.seat.participantToken,requestId:'confirm-1'});
  expect(accepted.commitment.quoteId).toBe(quote.quoteId);
  expect(s.store.confirmPendingCommitment(s.code,{participantToken:s.seat.participantToken,requestId:'confirm-1'})).toEqual(accepted);
  expect(()=>s.store.confirmPendingCommitment(s.code,{participantToken:s.seat.participantToken,requestId:'new-confirm'})).toThrow(expect.objectContaining({code:'NO_PENDING_CONFIRMATION'}));
  const expired=setup();expired.store.quoteCommitmentForVoice(expired.code,{...input,participantToken:expired.seat.participantToken,questionId:expired.question.id});expired.advance(8000);
  expect(()=>expired.store.confirmPendingCommitment(expired.code,{participantToken:expired.seat.participantToken,requestId:'too-late'})).toThrow(expect.objectContaining({code:'QUOTE_EXPIRED'}));
});
