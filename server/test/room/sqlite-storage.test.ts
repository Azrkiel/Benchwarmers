import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../src/room/store.js';
import { SqliteRoomRepository, StorageConflict } from '../../src/room/storage/sqlite.js';

it('persists real room transactions and receipts in SQLite across connections and backup restore',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-sqlite-'));
  const repositories:SqliteRoomRepository[]=[];
  const repository=(file='rooms.sqlite')=>{const r=new SqliteRoomRepository(path.join(dir,file));repositories.push(r);return r;};
  try {
    const repo=repository(),store=new RoomStore({repository:repo,enablePregame:true});
    const room=store.create({gameId:'harbor-vs-summit'}),code=room.view.room.code,seat=store.join(code,{name:'Fan'});
    const input={participantToken:seat.participantToken,requestId:'durable',optionId:'harbor'};
    const accepted=store.pickPregame(code,input);
    const second=new RoomStore({repository:repository(),enablePregame:true});
    expect(second.receipt(code,seat.participantToken,'durable')).toEqual(accepted.receipt);
    second.join(code,{name:'Second'});
    expect(store.view(code).room.participantCount).toBe(2);
    const backup=path.join(dir,'backup.sqlite');repo.backup(backup);
    fs.copyFileSync(backup,path.join(dir,'restore.sqlite'));
    const restored=new RoomStore({repository:repository('restore.sqlite'),enablePregame:true});
    expect(restored.pickPregame(code,input).receipt).toEqual(accepted.receipt);
    expect(restored.view(code).room.participantCount).toBe(2);
  } finally {repositories.forEach(r=>r.close());fs.rmSync(dir,{recursive:true,force:true});}
});

it('rejects a stale snapshot atomically instead of overwriting another writer',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-sqlite-cas-')),file=path.join(dir,'rooms.sqlite');
  const a=new SqliteRoomRepository(file),b=new SqliteRoomRepository(file);
  try {
    const store=new RoomStore({repository:a});store.create();
    const old=a.load()!;b.load();const next=structuredClone(old);next.rooms[0].name='Other writer';next.rooms[0].version++;
    b.save(next);
    expect(()=>a.save(old)).toThrow(StorageConflict);
    expect(a.load()!.rooms[0].name).toBe('Other writer');
  } finally {a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it('enforces receipt uniqueness in the database and refuses to overwrite a backup',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-sqlite-unique-')),file=path.join(dir,'rooms.sqlite'),repo=new SqliteRoomRepository(file);
  try {
    const store=new RoomStore({repository:repo,enablePregame:true}),room=store.create({gameId:'harbor-vs-summit'}),code=room.view.room.code,seat=store.join(code,{name:'Fan'});
    store.pickPregame(code,{participantToken:seat.participantToken,requestId:'same',optionId:'harbor'});
    const db=new DatabaseSync(file);
    try {
      expect(()=>db.prepare('INSERT INTO receipts(room_code, actor_id, kind, request_id, sequence, payload) SELECT room_code, actor_id, kind, request_id, sequence + 1, payload FROM receipts').run()).toThrow();
    } finally {db.close();}
    const backup=path.join(dir,'backup.sqlite');repo.backup(backup);expect(()=>repo.backup(backup)).toThrow();
  } finally {repo.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it('rolls back all database indexes and private state after a failure midway through a room save',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-sqlite-rollback-')),file=path.join(dir,'rooms.sqlite'),repo=new SqliteRoomRepository(file);
 try {
  const store=new RoomStore({repository:repo,enableCommitments:true}),room=store.create({gameId:'harbor-vs-summit'}),code=room.view.room.code;
  store.join(code,{name:'First'});const before=repo.load();
  const db=new DatabaseSync(file);
  try {db.exec("CREATE TRIGGER fail_ledger BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
   expect(()=>store.join(code,{name:'Second'})).toThrow(expect.objectContaining({code:'ROOM_SAVE_FAILED'}));
   expect(repo.load()).toEqual(before);expect(db.prepare('SELECT count(*) as n FROM participants').get()!.n).toBe(1);
   db.exec('DROP TRIGGER fail_ledger');store.join(code,{name:'Second'});expect(store.view(code).room.participantCount).toBe(2);
  } finally {db.close();}
 } finally {repo.close();fs.rmSync(dir,{recursive:true,force:true});}
});
