import type { PointsState } from './model.js';
import { PointsError } from './model.js';
import { postEntry } from './ledger.js';
export type TargetOutcome={revision:number;optionId:string}|{revision:number;voidReason:string};

/** Terminal postings are keyed by call/revision. Corrections reverse the earlier credit explicitly. */
export function settleTarget(previous:PointsState,targetId:string,outcome:TargetOutcome,now:number):PointsState {
  if(!Number.isSafeInteger(outcome.revision)||outcome.revision<1)throw new PointsError(400,'BAD_OUTCOME','Invalid outcome revision.');
  const key=JSON.stringify('optionId' in outcome?['result',outcome.optionId]:['void',outcome.voidReason]);
  const state=structuredClone(previous);
  for(const call of state.calls.filter(call=>call.targetId===targetId)){
    if(outcome.revision<call.outcomeRevision)continue;
    if(outcome.revision===call.outcomeRevision){if(call.outcomeKey!==key)throw new PointsError(409,'IDEMPOTENCY_CONFLICT','Outcome revision conflict.');continue;}
    if(call.settledReturnUnits>0)postEntry(state,{id:`reverse:${call.callId}:${outcome.revision}`,participantId:call.participantId,callId:call.callId,units:call.settledReturnUnits,direction:'debit',reason:'correction',createdAt:now});
    call.state='voidReason' in outcome?'void':outcome.optionId===call.optionId?'won':'lost';
    call.settledReturnUnits=call.state==='won'?call.totalReturnUnits:call.state==='void'?call.commitUnits:0;
    call.outcomeRevision=outcome.revision;call.outcomeKey=key;
    if(call.settledReturnUnits>0)postEntry(state,{id:`settle:${call.callId}:${outcome.revision}`,participantId:call.participantId,callId:call.callId,units:call.settledReturnUnits,direction:'credit',reason:call.state==='void'?'commit_refund':'commit_return',createdAt:now});
  }
  return state;
}
