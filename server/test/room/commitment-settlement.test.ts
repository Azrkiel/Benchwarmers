import { expect, it } from 'vitest';
import { createPointsState, grantBank, bankFor, validatePointsState } from '../../src/room/points/ledger.js';
import { quoteCommitment, acceptCommitment, type QuoteContext } from '../../src/room/points/quotes.js';
import { settleTarget } from '../../src/room/points/settle.js';

const context=(targetId='q1'):QuoteContext=>({participantId:'p',targetId,targetVersion:'v1',optionId:'home',optionLabel:'Home',eligibleParticipantIds:['p'],open:true,now:1000,locksAt:9000,probability:{p:0.366,version:'authored-v1',label:'Authored demo',source:'demo_projection',observedAt:0,validUntil:10000}});
function held(){const quoted=quoteCommitment(grantBank(createPointsState(),'p',0),context(),25,'q1');return acceptCommitment(quoted.state,{participantId:'p',quoteId:'q1',requestId:'r1',callId:'c1',context:context()}).state;}
it.each([['home',150,50],['away',75,-25],['void',100,0]] as const)('settles %s without double posting or a second loss debit',(outcome,available,net)=>{
  const state=held();expect(state.calls[0].totalReturnUnits).toBe(150);
  const result=settleTarget(state,'q1',outcome==='void'?{revision:1,voidReason:'No event'}:{revision:1,optionId:outcome},2000);
  expect(bankFor(result,'p')).toMatchObject({availablePoints:available,reservedPoints:0,settledRiskNet:net});
  expect(settleTarget(result,'q1',outcome==='void'?{revision:1,voidReason:'No event'}:{revision:1,optionId:outcome},3000)).toEqual(result);
  expect(validatePointsState(JSON.parse(JSON.stringify(result)))).toEqual(result);
});
it('records correction debt when a previously won return has already been spent',()=>{
  const won=settleTarget(held(),'q1',{revision:1,optionId:'home'},2000);
  const q2=quoteCommitment(won,context('target-2'),50,'quote-2');
  const h2=acceptCommitment(q2.state,{participantId:'p',quoteId:'quote-2',requestId:'r2',callId:'c2',context:context('target-2')}).state;
  const q3=quoteCommitment(h2,context('target-3'),50,'quote-3');
  const h3=acceptCommitment(q3.state,{participantId:'p',quoteId:'quote-3',requestId:'r3',callId:'c3',context:context('target-3')}).state;
  const corrected=settleTarget(h3,'q1',{revision:2,optionId:'away'},3000);
  expect(bankFor(corrected,'p')).toMatchObject({availablePoints:0,correctionDebt:25,reservedPoints:100,settledRiskNet:-25});
  expect(corrected.calls.filter(call=>call.state==='pending')).toHaveLength(2);
  expect(corrected.entries.at(-1)).toMatchObject({reason:'correction',direction:'debit',units:150});
  expect(()=>quoteCommitment(corrected,context('target-4'),10,'quote-4')).toThrow(expect.objectContaining({code:'INSUFFICIENT_POINTS'}));
  expect(validatePointsState(corrected)).toEqual(corrected);
});
it('rejects inconsistent frozen terms and call/quote references on restore',()=>{
  const state=held();
  const changed=structuredClone(state);changed.calls[0].probabilitySource='changed-source';
  expect(()=>validatePointsState(changed)).toThrow();
  const orphan=structuredClone(state);orphan.calls[0].quoteId='unknown';
  expect(()=>validatePointsState(orphan)).toThrow();
  const won=settleTarget(state,'q1',{revision:1,optionId:'home'},2000);
  const wrongOutcome=structuredClone(won);wrongOutcome.calls[0].outcomeKey=JSON.stringify(['result','away']);
  expect(()=>validatePointsState(wrongOutcome)).toThrow();
});
