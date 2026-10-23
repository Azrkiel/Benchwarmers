import {expect,it} from 'vitest';
import {resolveTeamScoringWindow} from '../../src/live/basketball/timing.js';
const target={teamId:'h',acceptedAt:900,closesAt:1000,startsAt:2000,endsAt:3000,guardMs:500};
const event={kind:'score',teamId:'h',scoreValue:2,occurredAt:2500,receivedAt:2600};
const health={now:4000,watermarkAt:4000,precisionMs:10,reconciled:true,gap:false};
it('resolves only a complete trustworthy real-time interval, independent of game clock',()=>{
 expect(resolveTeamScoringWindow(target,[event],health)).toEqual({status:'resolved',scored:true});
 expect(resolveTeamScoringWindow(target,[],health)).toEqual({status:'resolved',scored:false});
 expect(resolveTeamScoringWindow(target,[],{...health,watermarkAt:2900})).toEqual({status:'pending'});
});
it('voids ambiguous boundary, untrusted clocks, unsafe guard and a result predating acceptance',()=>{
 for(const [events,patch] of [[[event],{precisionMs:null}],[[{...event,occurredAt:2000}],{}],[[{...event,occurredAt:800,receivedAt:2600}],{}],[[event],{gap:true}]] as const){expect(resolveTeamScoringWindow(target,[...events],{...health,...patch}).status).toBe('void');}
 expect(resolveTeamScoringWindow({...target,closesAt:1900},[event],health).status).toBe('void');
});
