import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {BasketballProvider,ProviderGame,ProviderSnapshot} from './provider.js';
const id=z.object({id:z.string().min(1)}).passthrough();
const gameSchema=z.object({id:z.string().min(1),scheduled:z.string(),status:z.string(),home:id,away:id}).passthrough();
const statSchema=z.object({type:z.string(),team:id.optional(),player:id.optional(),made:z.boolean().optional(),points:z.number().int().optional(),shot_type:z.string().optional(),three_point_shot:z.boolean().optional()}).passthrough();
const eventSchema=z.object({id:z.string().min(1),sequence:z.number().int().safe().nonnegative(),clock:z.string(),updated:z.string(),wall_clock:z.string(),event_type:z.string(),statistics:z.array(statSchema).default([]),possession:id.optional()}).passthrough();
const snapshotSchema=gameSchema.extend({periods:z.array(z.object({number:z.number().int().positive(),sequence:z.number().int().positive().optional(),type:z.string(),events:z.array(eventSchema)}).passthrough())});
const timestamp=(value:string)=>{const time=Date.parse(value);if(!Number.isSafeInteger(time)||time<=0)throw new Error('Invalid Sportradar timestamp');return time;};
const metadata=(game:z.infer<typeof gameSchema>):ProviderGame=>({providerGameId:game.id,leagueId:'NBA',homeTeamId:game.home.id,awayTeamId:game.away.id,scheduledAt:timestamp(game.scheduled)});
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** NBA v8 REST JSON only. wall_clock is entry time, so precision remains unverified. */
export function parseSportradarSnapshot(input:unknown,receivedAt:number):ProviderSnapshot{
 const game=snapshotSchema.parse(input);if(!Number.isFinite(receivedAt)||receivedAt<0)throw new Error('Invalid receive time');
 const events:Record<string,unknown>[]=[];const ids=new Set<string>();let lastElapsed=0;
 const periods=[...game.periods].sort((a,b)=>(a.sequence??a.number)-(b.sequence??b.number));
 for(const period of periods){
  const n=period.sequence??period.number;const overtime=period.type==='OT'||period.type==='overtime';const duration=overtime?300000:720000;
  if((n>4)!==overtime)throw new Error('Unsupported NBA period');
  for(const event of [...period.events].sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id))){
   if(ids.has(event.id))throw new Error('Duplicate Sportradar event identity');ids.add(event.id);
   const match=/^(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(event.clock);
   if(!match)throw new Error('Invalid NBA game clock');
   const remaining=Number(match[1])*60000+Number(match[2])*1000+Number((match[3]??'').padEnd(3,'0'));
   if(remaining>duration)throw new Error('Invalid NBA period clock');
   const gameElapsedMs=n<=4?(n-1)*720000+duration-remaining:2880000+(n-5)*300000+duration-remaining;
   if(gameElapsedMs<lastElapsed)throw new Error('Sportradar chronology gap');lastElapsed=gameElapsedMs;
   const revision=timestamp(event.updated),occurredAt=timestamp(event.wall_clock);
   const base={rawPayloadRef:'sha256:'+hash(event),provider:'sportradar',gameId:game.id,revision,gameElapsedMs,occurredAt,receivedAt};
   const emit=(suffix:string,fields:Record<string,unknown>)=>events.push({...base,eventId:JSON.stringify([event.id,suffix]),sequence:events.length+1,...fields});
   const keys=new Set<string>();
   for(const stat of event.statistics){
    if(!stat.player){if(['rebound','turnover'].includes(stat.type))continue;throw new Error('Unsupported uncredited provider statistic');}
    if(!stat.team||![game.home.id,game.away.id].includes(stat.team.id))throw new Error('Unknown statistic team');
    const key=JSON.stringify([stat.type,stat.player.id]);if(keys.has(key))throw new Error('Duplicate statistic credit');keys.add(key);
    const entity={teamId:stat.team.id,playerId:stat.player.id};
    if(stat.type==='fieldgoal'||stat.type==='freethrow'){
     if(stat.made===undefined)throw new Error('Missing shot result');
     const value=stat.type==='freethrow'?1:stat.three_point_shot===true||stat.points===3?3:2;
     if(stat.made&&stat.points!==value)throw new Error('Invalid provider score');
     const shotType=value===1?'free_throw':value===3?'three_pointer':stat.shot_type==='layup'?'layup':stat.shot_type==='dunk'?'dunk':'jump_shot';
     emit(key,{...entity,kind:stat.made?'score':'shot_attempt',shotType,...(stat.made?{scoreValue:value,statDeltas:{[value===1?'ft':value===2?'pts2':'pts3']:1}}:{})});
    }else{
     const kind=({rebound:'reb',assist:'ast',steal:'stl',block:'blk',turnover:'tov'} as Record<string,string>)[stat.type];
     if(!kind)throw new Error('Unsupported provider statistic');emit(key,{...entity,kind:'stat',statDeltas:{[kind]:1}});
    }
   }
   if(event.possession){if(![game.home.id,game.away.id].includes(event.possession.id))throw new Error('Unknown possession team');emit('possession',{kind:'possession',teamId:event.possession.id});}
   else if(!event.statistics.length)emit('administrative',{kind:'period'});
  }
 }
 if(game.status==='closed'){if(!events.length)throw new Error('Closed game has no event history');const revision=Math.max(...events.map(e=>e.revision as number));const occurredAt=Math.max(...events.map(e=>e.occurredAt as number));events.push({provider:'sportradar',gameId:game.id,eventId:JSON.stringify([game.id,'closed']),revision,gameElapsedMs:lastElapsed,occurredAt,receivedAt,kind:'final',sequence:events.length+1});}
 return {game:metadata(game),cursor:hash(input),events,reconciled:true};
}
export type SportradarOptions={apiKey:string;accessLevel:'trial'|'production';scheduleDate:string;fetch?:typeof fetch;now?:()=>number;timeoutMs?:number;maxResponseBytes?:number};
export class SportradarBasketballProvider implements BasketballProvider{
 readonly name='sportradar';readonly capabilities={teamPossession:true,playerPossession:false,continuousBall:false,timestampPrecisionMs:null,preActionSuspensionVerified:false};
 constructor(private readonly options:SportradarOptions){if(!options.apiKey.trim()||!['trial','production'].includes(options.accessLevel)||!/^\d{4}\/\d{2}\/\d{2}$/.test(options.scheduleDate))throw new Error('Invalid Sportradar server configuration');}
 private async read(path:string,signal:AbortSignal):Promise<unknown>{
  signal.throwIfAborted();const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(this.options.timeoutMs??10000)]);
  let response:Response;
  try{response=await (this.options.fetch??fetch)(`https://api.sportradar.com/nba/${this.options.accessLevel}/v8/en/${path}`,{headers:{'x-api-key':this.options.apiKey,accept:'application/json'},signal:requestSignal,redirect:'error'});}
  catch(error){if(signal.aborted)throw signal.reason;throw new TypeError('Sportradar transport unavailable');}
  if(!response.ok){const retry=response.headers.get('retry-after');const seconds=Number(retry);const retryAfterMs=retry===null?0:Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(retry)-(this.options.now??Date.now)());throw Object.assign(new Error(`Sportradar HTTP ${response.status}`),{status:response.status,retryAfterMs:Number.isFinite(retryAfterMs)?retryAfterMs:0});}
  const limit=this.options.maxResponseBytes??8*1024*1024;
  if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Invalid provider response limit');
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty provider response');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){requestSignal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit)throw new Error('Provider response limit exceeded');chunks.push(chunk.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async discover(signal:AbortSignal):Promise<ProviderGame[]>{const data=z.object({games:z.array(gameSchema)}).parse(await this.read(`games/${this.options.scheduleDate}/schedule.json`,signal));return data.games.map(metadata);}
 async snapshot(gameId:string,signal:AbortSignal):Promise<ProviderSnapshot>{if(!/^[a-zA-Z0-9-]+$/.test(gameId))throw new Error('Invalid provider game ID');const snapshot=parseSportradarSnapshot(await this.read(`games/${gameId}/pbp.json`,signal),(this.options.now??Date.now)());if(snapshot.game.providerGameId!==gameId)throw new Error('Provider game mismatch');return snapshot;}
 async poll(gameId:string,_cursor:string,signal:AbortSignal){const result=await this.snapshot(gameId,signal);return {cursor:result.cursor,events:result.events,heartbeatAt:(this.options.now??Date.now)(),authoritative:true};}
}
