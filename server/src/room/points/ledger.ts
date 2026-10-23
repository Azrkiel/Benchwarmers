import { pointsStateSchema, PointsError, type PointsState, type PointsEntry } from './model.js';
import type { CallBank } from '../../shared/points.js';

export function safeInteger(value:bigint):number {
  if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(-Number.MAX_SAFE_INTEGER))throw new PointsError(400,'INVALID_POINTS','Points exceed the supported integer range.');
  return Number(value);
}
export function pointsToUnits(points:number):number {
  if(!Number.isFinite(points)||points<0||!Number.isSafeInteger(points*2))throw new PointsError(400,'INVALID_POINTS','Use nonnegative points in half-point increments.');
  return points*2;
}
export function createPointsState():PointsState {return {version:1,entries:[],quotes:[],calls:[],pending:[]};}

/** Internal posting primitive; callers operate on a staged copy. Negative adjustments use direction. */
export function postEntry(state:PointsState,entry:PointsEntry):void {
  if(!Number.isSafeInteger(entry.units)||entry.units<0)throw new PointsError(400,'INVALID_POINTS','Invalid ledger units.');
  const previous=state.entries.find(old=>old.id===entry.id);
  if(previous){if(previous.participantId!==entry.participantId||previous.units!==entry.units||previous.direction!==entry.direction||previous.reason!==entry.reason||previous.callId!==entry.callId||previous.questionId!==entry.questionId||previous.resultVersion!==entry.resultVersion)throw new PointsError(409,'IDEMPOTENCY_CONFLICT','Ledger posting conflict.');return;}
  const previousBalance=state.entries.filter(old=>old.participantId===entry.participantId).reduce((sum,old)=>sum+BigInt(old.units)*(old.direction==='credit'?1n:-1n),0n);
  safeInteger(previousBalance+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n));
  state.entries.push(entry);
}
export function grantBank(previous:PointsState,participantId:string,now:number):PointsState {
  const state=structuredClone(previous);
  postEntry(state,{id:`grant:${participantId}`,participantId,units:200,direction:'credit',reason:'grant',createdAt:now});
  return state;
}
export function rewardFreePick(previous:PointsState,participantId:string,questionId:string,points:number,now:number):PointsState {
  const state=structuredClone(previous);
  postEntry(state,{id:`reward:${JSON.stringify([participantId,questionId])}`,participantId,units:pointsToUnits(points),direction:'credit',reason:'free_pick_reward',createdAt:now});
  return state;
}
/** Preserve original rewards; append only the signed change to each target's earned total. */
export function correctFreePick(previous:PointsState,participantId:string,questionId:string,points:number,resultVersion:string,now:number):PointsState {
  const state=structuredClone(previous),wanted=pointsToUnits(points),originalId=`reward:${JSON.stringify([participantId,questionId])}`;
  const posted=state.entries.filter(entry=>entry.participantId===participantId&&(entry.id===originalId||(entry.reason==='free_pick_correction'&&entry.questionId===questionId))).reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n);
  const delta=safeInteger(BigInt(wanted)-posted);
  if(delta!==0)postEntry(state,{id:`free-correction:${JSON.stringify([participantId,questionId,resultVersion])}`,participantId,questionId,resultVersion,units:Math.abs(delta),direction:delta>0?'credit':'debit',reason:'free_pick_correction',createdAt:now});
  return state;
}
export function freeRewardUnits(state:PointsState,participantId:string,questionId?:string):number {
  const originalId=questionId===undefined?undefined:`reward:${JSON.stringify([participantId,questionId])}`;
  return safeInteger(state.entries.filter(entry=>entry.participantId===participantId&&((entry.reason==='free_pick_reward'&&(originalId===undefined||entry.id===originalId))||(entry.reason==='free_pick_correction'&&(questionId===undefined||entry.questionId===questionId)))).reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n));
}
export function bankFor(state:PointsState,participantId:string):CallBank {
  const entries=state.entries.filter(entry=>entry.participantId===participantId);
  const balance=safeInteger(entries.reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n));
  const grant=safeInteger(entries.filter(entry=>entry.reason==='grant').reduce((sum,entry)=>sum+BigInt(entry.units),0n));
  const calls=state.calls.filter(call=>call.participantId===participantId);
  const reserved=safeInteger(calls.filter(call=>call.state==='pending').reduce((sum,call)=>sum+BigInt(call.commitUnits),0n));
  const risk=safeInteger(calls.filter(call=>call.state!=='pending'&&call.state!=='void').reduce((sum,call)=>sum+BigInt(call.settledReturnUnits)-BigInt(call.commitUnits),0n));
  return {grantPoints:grant/2,availablePoints:Math.max(0,balance)/2,reservedPoints:reserved/2,settledRiskNet:risk/2,correctionDebt:Math.max(0,-balance)/2};
}

/** Strict shape, identity, arithmetic and ledger/accounting checks before durable writes. */
export function validatePointsState(input:unknown):PointsState {
  const state=pointsStateSchema.parse(input);
  const invalid=(detail:string):never=>{throw new Error(`Invalid points state: ${detail}`);};
  const unique=(ids:string[],label:string)=>{if(new Set(ids).size!==ids.length)invalid(`duplicate ${label}`);};
  unique(state.entries.map(entry=>entry.id),'entry');unique(state.quotes.map(quote=>quote.quoteId),'quote');unique(state.calls.map(call=>call.callId),'call');
  unique(state.calls.map(call=>JSON.stringify([call.participantId,call.requestId])),'request');
  unique(state.calls.map(call=>JSON.stringify([call.participantId,call.targetId])),'participant target');
  unique(state.pending.map(pending=>pending.participantId),'pending actor');
  let sequence=0;
  for(const call of state.calls){
    if(call.acceptedSequence<=sequence)invalid('acceptance order');sequence=call.acceptedSequence;
    const quote=state.quotes.find(quote=>quote.quoteId===call.quoteId&&quote.participantId===call.participantId);
    if(!quote||quote.targetId!==call.targetId||quote.questionId!==call.questionId||quote.optionId!==call.optionId||quote.commitUnits!==call.commitUnits||quote.totalReturnUnits!==call.totalReturnUnits||quote.multiplierHundredths!==call.multiplierHundredths||quote.probabilityVersion!==call.probabilityVersion||quote.probabilityP!==call.probabilityP||quote.probabilityLabel!==call.probabilityLabel||quote.probabilitySource!==call.probabilitySource||quote.firstCaller!==call.firstCaller||quote.sameAccepted!==call.sameAccepted||quote.eligibleCount!==call.eligibleCount)invalid('frozen quote reference');
    if(call.commitUnits!==pointsToUnits(call.commitPoints)||call.totalReturnUnits!==pointsToUnits(call.totalReturnPoints)||call.totalReturnUnits!==safeInteger(BigInt(call.commitUnits)*BigInt(call.multiplierHundredths)/100n))invalid('frozen arithmetic');
    if((call.state==='pending')!==(call.outcomeRevision===0))invalid('outcome revision');
    if(call.state==='pending'){if(call.outcomeKey!=='')invalid('pending outcome');}
    else {
      let outcome:unknown;try{outcome=JSON.parse(call.outcomeKey);}catch{invalid('outcome identity');}
      if(!Array.isArray(outcome))return invalid('outcome identity');
      if(outcome.length!==2||typeof outcome[1]!=='string'||!outcome[1])invalid('outcome identity');
      const expected=outcome[0]==='void'?'void':outcome[0]==='result'?(outcome[1]===call.optionId?'won':'lost'):undefined;
      if(!expected||expected!==call.state)invalid('outcome state');
    }
    const credit=call.state==='won'?call.totalReturnUnits:call.state==='void'?call.commitUnits:0;
    if(call.settledReturnUnits!==credit)invalid('settled return');
    const hold=state.entries.filter(entry=>entry.callId===call.callId&&entry.reason==='commit_hold');
    if(hold.length!==1||hold[0].participantId!==call.participantId||hold[0].units!==call.commitUnits||hold[0].direction!=='debit')invalid('call hold');
    const posted=state.entries.filter(entry=>entry.callId===call.callId).reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n);
    if(posted!==BigInt(call.settledReturnUnits)-BigInt(call.commitUnits))invalid('call balance');
  }
  for(const entry of state.entries){
    if(entry.reason==='grant'&&(entry.units!==200||entry.direction!=='credit'||entry.callId))invalid('grant');
    if(entry.reason==='free_pick_reward'&&(entry.direction!=='credit'||entry.callId))invalid('free reward');
    if(entry.reason==='free_pick_correction'&&(entry.callId||!entry.questionId||!entry.resultVersion||!/^[a-f0-9]{64}$/.test(entry.resultVersion)))invalid('free correction reference');
    if(entry.reason!=='free_pick_correction'&&(entry.questionId!==undefined||entry.resultVersion!==undefined))invalid('unexpected free correction metadata');
    if(['commit_return','commit_refund'].includes(entry.reason)&&entry.direction!=='credit')invalid('return direction');
    if(['commit_hold','commit_return','commit_refund','correction'].includes(entry.reason)&&(!entry.callId||!state.calls.some(call=>call.callId===entry.callId&&call.participantId===entry.participantId)))invalid('entry call reference');
  }
  const actors=new Set([...state.entries.map(entry=>entry.participantId),...state.calls.map(call=>call.participantId)]);
  for(const actor of actors){
    const entries=state.entries.filter(entry=>entry.participantId===actor),bank=bankFor(state,actor);
    if(entries.filter(entry=>entry.reason==='grant').length!==1)invalid('initial grant');
    const rewards=freeRewardUnits(state,actor)/2;if(rewards<0)invalid('negative earned rewards');
    const signed=entries.reduce((sum,entry)=>sum+BigInt(entry.units)*(entry.direction==='credit'?1n:-1n),0n);
    const expected=200n+BigInt(pointsToUnits(rewards))+BigInt(Math.round(bank.settledRiskNet*2))-BigInt(pointsToUnits(bank.reservedPoints));
    if(signed!==expected)invalid('balance equation');
  }
  for(const quote of state.quotes){if(quote.commitUnits!==pointsToUnits(quote.commitPoints)||quote.totalReturnUnits!==pointsToUnits(quote.totalReturnPoints)||quote.multiplierHundredths!==Math.round(quote.multiplier*100))invalid('quote arithmetic');}
  for(const pending of state.pending){if(!state.quotes.some(quote=>quote.quoteId===pending.quoteId&&quote.participantId===pending.participantId&&pending.expiresAt===quote.expiresAt))invalid('pending quote');}
  return state;
}
