import { expect, it } from 'vitest';
import { createPointsState, grantBank, bankFor, validatePointsState } from '../../src/room/points/ledger.js';
import { quoteCommitment, acceptCommitment, type QuoteContext } from '../../src/room/points/quotes.js';

export const context=(patch:Partial<QuoteContext>={}):QuoteContext=>({participantId:'p1',targetId:'q1',targetVersion:'anchor-1',optionId:'harbor',optionLabel:'Harbor Hawks',eligibleParticipantIds:['p1','p2'],open:true,now:1000,locksAt:9000,probability:{p:0.5,version:'demo-1',label:'Authored demo probability',source:'demo_projection',observedAt:0,validUntil:10000},...patch});
const initial=()=>grantBank(grantBank(createPointsState(),'p1',0),'p2',0);

it('quotes without changing balances, freezes terms and accepts one immutable hold/receipt',()=>{
  const before=initial();
  const {state,quote}=quoteCommitment(before,context(),25,'quote-1');
  expect(bankFor(state,'p1')).toEqual(bankFor(before,'p1'));
  expect(quote).toMatchObject({quoteId:'quote-1',targetVersion:'anchor-1',commitPoints:25,maximumLossPoints:25,multiplier:2.2,totalReturnPoints:55,firstCaller:true,probabilityVersion:'demo-1',probabilitySource:'demo_projection'});
  const args={participantId:'p1',quoteId:'quote-1',requestId:'request-1',callId:'call-1',context:context()};
  const accepted=acceptCommitment(state,args);
  expect(bankFor(accepted.state,'p1')).toMatchObject({availablePoints:75,reservedPoints:25,settledRiskNet:0});
  expect(accepted.commitment).toMatchObject({callId:'call-1',requestId:'request-1',commitPoints:25,totalReturnPoints:55,state:'pending',acceptedSequence:1});
  expect(acceptCommitment(accepted.state,{...args,context:context({now:100000,open:false})}).commitment).toEqual(accepted.commitment);
  expect(()=>acceptCommitment(accepted.state,{...args,quoteId:'other'})).toThrow(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
  expect(accepted.state.calls[0].totalReturnUnits).toBe(110);
});

it('rejects absent/stale probabilities, ineligible participants, invalid stakes and cutoff equality',()=>{
  const state=initial();
  for(const probability of [undefined,{...context().probability!,p:0},{...context().probability!,p:NaN},{...context().probability!,validUntil:1000}])expect(()=>quoteCommitment(state,context({probability}),25,'q')).toThrow(expect.objectContaining({code:'PROBABILITY_UNAVAILABLE'}));
  expect(()=>quoteCommitment(state,context({eligibleParticipantIds:['p2']}),25,'q')).toThrow(expect.objectContaining({code:'NOT_ELIGIBLE'}));
  expect(()=>quoteCommitment(state,context({now:9000}),25,'q')).toThrow(expect.objectContaining({code:'PICKS_LOCKED'}));
  for(const amount of [0,15,25.5,NaN])expect(()=>quoteCommitment(state,context(),amount,'q')).toThrow();
  const missingSource={...context().probability!,source:undefined} as unknown as NonNullable<QuoteContext['probability']>;
  expect(()=>quoteCommitment(state,context({probability:missingSource}),25,'q')).toThrow(expect.objectContaining({code:'PROBABILITY_UNAVAILABLE'}));
});

it('rechecks ownership, expiry, pricing and one commitment per target before acceptance',()=>{
  const quoted=quoteCommitment(initial(),context(),25,'q1');
  const args={participantId:'p1',quoteId:'q1',requestId:'r1',callId:'c1',context:context()};
  expect(()=>acceptCommitment(quoted.state,{...args,participantId:'p2',context:context({participantId:'p2'})})).toThrow(expect.objectContaining({code:'BAD_QUOTE'}));
  expect(()=>acceptCommitment(quoted.state,{...args,context:context({now:quoted.quote.expiresAt})})).toThrow(expect.objectContaining({code:'QUOTE_EXPIRED'}));
  const stale=quoteCommitment(quoted.state,context({participantId:'p2'}),25,'q2');
  const first=acceptCommitment(stale.state,args);
  expect(()=>acceptCommitment(first.state,{participantId:'p2',quoteId:'q2',requestId:'r2',callId:'c2',context:context({participantId:'p2'})})).toThrow(expect.objectContaining({code:'QUOTE_CHANGED'}));
  expect(()=>quoteCommitment(first.state,context(),10,'another')).toThrow(expect.objectContaining({code:'CALL_ALREADY_COMMITTED'}));
  expect(first.state.calls[0].multiplierHundredths).toBe(220);
});

it('invalidates a quote when probability provenance changes and stores the accepted provenance',()=>{
  const quoted=quoteCommitment(initial(),context(),25,'provenance-q');
  expect(quoted.state.quotes[0]).toHaveProperty('probabilitySource','demo_projection');
  const changed=context({probability:{...context().probability!,source:'different-source'}});
  expect(()=>acceptCommitment(quoted.state,{participantId:'p1',quoteId:'provenance-q',requestId:'r1',callId:'c1',context:changed})).toThrow(expect.objectContaining({code:'QUOTE_CHANGED'}));
});

it('supports the declared crowd discount even when a valid return multiplier is below one',()=>{
  const ctx=context({probability:{...context().probability!,p:1}});
  const first=quoteCommitment(initial(),ctx,25,'certain-q1');
  const accepted=acceptCommitment(first.state,{participantId:'p1',quoteId:'certain-q1',requestId:'r1',callId:'c1',context:ctx});
  const follower=quoteCommitment(accepted.state,{...ctx,participantId:'p2'},25,'certain-q2');
  expect(follower.quote.multiplier).toBe(.7);
  expect(validatePointsState(follower.state)).toEqual(follower.state);
});
