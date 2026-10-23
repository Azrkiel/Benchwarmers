import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import demo from '../../src/room/basketball/demo.json' with {type:'json'};
import type {BasketballEvent} from '../../src/room/basketball/events.js';
import {RoomStore} from '../../src/room/store.js';

it('reconciles a real persisted room final, reverses rewards and replaces its season night without changing receipts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'correction-store-')),dataFile=path.join(dir,'rooms.json');let now=1000;
 try {
  const options={dataFile,now:()=>now,enableCorrections:true,enablePregame:true,enableCommitments:true};
  let store=new RoomStore(options);const room=store.create({gameId:'harbor-vs-summit',speed:4}),code=room.view.room.code,seat=store.join(code,{name:'Maya'});
  store.pickPregame(code,{participantToken:seat.participantToken,requestId:'winner',optionId:'harbor'});
  store.host(code,{hostToken:room.hostToken,action:'start'});now+=100000;const q=store.view(code).question!;
  const accepted=store.pick(code,{participantToken:seat.participantToken,requestId:'q1',questionId:q.id,optionId:'harbor'}).receipt;
  let view=store.view(code,seat.participantToken);
  for(let i=0;i<10&&view.room.phase!=='final';i++){now+=100000;view=store.view(code,seat.participantToken);}
  const events=structuredClone(demo.beats.filter(beat=>beat.event).map(beat=>beat.event)) as BasketballEvent[];
  const first=events.find(event=>event.kind==='score')!;first.teamId='summit';first.playerId='sum-pg-2';first.revision++;
  const resultVersion=createHash('sha256').update('corrected-final').digest('hex'),request={events,resultVersion};
  const before=fs.readFileSync(dataFile,'utf8');vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('disk');});
  expect(()=>store.reconcileBasketballFinal(code,request)).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));vi.restoreAllMocks();expect(fs.readFileSync(dataFile,'utf8')).toBe(before);
  const corrected=store.reconcileBasketballFinal(code,request);
  expect(corrected.game.home.score).toBe(55);expect(corrected.game.away.score).toBe(58);expect(corrected.game.corrected).toBe(true);
  expect(corrected.pregame!.result!.optionId).toBe('summit');expect(corrected.season.standings[0].nightsPlayed).toBe(1);
  expect(store.view(code,seat.participantToken).me!.bank!.availablePoints).toBe(100);
  expect(store.receipt(code,seat.participantToken,'q1')).toEqual(accepted);
  expect(store.reconcileBasketballFinal(code,request).version).toBe(corrected.version);
  store=new RoomStore({...options,enableCorrections:false});
  expect(store.view(code).game.home.score).toBe(55);expect(store.reconcileBasketballFinal(code,request).season).toEqual(corrected.season);
 } finally {vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});}
});
