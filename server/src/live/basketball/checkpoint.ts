import {randomUUID} from 'node:crypto';
import {open,readFile,rename,unlink} from 'node:fs/promises';
import type {BasketballCatalog} from '../../room/basketball/events.js';
import type {ProviderCheckpoint,ProviderCheckpointStore} from './runner.js';
import {reconcileJournal} from './reconcile.js';
/** Single writer only; same-directory temporary file + fsync + atomic rename before publication. */
export class JsonProviderCheckpointStore implements ProviderCheckpointStore{
 constructor(private readonly path:string,private readonly catalog:BasketballCatalog){}
 private validate(input:ProviderCheckpoint):ProviderCheckpoint{
  try{
   if(!input||typeof input.provider!=='string'||!input.provider||typeof input.gameId!=='string'||!input.gameId||typeof input.cursor!=='string'||!input.cursor||input.reconciled!==true||!Number.isFinite(input.heartbeatAt)||input.heartbeatAt<0||!Array.isArray(input.journal?.entries))throw new Error();
   if(input.journal.entries.some(entry=>entry.provider!==input.provider))throw new Error();
   const projection=reconcileJournal(undefined,input.journal.entries,this.catalog);
   if(projection.journal.resultVersion!==input.journal.resultVersion||JSON.stringify(projection.state)!==JSON.stringify(input.state))throw new Error();
   return {...input,...projection};
  }catch{throw new Error('Invalid provider checkpoint; operator recovery required');}
 }
 async load():Promise<ProviderCheckpoint|null>{
  let text:string;try{text=await readFile(this.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  try{return this.validate(JSON.parse(text));}catch{throw new Error('Invalid provider checkpoint; operator recovery required');}
 }
 async save(input:ProviderCheckpoint):Promise<void>{
  const checkpoint=this.validate(input);const temporary=`${this.path}.${randomUUID()}.tmp`;
  try{const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(checkpoint));await file.sync();}finally{await file.close();}await rename(temporary,this.path);}
  finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
 }
}
