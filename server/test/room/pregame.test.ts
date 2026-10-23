import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect,it,vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { validateSavedRooms } from '../../src/room/persistence.js';

function setup(dataFile?:string,enabled=true) {
  let now=1000;
  const options={dataFile,persist:!!dataFile,now:()=>now,enablePregame:enabled,enableCommitments:true};
  let store=new RoomStore(options);
  const room=store.create({gameId:'harbor-vs-summit',speed:4}),code=room.view.room.code;
  const seat=store.join(code,{name:'Maya'}),other=store.join(code,{name:'Leo'});
  const input={participantToken:seat.participantToken,requestId:'winner-1',optionId:'harbor'};
  return {get store(){return store;},code,room,seat,other,input,advance(ms:number){now+=ms;},restart(disabled=false){store=new RoomStore({...options,enablePregame:!disabled});}};
}

it('offers a gated free winner pick with an explicit replay cutoff and no fictional market prices',()=>{
  const s=setup();const view=s.store.view(s.code);
  expect(view.pregame).toMatchObject({id:'pregame-winner-v1',status:'open',acceptingPicks:true,cutoff:'replay_start',correctPoints:10});
  expect(view.pregame!.options.map(option=>option.id)).toEqual(['harbor','summit']);
  expect(view.pregame!.resolutionRule).toMatch(/final score/i);
  expect(s.store.pregameReference(s.code)).toMatchObject({status:'unavailable',reason:'fictional_game',reference:null,commitmentQuotingEnabled:false});
  const disabled=setup(undefined,false);expect(disabled.store.view(disabled.code)).not.toHaveProperty('pregame');
  expect(()=>disabled.store.pickPregame(disabled.code,disabled.input)).toThrow(expect.objectContaining({code:'FEATURE_DISABLED'}));
});

it('durably receipts winner picks, preserves same-side timing and isolates identities',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pregame-receipt-'));
  try {
    const s=setup(path.join(dir,'rooms.json'));
    const first=s.store.pickPregame(s.code,s.input);expect(first.receipt!.questionId).toBe('pregame-winner-v1');
    expect(first.me!.pregamePick).toMatchObject({optionId:'harbor',acceptedAt:1000});
    expect(s.store.view(s.code)).not.toHaveProperty('me');
    s.advance(50);
    expect(s.store.pickPregame(s.code,{...s.input,requestId:'same'}).me!.pregamePick!.acceptedAt).toBe(1000);
    expect(()=>s.store.pickPregame(s.code,{...s.input,optionId:'summit'})).toThrow(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
    expect(()=>s.store.receipt(s.code,s.other.participantToken,'winner-1')).toThrow(expect.objectContaining({code:'RECEIPT_NOT_FOUND'}));
    expect(()=>s.store.pickPregame(s.code,{...s.input,participantToken:s.room.hostToken})).toThrow(expect.objectContaining({code:'BAD_CREDENTIAL'}));
    s.restart();expect(s.store.receipt(s.code,s.seat.participantToken,'winner-1')).toEqual(first.receipt);
    const changed=s.store.pickPregame(s.code,{...s.input,requestId:'changed',optionId:'summit'});expect(changed.me!.pregamePick!.acceptedAt).toBe(1050);
    s.store.host(s.code,{hostToken:s.room.hostToken,action:'start'});
    expect(s.store.view(s.code).pregame).toMatchObject({status:'locked',acceptingPicks:false,lockedAt:1050});
    expect(s.store.pickPregame(s.code,s.input).receipt).toEqual(first.receipt);
    expect(()=>s.store.pickPregame(s.code,{...s.input,requestId:'late'})).toThrow(expect.objectContaining({code:'PICKS_LOCKED'}));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('rolls back picks and start cutoff together with their failed durable mutations',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pregame-failure-'));
  try {
    const s=setup(path.join(dir,'rooms.json'));
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.store.pickPregame(s.code,s.input)).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(s.store.view(s.code,s.seat.participantToken).me).not.toHaveProperty('pregamePick');
    expect(()=>s.store.receipt(s.code,s.seat.participantToken,'winner-1')).toThrow(expect.objectContaining({code:'RECEIPT_NOT_FOUND'}));
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.store.host(s.code,{hostToken:s.room.hostToken,action:'start'})).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(s.store.view(s.code).pregame!.status).toBe('open');
    expect(s.store.pickPregame(s.code,s.input).receipt).toBeDefined();
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});

it('resolves from the actual replay final, credits one flat free reward and records the season once',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pregame-final-'));
  try {
    const s=setup(path.join(dir,'rooms.json'));
    s.store.pickPregame(s.code,s.input);
    s.store.pickPregame(s.code,{...s.input,participantToken:s.other.participantToken,requestId:'loser',optionId:'summit'});
    s.store.host(s.code,{hostToken:s.room.hostToken,action:'start'});
    s.restart(true);
    expect(s.store.pickPregame(s.code,s.input).receipt!.requestId).toBe('winner-1');
    let view=s.store.view(s.code,s.seat.participantToken);
    expect(view.pregame).not.toHaveProperty('result');
    for(let i=0;i<10&&view.room.phase!=='final';i++){s.advance(100000);view=s.store.view(s.code,s.seat.participantToken);}
    expect(view.room.phase).toBe('final');expect(view.pregame).toMatchObject({status:'resolved',result:{optionId:'harbor'}});
    expect(view.me!.bank).toMatchObject({availablePoints:110,reservedPoints:0,settledRiskNet:0});
    expect(view.standings.find(row=>row.participantId===s.seat.participantId)!.predictionPoints).toBe(10);
    expect(view.standings.find(row=>row.participantId===s.other.participantId)!.predictionPoints).toBe(0);
    const season=view.season.standings;s.restart(true);expect(s.store.view(s.code).season.standings).toEqual(season);
    const saved=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));
    expect(saved.rooms[0].points.entries.filter((entry:{id:string})=>entry.id.includes('pregame-winner-v1'))).toHaveLength(1);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('does not retrofit saved rooms and does not require a spendable bank for free winner picks',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pregame-legacy-')),dataFile=path.join(dir,'rooms.json');
  try {
    const s=setup(dataFile,false);const resumed=new RoomStore({dataFile,enablePregame:true});
    expect(resumed.view(s.code)).not.toHaveProperty('pregame');
    expect(()=>resumed.pickPregame(s.code,s.input)).toThrow(expect.objectContaining({code:'FEATURE_DISABLED'}));
    const free=new RoomStore({persist:false,enablePregame:true});const room=free.create({gameId:'harbor-vs-summit'}),seat=free.join(room.view.room.code,{name:'Free'});
    const view=free.pickPregame(room.view.room.code,{participantToken:seat.participantToken,optionId:'harbor',requestId:'free-no-bank'});
    expect(view.me!.pregamePick!.optionId).toBe('harbor');expect(view.me).not.toHaveProperty('bank');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('rolls back the final reward and season together, then rejects corrupted saved outcomes and rewards',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pregame-final-failure-')),dataFile=path.join(dir,'rooms.json');
  try {
    const s=setup(dataFile);s.store.pickPregame(s.code,s.input);s.store.host(s.code,{hostToken:s.room.hostToken,action:'start'});
    let view=s.store.view(s.code);
    for(let i=0;i<5&&view.question?.id!=='basketball-q4';i++){s.advance(100000);view=s.store.view(s.code);}
    expect(view.question!.id).toBe('basketball-q4');const before=fs.readFileSync(dataFile,'utf8');s.advance(100000);
    vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>s.store.tick()).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(fs.readFileSync(dataFile,'utf8')).toBe(before);
    expect(s.store.view(s.code).room.phase).toBe('final');
    const saved=JSON.parse(fs.readFileSync(dataFile,'utf8'));
    const wrong=structuredClone(saved);wrong.rooms[0].pregame.result.optionId='summit';expect(()=>validateSavedRooms(wrong)).toThrow(/pregame winner/);
    const missing=structuredClone(saved);missing.rooms[0].points.entries=missing.rooms[0].points.entries.filter((entry:{id:string})=>!entry.id.includes('pregame-winner-v1'));missing.rooms[0].participants[0].predictionPoints=0;
    expect(()=>validateSavedRooms(missing)).toThrow(/pregame reward/);
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});
