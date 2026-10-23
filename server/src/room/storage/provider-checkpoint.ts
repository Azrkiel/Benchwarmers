import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import type { BasketballCatalog } from '../basketball/events.js';
import type { ProviderCheckpoint, ProviderCheckpointStore } from '../../live/basketball/runner.js';
import type { NormalizedProviderEvent } from '../../live/basketball/provider.js';
import { reconcileJournal } from '../../live/basketball/reconcile.js';
import { StorageConflict } from './repository.js';

interface CheckpointIdentity {provider:string;gameId:string;catalog:BasketballCatalog}
const revisionIdentity=(entry:NormalizedProviderEvent)=>JSON.stringify([entry.providerEventId,entry.revision]);

/** Durable ingestion authority; publication is at least once and consumers use resultVersion idempotency.
 * Shares a SQLite file with room storage without changing its schema version or room tables.
 */
export class SqliteProviderCheckpointStore implements ProviderCheckpointStore {
  private readonly db:DatabaseSync;
  private readonly identity:CheckpointIdentity;
  private revision=0;
  constructor(file:string,identity:CheckpointIdentity){
    if(!identity.provider||!identity.gameId)throw new Error('Invalid provider checkpoint identity.');
    this.identity=structuredClone(identity);
    if(file!==':memory:'){
      fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
      if(!fs.existsSync(file)){const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);}
    }
    this.db=new DatabaseSync(file);
    try{
      this.db.exec(`PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS provider_checkpoint_head(
          provider TEXT NOT NULL,game_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL,
          PRIMARY KEY(provider,game_id));
        CREATE TABLE IF NOT EXISTS provider_event_revisions(
          provider TEXT NOT NULL,game_id TEXT NOT NULL,event_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),
          ordinal INTEGER NOT NULL CHECK(ordinal>0),payload TEXT NOT NULL,
          PRIMARY KEY(provider,game_id,event_id,revision),UNIQUE(provider,game_id,ordinal));
        CREATE TRIGGER IF NOT EXISTS provider_revisions_no_update BEFORE UPDATE ON provider_event_revisions
          BEGIN SELECT RAISE(ABORT,'Provider revision history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS provider_revisions_no_delete BEFORE DELETE ON provider_event_revisions
          BEGIN SELECT RAISE(ABORT,'Provider revision history is immutable.'); END;`);
      this.revision=Number(this.head()?.revision??0);
    }catch(error){this.db.close();throw error;}
  }
  private head(){return this.db.prepare('SELECT revision,payload FROM provider_checkpoint_head WHERE provider=? AND game_id=?').get(this.identity.provider,this.identity.gameId);}
  private history():NormalizedProviderEvent[]{
    const rows=this.db.prepare('SELECT event_id,revision,ordinal,payload FROM provider_event_revisions WHERE provider=? AND game_id=? ORDER BY ordinal').all(this.identity.provider,this.identity.gameId);
    return rows.map((row,index)=>{
      const entry=JSON.parse(String(row.payload)) as NormalizedProviderEvent;
      if(Number(row.ordinal)!==index+1||entry.provider!==this.identity.provider||entry.providerEventId!==row.event_id||entry.revision!==Number(row.revision))throw new Error('Provider checkpoint history identity mismatch.');
      return entry;
    });
  }
  private validate(input:ProviderCheckpoint):ProviderCheckpoint{
    const checkpoint=structuredClone(input);
    if(checkpoint?.provider!==this.identity.provider||checkpoint?.gameId!==this.identity.gameId)throw new Error('Provider checkpoint identity mismatch.');
    if(typeof checkpoint.cursor!=='string'||checkpoint.cursor.length===0||!Number.isFinite(checkpoint.heartbeatAt)||checkpoint.heartbeatAt<0||checkpoint.reconciled!==true||!Array.isArray(checkpoint.journal?.entries))throw new Error('Invalid provider checkpoint authority.');
    if(checkpoint.journal.entries.some(entry=>entry.provider!==this.identity.provider))throw new Error('Provider checkpoint event identity mismatch.');
    const replay=reconcileJournal(undefined,checkpoint.journal.entries,this.identity.catalog);
    if(!isDeepStrictEqual(replay.state,checkpoint.state)||!isDeepStrictEqual(replay.journal,checkpoint.journal))throw new Error('Provider checkpoint projection does not match journal replay.');
    return checkpoint;
  }
  async load():Promise<ProviderCheckpoint|null>{
    this.db.exec('BEGIN');
    try{
      const head=this.head(),history=this.history();
      if(!head){if(history.length)throw new Error('Provider checkpoint history has no head.');this.db.exec('COMMIT');this.revision=0;return null;}
      const checkpoint=this.validate(JSON.parse(String(head.payload)) as ProviderCheckpoint);
      if(!isDeepStrictEqual(history,checkpoint.journal.entries))throw new Error('Provider checkpoint history does not match its head.');
      const revision=Number(head.revision);if(!Number.isSafeInteger(revision)||revision<1)throw new Error('Invalid checkpoint head revision.');
      this.db.exec('COMMIT');this.revision=revision;return checkpoint;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  async save(input:ProviderCheckpoint):Promise<void>{
    const checkpoint=this.validate(input),payload=JSON.stringify(checkpoint);
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const head=this.head(),actual=Number(head?.revision??0);
      if(actual!==this.revision)throw new StorageConflict();
      const next=actual+1;if(!Number.isSafeInteger(next))throw new Error('Provider checkpoint revision overflow.');
      const prior=this.history();
      const entries=new Map(checkpoint.journal.entries.map(entry=>[revisionIdentity(entry),entry]));
      if(prior.some(entry=>!isDeepStrictEqual(entries.get(revisionIdentity(entry)),entry)))throw new Error('Provider checkpoint history cannot be removed or changed.');
      // Existing accepted revisions retain their original ordering and payloads.
      if(!isDeepStrictEqual(checkpoint.journal.entries.slice(0,prior.length),prior))throw new Error('Provider checkpoint history cannot be reordered.');
      const insert=this.db.prepare('INSERT INTO provider_event_revisions(provider,game_id,event_id,revision,ordinal,payload) VALUES(?,?,?,?,?,?)');
      checkpoint.journal.entries.slice(prior.length).forEach((entry,index)=>insert.run(this.identity.provider,this.identity.gameId,entry.providerEventId,entry.revision,prior.length+index+1,JSON.stringify(entry)));
      this.db.prepare(`INSERT INTO provider_checkpoint_head(provider,game_id,revision,payload) VALUES(?,?,?,?)
        ON CONFLICT(provider,game_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload`).run(this.identity.provider,this.identity.gameId,next,payload);
      this.db.exec('COMMIT');this.revision=next;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close():void{this.db.close();}
}
