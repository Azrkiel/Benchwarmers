import {expect,it} from 'vitest';
import {ingestProviderBatch,runBasketballProvider} from '../../src/live/basketball/runner.js';
const mapping={provider:'fixture',gameId:'external',catalog:{gameId:'g',teamIds:['h','a'],playerTeams:{}},teams:{home:'h'},players:{}};
const event={provider:'fixture',gameId:'external',eventId:'e',revision:1,sequence:1,gameElapsedMs:0,occurredAt:10,receivedAt:20,kind:'possession',teamId:'home'};
const provider={name:'fixture',capabilities:{teamPossession:true,playerPossession:false,continuousBall:false,timestampPrecisionMs:null,preActionSuspensionVerified:false},discover:async()=>[],snapshot:async()=>({game:{providerGameId:'external',leagueId:'NBA',homeTeamId:'home',awayTeamId:'away',scheduledAt:0},cursor:'next',events:[event],reconciled:true}),poll:async()=>({cursor:'next',events:[event],heartbeatAt:20})};
it('persists normalized projection and cursor before publishing and resumes without another snapshot',async()=>{
 let durable:any=null;const order:string[]=[];let snapshots=0;
 const options={provider:{...provider,snapshot:async()=>{snapshots++;return provider.snapshot();}},gameId:'external',mapping,signal:new AbortController().signal,now:()=>20,store:{load:async()=>durable,save:async(value:any)=>{order.push('save');durable=value;}},publish:async()=>{order.push('publish');}};
 await ingestProviderBatch(options);await ingestProviderBatch(options);
 expect(order).toEqual(['save','publish','save','publish']);expect(snapshots).toBe(1);expect(durable.cursor).toBe('next');expect(durable.state.possessionTeamId).toBe('h');expect(durable.journal.entries).toHaveLength(1);
});
it('does not publish or advance a checkpoint after failed storage',async()=>{
 let published=false;await expect(ingestProviderBatch({provider,gameId:'external',mapping,signal:new AbortController().signal,now:()=>20,store:{load:async()=>null,save:async()=>{throw new Error('disk');}},publish:()=>{published=true;}})).rejects.toThrow('disk');expect(published).toBe(false);
});
it('bounds retries and obeys rate-limit delay; cancellation exits without another request',async()=>{
 let calls=0;const delays:number[]=[];const controller=new AbortController();
 await expect(runBasketballProvider({provider:{...provider,snapshot:async()=>{calls++;throw Object.assign(new Error('limited'),{status:429,retryAfterMs:4000});}},gameId:'external',mapping,signal:controller.signal,now:()=>20,store:{load:async()=>null,save:async()=>{}},publish:()=>{},maxRetries:2,sleep:async(ms)=>{delays.push(ms);}})).rejects.toThrow('limited');
 expect(calls).toBe(3);expect(delays).toEqual([4000,4000]);
 controller.abort();await runBasketballProvider({provider,gameId:'external',mapping,signal:controller.signal,store:{load:async()=>null,save:async()=>{}},publish:()=>{throw new Error('unreachable');}});
});
it('quarantines removed authoritative snapshot identities before saving stale projections',async()=>{
 let durable:any=null;let saves=0;
 const options={provider,gameId:'external',mapping,signal:new AbortController().signal,now:()=>20,store:{load:async()=>durable,save:async(value:any)=>{saves++;durable=value;}},publish:()=>{}};
 await ingestProviderBatch(options);
 await expect(ingestProviderBatch({...options,provider:{...provider,poll:async()=>({cursor:'removed',events:[],heartbeatAt:20,authoritative:true})}})).rejects.toThrow(/removed/i);expect(saves).toBe(1);
});
it('does not retry earlier than a long provider Retry-After',async()=>{
 let calls=0;const options={provider:{...provider,snapshot:async()=>{calls++;throw Object.assign(new Error('quota'),{status:429,retryAfterMs:120000});}},gameId:'external',mapping,signal:new AbortController().signal,store:{load:async()=>null,save:async()=>{}},publish:()=>{},maxBackoffMs:30000,sleep:async()=>{}};
 await expect(runBasketballProvider(options)).rejects.toThrow('quota');expect(calls).toBe(1);
});
