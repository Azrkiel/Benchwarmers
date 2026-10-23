import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import type { SavedRooms } from '../domain.js';
import { validateSavedRooms } from '../persistence.js';
import { StorageConflict, type RoomRepository } from './repository.js';
export { StorageConflict } from './repository.js';

/** Explicit opt-in single-node storage. Snapshot and uniqueness indexes commit together. */
export class SqliteRoomRepository implements RoomRepository {
  private readonly db:DatabaseSync;
  private revision=0;
  constructor(file:string){
    if(file!==':memory:'){
      fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
      if(!fs.existsSync(file)){const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);}
    }
    this.db=new DatabaseSync(file);
    const version=Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if(version!==0&&version!==1){this.db.close();throw new Error('Unsupported SQLite room schema. Use a compatible server.');}
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS backend_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seasons(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>0),season_id TEXT NOT NULL REFERENCES seasons(id),payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants(room_code TEXT NOT NULL REFERENCES rooms(code),actor_id TEXT NOT NULL,PRIMARY KEY(room_code,actor_id));
      CREATE TABLE IF NOT EXISTS commitments(room_code TEXT NOT NULL REFERENCES rooms(code),call_id TEXT NOT NULL,actor_id TEXT NOT NULL,target_id TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,
        PRIMARY KEY(room_code,call_id),UNIQUE(room_code,actor_id,target_id),UNIQUE(room_code,actor_id,request_id),FOREIGN KEY(room_code,actor_id) REFERENCES participants(room_code,actor_id));
      CREATE TABLE IF NOT EXISTS receipts(room_code TEXT NOT NULL REFERENCES rooms(code),actor_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('pick','commitment')),request_id TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),payload TEXT NOT NULL,
        PRIMARY KEY(room_code,actor_id,kind,request_id),UNIQUE(room_code,kind,sequence),FOREIGN KEY(room_code,actor_id) REFERENCES participants(room_code,actor_id));
      CREATE TABLE IF NOT EXISTS ledger(room_code TEXT NOT NULL REFERENCES rooms(code),entry_id TEXT NOT NULL,actor_id TEXT NOT NULL,call_id TEXT,units INTEGER NOT NULL CHECK(units>=0 AND units<=9007199254740991),direction TEXT NOT NULL CHECK(direction IN ('credit','debit')),payload TEXT NOT NULL,
        PRIMARY KEY(room_code,entry_id),FOREIGN KEY(room_code,actor_id) REFERENCES participants(room_code,actor_id),FOREIGN KEY(room_code,call_id) REFERENCES commitments(room_code,call_id));
      CREATE TABLE IF NOT EXISTS outcome_versions(room_code TEXT NOT NULL REFERENCES rooms(code) DEFERRABLE INITIALLY DEFERRED,target_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),outcome_key TEXT NOT NULL,PRIMARY KEY(room_code,target_id,revision));
      CREATE TABLE IF NOT EXISTS season_contributions(room_code TEXT NOT NULL REFERENCES rooms(code) DEFERRABLE INITIALLY DEFERRED,result_version TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(room_code,result_version));
      CREATE TABLE IF NOT EXISTS season_contribution_heads(room_code TEXT PRIMARY KEY,result_version TEXT NOT NULL,FOREIGN KEY(room_code,result_version) REFERENCES season_contributions(room_code,result_version) DEFERRABLE INITIALLY DEFERRED);
      PRAGMA user_version=1;`);
    this.revision=Number(this.db.prepare('SELECT revision FROM backend_snapshot WHERE id=1').get()?.revision??0);
  }
  load():SavedRooms|undefined {
    const row=this.db.prepare('SELECT revision,payload FROM backend_snapshot WHERE id=1').get();
    this.revision=Number(row?.revision??0);
    return row?validateSavedRooms(JSON.parse(String(row.payload))):undefined;
  }
  save(input:SavedRooms):void {
    const state=validateSavedRooms(input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const actual=Number(this.db.prepare('SELECT revision FROM backend_snapshot WHERE id=1').get()?.revision??0);
      if(actual!==this.revision)throw new StorageConflict();
      const next=actual+1;if(!Number.isSafeInteger(next))throw new Error('Storage revision overflow.');
      this.db.exec('DELETE FROM ledger; DELETE FROM receipts; DELETE FROM commitments; DELETE FROM participants; DELETE FROM rooms; DELETE FROM seasons;');
      const json=(value:unknown)=>JSON.stringify(value);
      for(const season of state.seasons)this.db.prepare('INSERT INTO seasons VALUES(?,?)').run(season.id,json(season));
      for(const room of state.rooms){
        this.db.prepare('INSERT INTO rooms VALUES(?,?,?,?)').run(room.code,room.version,room.seasonId,json(room));
        for(const actor of room.participants)this.db.prepare('INSERT INTO participants VALUES(?,?)').run(room.code,actor.id);
        for(const call of room.points?.calls??[]){
          this.db.prepare('INSERT INTO commitments VALUES(?,?,?,?,?,?)').run(room.code,call.callId,call.participantId,call.targetId,call.requestId,json(call));
          this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?)').run(room.code,call.participantId,'commitment',call.requestId,call.acceptedSequence,json(call));
          if(call.outcomeRevision>0){
            const previous=this.db.prepare('SELECT outcome_key FROM outcome_versions WHERE room_code=? AND target_id=? AND revision=?').get(room.code,call.targetId,call.outcomeRevision);
            if(previous&&previous.outcome_key!==call.outcomeKey)throw new Error('Outcome revision already has another result.');
            this.db.prepare('INSERT OR IGNORE INTO outcome_versions VALUES(?,?,?,?)').run(room.code,call.targetId,call.outcomeRevision,call.outcomeKey);
          }
        }
        for(const receipt of room.pickReceipts??[])this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?)').run(room.code,receipt.participantId,'pick',receipt.requestId,receipt.acceptanceSequence,json(receipt));
        for(const entry of room.points?.entries??[])this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(room.code,entry.id,entry.participantId,entry.callId??null,entry.units,entry.direction,json(entry));
        const contribution=room.correctionState?.seasonContribution;
        if(contribution){
          const previous=this.db.prepare('SELECT payload FROM season_contributions WHERE room_code=? AND result_version=?').get(room.code,contribution.resultVersion);
          if(previous&&!isDeepStrictEqual(JSON.parse(String(previous.payload)),contribution.rows))throw new Error('Season contribution version already has another result.');
          this.db.prepare('INSERT OR IGNORE INTO season_contributions VALUES(?,?,?)').run(room.code,contribution.resultVersion,json(contribution.rows));
          this.db.prepare('INSERT INTO season_contribution_heads VALUES(?,?) ON CONFLICT(room_code) DO UPDATE SET result_version=excluded.result_version').run(room.code,contribution.resultVersion);
        }
      }
      this.db.prepare('INSERT INTO backend_snapshot(id,revision,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(next,json(state));
      this.db.exec('COMMIT');this.revision=next;
    } catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  backup(destination:string):void {
    if(fs.existsSync(destination))throw new Error('Backup destination already exists.');
    fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});
    this.db.prepare('VACUUM INTO ?').run(path.resolve(destination));
    fs.chmodSync(destination,0o600);
  }
  importJson(source:string):void {
    if(this.load())throw new Error('JSON import requires an empty SQLite room store.');
    const state=validateSavedRooms(JSON.parse(fs.readFileSync(source,'utf8')));
    this.save(state);
  }
  close():void {this.db.close();}
}
