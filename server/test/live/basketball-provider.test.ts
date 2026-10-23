import {normalizeProviderEvent} from '../../src/live/basketball/normalize.js';
import {reconcileJournal} from '../../src/live/basketball/reconcile.js';
import {expect,it} from 'vitest';
import {SportradarBasketballProvider,parseSportradarSnapshot} from '../../src/live/basketball/sportradar.js';
// Entirely synthetic NBA v8-shaped data, no captured game or provider account.
const game={id:'vendor-game',scheduled:'2026-10-23T23:00:00Z',status:'inprogress',home:{id:'vh'},away:{id:'va'},periods:[{number:1,type:'quarter',events:[{id:'event',sequence:1000,clock:'11:00',updated:'2026-10-23T23:01:02Z',wall_clock:'2026-10-23T23:01:00Z',event_type:'twopointmade',statistics:[{type:'fieldgoal',made:true,points:2,shot_type:'layup',team:{id:'vh'},player:{id:'vp'}},{type:'assist',team:{id:'vh'},player:{id:'assist'}}],possession:{id:'va'},location:{coord_x:100,coord_y:200}}]}]};
it('parses vendor statistics and explicit post-event possession without inferring a ball holder',()=>{
 const result=parseSportradarSnapshot(game,Date.parse('2026-10-23T23:01:03Z'));
 expect(result.events).toHaveLength(3);expect(result.events[0]).toMatchObject({provider:'sportradar',kind:'score',scoreValue:2,playerId:'vp',sequence:1,statDeltas:{pts2:1}});
 expect(result.events[1]).toMatchObject({kind:'stat',statDeltas:{ast:1},sequence:2});expect(result.events[2]).toMatchObject({kind:'possession',teamId:'va',sequence:3});
 expect(result.events[2]).not.toHaveProperty('playerId');expect(result.events[0]).not.toHaveProperty('ball');
});
it('rejects invalid vendor game clocks, identities and unsupported stat types',()=>{
 for(const patch of [{clock:'99:00'},{updated:'bad'},{statistics:[{type:'mystery'}]},{statistics:[{type:'fieldgoal',made:true,points:4,team:{id:'vh'},player:{id:'vp'}}]}]){
  const copy=structuredClone(game);Object.assign(copy.periods[0].events[0],patch);expect(()=>parseSportradarSnapshot(copy,Date.now())).toThrow();
 }
});
it('uses cancellable server-side authenticated reads and surfaces redacted 429 metadata',async()=>{
 let requested='';let auth='';
 const provider=new SportradarBasketballProvider({apiKey:'secret-test',accessLevel:'trial',scheduleDate:'2026/10/23',fetch:async(url,init)=>{requested=String(url);auth=new Headers(init?.headers).get('x-api-key')??'';return new Response('',{status:429,headers:{'retry-after':'4'}});}});
 await expect(provider.snapshot('vendor-game',new AbortController().signal)).rejects.toMatchObject({status:429,retryAfterMs:4000});
 expect(requested).toBe('https://api.sportradar.com/nba/trial/v8/en/games/vendor-game/pbp.json');expect(requested).not.toContain('secret');expect(auth).toBe('secret-test');expect(provider.capabilities.timestampPrecisionMs).toBeNull();
});
it('discovers daily games and polls a full snapshot with a content cursor',async()=>{
 const provider=new SportradarBasketballProvider({apiKey:'synthetic-only',accessLevel:'trial',scheduleDate:'2026/10/23',now:()=>Date.parse('2026-10-23T23:01:03Z'),fetch:async(url)=>new Response(JSON.stringify(String(url).includes('schedule')?{games:[game]}:game),{status:200})});
 expect(await provider.discover(new AbortController().signal)).toMatchObject([{providerGameId:'vendor-game',homeTeamId:'vh',awayTeamId:'va'}]);
 const initial=await provider.snapshot('vendor-game',new AbortController().signal);const next=await provider.poll('vendor-game',initial.cursor,new AbortController().signal);
 expect(next.cursor).toBe(initial.cursor);expect(next.events).toHaveLength(3);
});
it('emits final only for authoritative closed status, with a stable separate identity',()=>{
 const provisional=structuredClone(game);provisional.status='complete';expect(parseSportradarSnapshot(provisional,Date.now()).events).not.toContainEqual(expect.objectContaining({kind:'final'}));
 const closed=structuredClone(game);closed.status='closed';const result=parseSportradarSnapshot(closed,Date.now());expect(result.events.at(-1)).toMatchObject({kind:'final',sequence:4});
});
it('bounds response bytes even when content-length is absent',async()=>{
 const provider=new SportradarBasketballProvider({apiKey:'synthetic',accessLevel:'trial',scheduleDate:'2026/10/23',maxResponseBytes:100,fetch:async()=>new Response(' '.repeat(101))});
 await expect(provider.snapshot('vendor-game',new AbortController().signal)).rejects.toThrow(/response limit/i);
});
it('retains a content-addressed raw vendor reference outside reducer event fields',()=>{
 const result=parseSportradarSnapshot(game,Date.now());expect(result.events[0]).toHaveProperty('rawPayloadRef',expect.stringMatching(/^sha256:[a-f0-9]{64}$/));
});

it('reconciles a corrected synthetic vendor score through the real internal boundary',()=>{
 const mapping={provider:'sportradar',gameId:'vendor-game',catalog:{gameId:'g',teamIds:['h','a'],playerTeams:{p:'h',helper:'h'}},teams:{vh:'h',va:'a'},players:{vp:'p',assist:'helper'}};
 const initial=parseSportradarSnapshot(game,Date.now());const first=reconcileJournal(undefined,initial.events.map(event=>normalizeProviderEvent(event,mapping)),mapping.catalog);
 const corrected=structuredClone(game);corrected.periods[0].events[0].updated='2026-10-23T23:02:00Z';Object.assign(corrected.periods[0].events[0].statistics[0],{points:3,three_point_shot:true});
 const second=reconcileJournal(first.journal,parseSportradarSnapshot(corrected,Date.now()).events.map(event=>normalizeProviderEvent(event,mapping)),mapping.catalog);
 expect(second.state.score.h).toBe(3);expect(second.state.stats.p).toEqual({pts3:1});expect(second.state.stats.helper).toEqual({ast:1});expect(second.journal.entries).toHaveLength(6);expect(second.journal.events).toHaveLength(3);
 expect(second.journal.entries[0].rawPayloadRef).toMatch(/^sha256:/);
});
