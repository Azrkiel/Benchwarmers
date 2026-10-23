import {createHash} from 'node:crypto';
import {validateBasketballEvent,type BasketballEvent,type BasketballCatalog} from '../../room/basketball/events.js';
import {initialBasketballState,reduceBasketballEvent} from '../../room/basketball/reducer.js';
import type {NormalizedProviderEvent} from './provider.js';
export type ProviderJournal={entries:NormalizedProviderEvent[];events:BasketballEvent[];resultVersion:string};
const identity=(entry:NormalizedProviderEvent)=>JSON.stringify([entry.provider,entry.providerEventId]);
// receivedAt is local observation metadata, not part of the vendor's revision content.
const content=(entry:NormalizedProviderEvent)=>JSON.stringify({...entry,event:{...entry.event,receivedAt:0}});
/** Append-only accepted revisions; rebuild projections from the latest version of each event. */
export function reconcileJournal(previous:ProviderJournal|undefined,batch:NormalizedProviderEvent[],catalog:BasketballCatalog){
 const entries=structuredClone(previous?.entries??[]);
 const versions=new Map(entries.map(e=>[JSON.stringify([identity(e),e.revision]),e]));
 for(const entry of batch){
  validateBasketballEvent(entry.event,catalog);
  if(!entry.provider||!entry.providerEventId||!Number.isSafeInteger(entry.revision)||entry.revision<1||entry.revision!==entry.event.revision)throw new Error('Invalid provider revision identity');
  const key=JSON.stringify([identity(entry),entry.revision]);const existing=versions.get(key);
  if(existing){if(content(existing)!==content(entry))throw new Error('Provider revision conflict');continue;}
  entries.push(structuredClone(entry));versions.set(key,entry);
 }
 const latest=new Map<string,NormalizedProviderEvent>();
 for(const entry of entries){const key=identity(entry);if(!latest.has(key)||latest.get(key)!.revision<entry.revision)latest.set(key,entry);}
 const ordered=[...latest.values()].sort((a,b)=>a.event.sequence-b.event.sequence);
 const internalIds=new Set<string>();
 let state=initialBasketballState(catalog);
 for(let i=0;i<ordered.length;i++){
  const entry=ordered[i];
  if(internalIds.has(entry.event.id))throw new Error('Provider internal event identity conflict');internalIds.add(entry.event.id);
  if(i&&entry.event.sequence===ordered[i-1].event.sequence)throw new Error('Provider sequence conflict');
  if(entry.event.sequence!==i+1)throw new Error('Provider sequence gap');
  state=reduceBasketballEvent(state,entry.event,catalog).state;
 }
 const events=ordered.map(entry=>structuredClone(entry.event));
 const resultVersion=createHash('sha256').update(ordered.map(content).join('\n')).digest('hex');
 return {journal:{entries,events,resultVersion},state};
}
