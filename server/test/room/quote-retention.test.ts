import {expect,it} from 'vitest';
import {createPointsState,grantBank} from '../../src/room/points/ledger.js';
import {quoteCommitment,type QuoteContext} from '../../src/room/points/quotes.js';
it('bounds outstanding private previews and retires expired unaccepted offers on the next quote',()=>{
 let state=grantBank(createPointsState(),'fan',0);
 const context:QuoteContext={participantId:'fan',targetId:'q',targetVersion:'v',optionId:'home',optionLabel:'Home',eligibleParticipantIds:['fan'],open:true,now:1000,locksAt:60000,probability:{p:.5,version:'fixture',label:'Synthetic',source:'fixture',observedAt:0,validUntil:60000}};
 for(let i=0;i<20;i++)state=quoteCommitment(state,context,10,`quote-${i}`).state;
 expect(()=>quoteCommitment(state,context,10,'overflow')).toThrow(expect.objectContaining({code:'QUOTE_LIMIT_REACHED'}));
 const renewed=quoteCommitment(state,{...context,now:16000},10,'fresh');expect(renewed.state.quotes).toHaveLength(1);
 expect(state.quotes).toHaveLength(20);
});
