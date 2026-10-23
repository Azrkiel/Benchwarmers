import {setTimeout as delay} from 'node:timers/promises';
import type {BasketballState} from '../../room/basketball/reducer.js';
import {normalizeProviderEvent} from './normalize.js';
import type {BasketballProvider,ProviderMapping} from './provider.js';
import {reconcileJournal,type ProviderJournal} from './reconcile.js';
export type ProviderCheckpoint={provider:string;gameId:string;cursor:string;journal:ProviderJournal;state:BasketballState;heartbeatAt:number;reconciled:boolean};
export type ProviderCheckpointStore={load():Promise<ProviderCheckpoint|null>;save(checkpoint:ProviderCheckpoint):Promise<void>};
export type IngestOptions={provider:BasketballProvider;gameId:string;mapping:ProviderMapping;signal:AbortSignal;store:ProviderCheckpointStore;publish(checkpoint:ProviderCheckpoint):void|Promise<void>;now?:()=>number};
/** One background ingestion transaction. Store must atomically persist the entire checkpoint. */
export async function ingestProviderBatch(options:IngestOptions):Promise<ProviderCheckpoint>{
 const {provider,gameId,mapping,signal,store}=options;signal.throwIfAborted();
 if(provider.name!==mapping.provider||gameId!==mapping.gameId)throw new Error('Provider mapping mismatch');
 const previous=await store.load();
 if(previous&&(previous.provider!==provider.name||previous.gameId!==gameId))throw new Error('Checkpoint identity mismatch');
 let cursor:string,events:unknown[],heartbeatAt:number,reconciled:boolean;let authoritative=false;
 if(previous){const result=await provider.poll(gameId,previous.cursor,signal);({cursor,events,heartbeatAt}=result);reconciled=previous.reconciled;authoritative=result.authoritative===true;}
 else{const result=await provider.snapshot(gameId,signal);if(result.game.providerGameId!==gameId)throw new Error('Snapshot game mismatch');({cursor,events,reconciled}=result);heartbeatAt=(options.now??Date.now)();}
 signal.throwIfAborted();
 if(!reconciled||!cursor||!Number.isFinite(heartbeatAt)||heartbeatAt<0||heartbeatAt>(options.now??Date.now)())throw new Error('Unreconciled or invalid provider heartbeat');
 const normalized=events.map(event=>normalizeProviderEvent(event,mapping));
 if(authoritative&&previous){const identities=new Set(normalized.map(entry=>JSON.stringify([entry.provider,entry.providerEventId])));if(previous.journal.entries.some(entry=>!identities.has(JSON.stringify([entry.provider,entry.providerEventId]))))throw new Error('Authoritative provider snapshot removed an accepted event; reconciliation required');}
 const projection=reconcileJournal(previous?.journal,normalized,mapping.catalog);
 const next:ProviderCheckpoint={provider:provider.name,gameId,cursor,...projection,heartbeatAt,reconciled:true};
 await store.save(next);
 // Publish errors do not roll back persisted authority; consumers recover using cached snapshots.
 await options.publish(next);return next;
}
export type RunnerOptions=IngestOptions&{pollIntervalMs?:number;maxRetries?:number;maxBackoffMs?:number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>;onUnavailable?:(error:unknown)=>void|Promise<void>};
export async function runBasketballProvider(options:RunnerOptions):Promise<void>{
 const maxRetries=options.maxRetries??4;const ceiling=options.maxBackoffMs??30000;const interval=options.pollIntervalMs??3000;
 if(!Number.isSafeInteger(maxRetries)||maxRetries<0||maxRetries>20||!Number.isFinite(ceiling)||ceiling<1||!Number.isFinite(interval)||interval<1)throw new Error('Invalid provider retry policy');
 const sleep=options.sleep??((ms,signal)=>delay(ms,undefined,{signal}));let retries=0;
 while(!options.signal.aborted){
  try{await ingestProviderBatch(options);retries=0;await sleep(interval,options.signal);}
  catch(error){
   if(options.signal.aborted)return;
   await options.onUnavailable?.(error);
   const status=(error as {status?:number})?.status;
   // Authentication, malformed input and identity failures require operator action.
   const retryable=status===429||(status!==undefined&&status>=500)||error instanceof TypeError;
   if(!retryable||retries>=maxRetries)throw error;
   const requested=(error as {retryAfterMs?:number})?.retryAfterMs;
   if(Number.isFinite(requested)&&requested!>ceiling)throw error;
   const backoff=Math.min(ceiling,Math.max(1000*2**retries,Number.isFinite(requested)?requested!:0));retries++;
   try{await sleep(backoff,options.signal);}catch(waitError){if(options.signal.aborted)return;throw waitError;}
  }
 }
}
