import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import demo from '../../src/room/basketball/demo.json' with {type:'json'};
import type {BasketballEvent} from '../../src/room/basketball/events.js';
import {RoomStore} from '../../src/room/store.js';
import {SqliteRoomRepository} from '../../src/room/storage/sqlite.js';
it('keeps versioned season contributions unique in SQLite while replacing the active night',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sqlite-correction-')),file=path.join(dir,'rooms.sqlite'),repository=new SqliteRoomRepository(file);let now=1000;
 try {
  const store=new RoomStore({repository,enableCorrections:true,enablePregame:true,now:()=>now}),room=store.create({gameId:'harbor-vs-summit',speed:4}),code=room.view.room.code,seat=store.join(code,{name:'Maya'});
  store.pickPregame(code,{participantToken:seat.participantToken,requestId:'winner',optionId:'harbor'});store.host(code,{hostToken:room.hostToken,action:'start'});
  for(let i=0;i<10&&store.view(code).room.phase!=='final';i++){now+=100000;store.tick();}
  const events=structuredClone(demo.beats.filter(beat=>beat.event).map(beat=>beat.event)) as BasketballEvent[];
  const first=events.find(event=>event.kind==='score')!;first.teamId='summit';first.playerId='sum-pg-2';first.revision++;
  const input={events,resultVersion:createHash('sha256').update('sqlite-corrected').digest('hex')};store.reconcileBasketballFinal(code,input);store.reconcileBasketballFinal(code,input);
  expect(store.view(code).season.standings[0].nightsPlayed).toBe(1);
  const db=new DatabaseSync(file);
  try {
   expect(db.prepare('SELECT count(*) as n FROM season_contributions').get()!.n).toBe(2);
   expect(db.prepare('SELECT result_version FROM season_contribution_heads').get()!.result_version).toBe(input.resultVersion);
   expect(()=>db.exec('INSERT INTO season_contributions SELECT * FROM season_contributions')).toThrow();
  } finally {db.close();}
 } finally {repository.close();fs.rmSync(dir,{recursive:true,force:true});}
});
