import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { SqliteProviderCheckpointStore } from '../../src/room/storage/provider-checkpoint.js';
import { StorageConflict } from '../../src/room/storage/repository.js';
import { reconcileJournal } from '../../src/live/basketball/reconcile.js';
import type { ProviderCheckpoint } from '../../src/live/basketball/runner.js';
import { ingestProviderBatch } from '../../src/live/basketball/runner.js';
import { SqliteRoomRepository } from '../../src/room/storage/sqlite.js';

const catalog={gameId:'g',teamIds:['h','a'],playerTeams:{p:'h'}};
const options={provider:'fixture',gameId:'external',catalog};
const score=(revision=1,value:2|3=2)=>({provider:'fixture',providerEventId:'e',revision,event:{id:'fixture:e',revision,sequence:1,gameId:'g',gameElapsedMs:1000,occurredAt:1000,receivedAt:1100,kind:'score' as const,teamId:'h',playerId:'p',scoreValue:value,statDeltas:value===2?{pts2:1}:{pts3:1}}});
const checkpoint=(revision=1):ProviderCheckpoint=>({provider:'fixture',gameId:'external',cursor:`cursor-${revision}`,heartbeatAt:2000,reconciled:true,...reconcileJournal(undefined,revision===1?[score()]:[score(),score(2,3)],catalog)});
const folders:string[]=[];
afterEach(()=>{for(const folder of folders.splice(0))fs.rmSync(folder,{recursive:true,force:true});});
const filename=()=>{const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bw-provider-sqlite-'));folders.push(folder);return path.join(folder,'rooms.sqlite');};

it('restores checkpoints, keeps correction history, and isolates provider/game identities',async()=>{
  const file=filename();let store=new SqliteProviderCheckpointStore(file,options);
  expect(await store.load()).toBeNull();await store.save(checkpoint());await store.save(checkpoint(2));store.close();
  store=new SqliteProviderCheckpointStore(file,options);
  const other=new SqliteProviderCheckpointStore(file,{...options,gameId:'other'});
  const db=new DatabaseSync(file);
  try{
    expect(await store.load()).toEqual(checkpoint(2));expect(await other.load()).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM provider_event_revisions').get()?.n).toBe(2);
    expect(()=>db.exec('DELETE FROM provider_event_revisions')).toThrow(/immutable/i);
    expect(()=>db.exec("UPDATE provider_event_revisions SET payload='{}'")).toThrow(/immutable/i);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
    await expect(other.save(checkpoint())).rejects.toThrow(/identity/i);
  }finally{db.close();other.close();store.close();}
});

it('rejects concurrent stale saves and requires rereading the winning checkpoint',async()=>{
  const file=filename();const a=new SqliteProviderCheckpointStore(file,options),b=new SqliteProviderCheckpointStore(file,options);
  try{
    await a.load();await b.load();await a.save(checkpoint());
    await expect(b.save(checkpoint(2))).rejects.toThrow(StorageConflict);
    expect(await b.load()).toEqual(checkpoint());await b.save(checkpoint(2));
    expect(await a.load()).toEqual(checkpoint(2));
  }finally{a.close();b.close();}
});

it('rolls back event appends if the atomic checkpoint head fails',async()=>{
  const file=filename();const store=new SqliteProviderCheckpointStore(file,options),db=new DatabaseSync(file);
  try{
    await store.save(checkpoint());
    db.exec("CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON provider_checkpoint_head BEGIN SELECT RAISE(ABORT,'disk failure'); END");
    await expect(store.save(checkpoint(2))).rejects.toThrow('disk failure');
    expect(await store.load()).toEqual(checkpoint());expect(db.prepare('SELECT COUNT(*) AS n FROM provider_event_revisions').get()?.n).toBe(1);
    db.exec('DROP TRIGGER fail_checkpoint');await store.save(checkpoint(2));expect(await store.load()).toEqual(checkpoint(2));
  }finally{db.close();store.close();}
});

it('rejects forged projections, mismatched versions, and removal of accepted revisions',async()=>{
  const store=new SqliteProviderCheckpointStore(':memory:',options);
  try{
    const wrong=checkpoint();wrong.state.score.h=999;await expect(store.save(wrong)).rejects.toThrow(/projection/i);
    const version=checkpoint();version.journal.resultVersion='forged';await expect(store.save(version)).rejects.toThrow(/projection/i);
    const events=checkpoint();events.journal.events=[];await expect(store.save(events)).rejects.toThrow(/projection/i);
    await store.save(checkpoint(2));await expect(store.save(checkpoint())).rejects.toThrow(/history/i);
    expect(await store.load()).toEqual(checkpoint(2));
  }finally{store.close();}
});

it('validates replay after a physical backup and rejects tampered restored authority',async()=>{
  const file=filename(),backup=path.join(path.dirname(file),'backup.sqlite');
  const store=new SqliteProviderCheckpointStore(file,options);await store.save(checkpoint(2));
  const db=new DatabaseSync(file);db.prepare('VACUUM INTO ?').run(backup);db.close();store.close();
  const restored=new SqliteProviderCheckpointStore(backup,options);
  try{
    expect(await restored.load()).toEqual(checkpoint(2));
    const corrupt=new DatabaseSync(backup);const bad=checkpoint(2);bad.state.score.h=999;
    corrupt.prepare('UPDATE provider_checkpoint_head SET payload=?').run(JSON.stringify(bad));corrupt.close();
    await expect(restored.load()).rejects.toThrow(/projection/i);
  }finally{restored.close();}
});

it('shares the room database without changing its schema version or room authority',async()=>{
  const file=filename(),rooms=new SqliteRoomRepository(file),store=new SqliteProviderCheckpointStore(file,options);
  try{
    await store.save(checkpoint());expect(rooms.load()).toBeUndefined();
    const db=new DatabaseSync(file);
    try{expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1);expect(db.prepare('SELECT COUNT(*) AS n FROM rooms').get()?.n).toBe(0);}finally{db.close();}
  }finally{store.close();rooms.close();}
});

it('never publishes a failed SQLite save and republishes durable authority after publisher failure',async()=>{
  const file=filename();let store=new SqliteProviderCheckpointStore(file,options);
  const db=new DatabaseSync(file);
  db.exec("CREATE TRIGGER fail_initial BEFORE INSERT ON provider_checkpoint_head BEGIN SELECT RAISE(ABORT,'save failed'); END");
  const mapping={...options,teams:{home:'h'},players:{}};
  const provider={name:'fixture',capabilities:{teamPossession:true,playerPossession:false,continuousBall:false,timestampPrecisionMs:null,preActionSuspensionVerified:false},discover:async()=>[],
    snapshot:async()=>({game:{providerGameId:'external',leagueId:'NBA',homeTeamId:'home',awayTeamId:'away',scheduledAt:0},cursor:'resume',reconciled:true,events:[{provider:'fixture',gameId:'external',eventId:'one',revision:1,sequence:1,gameElapsedMs:0,occurredAt:10,receivedAt:20,kind:'possession',teamId:'home'}]}),
    poll:async()=>({cursor:'resume',events:[],heartbeatAt:20})};
  const versions:string[]=[];
  const run=(publish:(value:ProviderCheckpoint)=>void)=>ingestProviderBatch({store,provider,mapping,gameId:'external',now:()=>20,signal:new AbortController().signal,publish});
  try{
    await expect(run(value=>{versions.push(value.journal.resultVersion);})).rejects.toThrow('save failed');expect(versions).toEqual([]);expect(await store.load()).toBeNull();
    db.exec('DROP TRIGGER fail_initial');
    await expect(run(value=>{versions.push(value.journal.resultVersion);throw new Error('publisher failed');})).rejects.toThrow('publisher failed');
    expect((await store.load())?.cursor).toBe('resume');store.close();store=new SqliteProviderCheckpointStore(file,options);
    await run(value=>{versions.push(value.journal.resultVersion);});expect(versions).toHaveLength(2);expect(versions[1]).toBe(versions[0]);
  }finally{db.close();store.close();}
});
