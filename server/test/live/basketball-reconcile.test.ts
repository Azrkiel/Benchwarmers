import {expect,it} from 'vitest';
import {reconcileJournal} from '../../src/live/basketball/reconcile.js';
const catalog={gameId:'g',teamIds:['h','a'],playerTeams:{p:'h'}};
const score=(revision=1,value:2|3=2,sequence=1)=>({provider:'fixture',providerEventId:'e',revision,event:{id:'fixture:e',revision,sequence,gameId:'g',gameElapsedMs:1000,occurredAt:1000,receivedAt:1100,kind:'score' as const,teamId:'h',playerId:'p',scoreValue:value,statDeltas:value===2?{pts2:1}:{pts3:1}}});
it('replaces corrections and keeps revision history without counting a score twice',()=>{
 const first=reconcileJournal(undefined,[score()],catalog);
 const next=reconcileJournal(first.journal,[score(2,3),score(2,3),score()],catalog);
 expect(next.state.score.h).toBe(3);expect(next.state.stats.p).toEqual({pts3:1});expect(next.journal.entries).toHaveLength(2);
});
it('quarantines conflicting same-revision payloads and duplicate sequence identities',()=>{
 const first=reconcileJournal(undefined,[score()],catalog);
 expect(()=>reconcileJournal(first.journal,[score(1,3)],catalog)).toThrow(/conflict/i);
 expect(()=>reconcileJournal(first.journal,[{...score(),providerEventId:'other',event:{...score().event,id:'other'}}],catalog)).toThrow(/sequence/i);
 expect(first.state.score.h).toBe(2);
});
it('reorders a batch before projection and rejects chronology gaps',()=>{
 const later={...score(),providerEventId:'later',event:{...score().event,id:'later',sequence:2,gameElapsedMs:2000}};
 expect(reconcileJournal(undefined,[later,score()],catalog).state.score.h).toBe(4);
 expect(()=>reconcileJournal(undefined,[later],catalog)).toThrow(/gap/i);
});
it('exports authoritative events and stable outcome version across duplicate receipt times',()=>{
 const first=reconcileJournal(undefined,[score()],catalog);
 const retry=reconcileJournal(first.journal,[{...score(),event:{...score().event,receivedAt:9999}}],catalog);
 const corrected=reconcileJournal(first.journal,[score(2,3)],catalog);
 expect(first.journal.events).toHaveLength(1);expect(retry.journal.resultVersion).toBe(first.journal.resultVersion);expect(corrected.journal.resultVersion).not.toBe(first.journal.resultVersion);
});
it('rejects different provider identities aliased to the same internal event ID',()=>{
 const other={...score(),providerEventId:'other',event:{...score().event,sequence:2,gameElapsedMs:2000}};
 expect(()=>reconcileJournal(undefined,[score(),other],catalog)).toThrow(/identity/i);
});
