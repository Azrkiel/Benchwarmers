import type { ProbabilityEstimate, CommitmentQuote, CommitmentReceipt } from '../../shared/points.js';
import { PointsError, type PointsState, type StoredCall, type StoredQuote } from './model.js';
import { bankFor, pointsToUnits, postEntry, safeInteger } from './ledger.js';

export type QuoteContext={participantId:string;targetId:string;targetVersion:string;optionId:string;optionLabel:string;eligibleParticipantIds:string[];open:boolean;now:number;locksAt:number;probability?:ProbabilityEstimate};
const fail=(code:string,message:string):never=>{throw new PointsError(409,code,message);};
function pricing(state:PointsState,context:QuoteContext){
  if(!context.open||context.now>=context.locksAt)fail('PICKS_LOCKED','That target is not open.');
  if(!context.eligibleParticipantIds.includes(context.participantId))fail('NOT_ELIGIBLE','Wait for the next question.');
  const probability=context.probability;
  if(!probability||!Number.isFinite(probability.p)||probability.p<=0||probability.p>1||typeof probability.source!=='string'||!probability.source.trim()||typeof probability.label!=='string'||!probability.label.trim()||typeof probability.version!=='string'||!probability.version.trim()||!Number.isFinite(probability.observedAt)||!Number.isFinite(probability.validUntil)||probability.observedAt<0||probability.observedAt>context.now||probability.validUntil<=context.now)fail('PROBABILITY_UNAVAILABLE','A fresh declared probability is required for a commitment. Free predictions remain available.');
  const sameAccepted=state.calls.filter(call=>call.targetId===context.targetId&&call.optionId===context.optionId).length;
  const eligibleCount=context.eligibleParticipantIds.length;
  const firstCaller=sameAccepted===0;
  const crowd=Math.max(.70,1-.30*sameAccepted/Math.max(1,eligibleCount-1));
  const multiplierHundredths=Math.floor(Math.min(5,Math.max(1,1/probability!.p)*crowd*(firstCaller?1.1:1))*100);
  const pricingVersion=JSON.stringify([context.targetId,context.targetVersion,context.optionId,probability!.version,probability!.p,probability!.source,probability!.label,sameAccepted,eligibleCount]);
  return {probability:probability!,sameAccepted,eligibleCount,firstCaller,multiplierHundredths,pricingVersion};
}
export function publicQuote(quote:StoredQuote):CommitmentQuote {
  const {quoteId,targetId,questionId,optionId,optionLabel,commitPoints,totalReturnPoints,multiplier,probabilityLabel,firstCaller,expiresAt}=quote;
  return {quoteId,targetId,targetVersion:quote.targetVersion,maximumLossPoints:quote.commitPoints,probabilityVersion:quote.probabilityVersion,probabilitySource:quote.probabilitySource,questionId,optionId,optionLabel,commitPoints,totalReturnPoints,multiplier,probabilityLabel,firstCaller,expiresAt};
}
export function publicCommitment(call:StoredCall):CommitmentReceipt {
  const {callId,requestId,quoteId,questionId,optionId,optionLabel,commitPoints,totalReturnPoints,acceptedAt,acceptedSequence,state}=call;
  return {callId,requestId,quoteId,questionId,optionId,optionLabel,commitPoints,totalReturnPoints,acceptedAt,acceptedSequence,state};
}
export function quoteCommitment(previous:PointsState,context:QuoteContext,commitPoints:number,quoteId:string):{state:PointsState;quote:CommitmentQuote}{
  // Accepted offers are permanent receipt evidence; only expired unaccepted previews retire.
  const accepted=new Set(previous.calls.map(call=>call.quoteId));
  const outstanding=previous.quotes.filter(quote=>quote.expiresAt>context.now&&!accepted.has(quote.quoteId));
  if(outstanding.length>=256||outstanding.filter(quote=>quote.participantId===context.participantId).length>=20)throw new PointsError(429,'QUOTE_LIMIT_REACHED','Too many outstanding previews. Wait for an offer to expire.');
  if(![10,25,50].includes(commitPoints))throw new PointsError(400,'BAD_COMMIT_AMOUNT','Commit 10, 25 or 50 points.');
  if(previous.calls.some(call=>call.targetId===context.targetId&&call.participantId===context.participantId))fail('CALL_ALREADY_COMMITTED','This target already has your immutable commitment.');
  const terms=pricing(previous,context);
  if(bankFor(previous,context.participantId).availablePoints<commitPoints)fail('INSUFFICIENT_POINTS','Not enough available bank points.');
  if(previous.quotes.some(quote=>quote.quoteId===quoteId))fail('IDEMPOTENCY_CONFLICT','Quote ID already exists.');
  const commitUnits=pointsToUnits(commitPoints),totalReturnUnits=safeInteger(BigInt(commitUnits)*BigInt(terms.multiplierHundredths)/100n);
  const quote:StoredQuote={quoteId,participantId:context.participantId,targetId:context.targetId,questionId:context.targetId,optionId:context.optionId,optionLabel:context.optionLabel,commitPoints,totalReturnPoints:totalReturnUnits/2,multiplier:terms.multiplierHundredths/100,probabilityLabel:terms.probability.label,firstCaller:terms.firstCaller,expiresAt:Math.min(context.now+15000,context.locksAt,terms.probability.validUntil),commitUnits,totalReturnUnits,multiplierHundredths:terms.multiplierHundredths,targetVersion:context.targetVersion,probabilityVersion:terms.probability.version,probabilitySource:terms.probability.source,probabilityP:terms.probability.p,pricingVersion:terms.pricingVersion,eligibleCount:terms.eligibleCount,sameAccepted:terms.sameAccepted};
  const state=structuredClone(previous);state.quotes=state.quotes.filter(quote=>accepted.has(quote.quoteId)||quote.expiresAt>context.now);state.pending=state.pending.filter(pending=>pending.expiresAt>context.now);state.quotes.push(quote);
  return {state,quote:publicQuote(quote)};
}
export function acceptCommitment(previous:PointsState,input:{participantId:string;quoteId:string;requestId:string;callId:string;context:QuoteContext}):{state:PointsState;commitment:CommitmentReceipt}{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId))throw new PointsError(400,'BAD_REQUEST','A stable request ID is required.');
  const existing=previous.calls.find(call=>call.participantId===input.participantId&&call.requestId===input.requestId);
  if(existing){if(existing.quoteId!==input.quoteId)fail('IDEMPOTENCY_CONFLICT','That request ID was used for another commitment.');return {state:previous,commitment:publicCommitment(existing)};}
  const quote=previous.quotes.find(quote=>quote.quoteId===input.quoteId&&quote.participantId===input.participantId);
  if(!quote)fail('BAD_QUOTE','That quote does not belong to this participant.');
  if(input.context.participantId!==input.participantId)fail('BAD_QUOTE','Quote actor mismatch.');
  if(input.context.now>=quote!.expiresAt)fail('QUOTE_EXPIRED','This quote expired. Review a fresh quote before confirming.');
  const terms=pricing(previous,input.context);
  if(terms.pricingVersion!==quote!.pricingVersion)fail('QUOTE_CHANGED','The offer changed. Review a fresh quote before confirming.');
  if(previous.calls.some(call=>call.participantId===input.participantId&&call.targetId===quote!.targetId))fail('CALL_ALREADY_COMMITTED','This target already has your immutable commitment.');
  if(bankFor(previous,input.participantId).availablePoints<quote!.commitPoints)fail('INSUFFICIENT_POINTS','Not enough available bank points.');
  if(previous.calls.some(call=>call.callId===input.callId))fail('IDEMPOTENCY_CONFLICT','Call ID already exists.');
  const state=structuredClone(previous);
  const call:StoredCall={callId:input.callId,participantId:input.participantId,requestId:input.requestId,quoteId:quote!.quoteId,targetId:quote!.targetId,questionId:quote!.questionId,optionId:quote!.optionId,optionLabel:quote!.optionLabel,commitPoints:quote!.commitPoints,totalReturnPoints:quote!.totalReturnPoints,acceptedAt:input.context.now,acceptedSequence:(state.calls.at(-1)?.acceptedSequence??0)+1,state:'pending',commitUnits:quote!.commitUnits,totalReturnUnits:quote!.totalReturnUnits,multiplierHundredths:quote!.multiplierHundredths,probabilityVersion:quote!.probabilityVersion,probabilityP:quote!.probabilityP,probabilityLabel:quote!.probabilityLabel,probabilitySource:quote!.probabilitySource,firstCaller:quote!.firstCaller,sameAccepted:quote!.sameAccepted,eligibleCount:quote!.eligibleCount,outcomeRevision:0,settledReturnUnits:0,outcomeKey:''};
  state.calls.push(call);
  postEntry(state,{id:`hold:${call.callId}`,participantId:call.participantId,callId:call.callId,units:call.commitUnits,direction:'debit',reason:'commit_hold',createdAt:input.context.now});
  state.pending=state.pending.filter(pending=>pending.participantId!==input.participantId);
  return {state,commitment:publicCommitment(call)};
}
