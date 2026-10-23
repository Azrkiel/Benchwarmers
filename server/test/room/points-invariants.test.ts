import { expect, it } from 'vitest';
import { createPointsState, grantBank, bankFor, rewardFreePick, validatePointsState, pointsToUnits } from '../../src/room/points/ledger.js';
import { quoteCommitment, acceptCommitment } from '../../src/room/points/quotes.js';
import { settleTarget } from '../../src/room/points/settle.js';

it('preserves integer accounting through 200 deterministic reward, hold, settle, retry and correction sequences',()=>{
  let state=grantBank(createPointsState(),'p',0);let seed=20261023;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<200;i++){
    state=rewardFreePick(state,'p',`free-${i}`,random()%40/2,i+1);
    const commitPoints=([10,25,50] as const)[random()%3];
    const context={participantId:'p',targetId:`target-${i}`,targetVersion:'v1',optionId:'home',optionLabel:'Home',eligibleParticipantIds:['p'],open:true,now:i+1,locksAt:10000,probability:{p:(random()%9+1)/10,version:'demo-v1',label:'Authored demo',source:'demo_projection',observedAt:0,validUntil:10000}};
    if(bankFor(state,'p').availablePoints<commitPoints){expect(()=>quoteCommitment(state,context,commitPoints,`quote-${i}`)).toThrow(expect.objectContaining({code:'INSUFFICIENT_POINTS'}));continue;}
    const quote=quoteCommitment(state,context,commitPoints,`quote-${i}`);
    const input={participantId:'p',quoteId:quote.quote.quoteId,requestId:`request-${i}`,callId:`call-${i}`,context};
    state=acceptCommitment(quote.state,input).state;
    expect(acceptCommitment(state,input).state).toEqual(state);
    const result=random()%3;const outcome=result===0?{revision:1,voidReason:'No event'}:{revision:1,optionId:result===1?'home':'away'};
    state=settleTarget(state,context.targetId,outcome,i+1);
    expect(settleTarget(state,context.targetId,outcome,i+2)).toEqual(state);
    if(i%7===0)state=settleTarget(state,context.targetId,{revision:2,optionId:'away'},i+3);
    expect(validatePointsState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const bank=bankFor(state,'p');
    expect(bank.availablePoints).toBeGreaterThanOrEqual(0);expect(bank.correctionDebt).toBeGreaterThanOrEqual(0);
    const signed=state.entries.reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n);
    expect(BigInt(pointsToUnits(bank.availablePoints))-BigInt(pointsToUnits(bank.correctionDebt))).toBe(signed);
    expect(bank.reservedPoints).toBe(0);
  }
});
