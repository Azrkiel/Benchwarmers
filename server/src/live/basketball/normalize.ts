import { z } from 'zod';
import { basketballEventSchema, validateBasketballEvent } from '../../room/basketball/events.js';
import type { NormalizedProviderEvent, ProviderMapping } from './provider.js';

// Transport adapters must translate their own payload into this internal envelope and
// assign receivedAt from the server clock. This is not a vendor's wire schema.
const envelopeSchema=basketballEventSchema.omit({id:true}).extend({
  provider:z.string().min(1),eventId:z.string().min(1),revision:z.number().int().positive().safe(),sequence:z.number().int().positive().safe(),
}).strict();
export function normalizeProviderEvent(input:unknown,mapping:ProviderMapping):NormalizedProviderEvent {
  const parsed=envelopeSchema.parse(input);
  if(parsed.provider!==mapping.provider||parsed.gameId!==mapping.gameId)throw new Error('Unmapped basketball source or game.');
  const mapId=(id:string|undefined,ids:Readonly<Record<string,string>>)=>{
    if(id===undefined)return undefined;
    if(!Object.hasOwn(ids,id))throw new Error('Unmapped basketball entity.');
    return ids[id];
  };
  const {provider,eventId,...fields}=parsed;
  const event=validateBasketballEvent({...fields,id:JSON.stringify([provider,eventId]),gameId:mapping.catalog.gameId,
    teamId:mapId(parsed.teamId,mapping.teams),playerId:mapId(parsed.playerId,mapping.players)},mapping.catalog);
  return {provider,providerEventId:eventId,revision:parsed.revision,event};
}
