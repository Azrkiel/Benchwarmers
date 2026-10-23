import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { RoomStore } from '../../src/room/store.js';

it('rolls back free reward and commitment settlement together, then persists exactly one retry',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'commitment-settle-rollback-'));const dataFile=path.join(dir,'rooms.json');let now=1000;
  const options={dataFile,now:()=>now,enableCommitments:true,probabilities:[{gameId:'harbor-vs-summit',templateId:'next_score_team',optionId:'harbor',estimate:{p:.366,version:'demo',label:'Authored demo',source:'demo_projection',observedAt:0,validUntil:1000000}}]};
  try {
    let store=new RoomStore(options);const created=store.create({gameId:'harbor-vs-summit',speed:4}),code=created.view.room.code;const seat=store.join(code,{name:'Fan'});
    store.host(code,{hostToken:created.hostToken,action:'start'});now+=100000;const open=store.view(code);
    const quote=store.quoteCommitment(code,{participantToken:seat.participantToken,questionId:open.question!.id,optionId:'harbor',commitPoints:25}).quote;
    store.acceptCommitment(code,{participantToken:seat.participantToken,quoteId:quote.quoteId,requestId:'hold'});
    const before=fs.readFileSync(dataFile,'utf8'),acceptedAt=now;
    now+=10000;vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
    expect(()=>store.tick()).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();
    expect(fs.readFileSync(dataFile,'utf8')).toBe(before);
    now=acceptedAt;expect(store.view(code,seat.participantToken).me!.bank).toMatchObject({availablePoints:75,reservedPoints:25,settledRiskNet:0});
    now+=10000;const settled=store.view(code,seat.participantToken);expect(settled.me!.commitments![0].state).toBe('won');
    expect(settled.me!.bank).toMatchObject({reservedPoints:0,settledRiskNet:50});
    const saved=JSON.parse(fs.readFileSync(dataFile,'utf8'));
    expect(saved.rooms[0].points.entries.filter((entry:{reason:string})=>entry.reason==='commit_return')).toHaveLength(1);
    store=new RoomStore(options);expect(store.view(code,seat.participantToken).me!.bank).toEqual(settled.me!.bank);
  } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});
