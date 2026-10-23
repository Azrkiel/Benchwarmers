import {createHash} from 'node:crypto';
import type {Room,Season,QuestionState} from '../domain.js';
import type {RoomSportAdapter} from '../sports/adapter.js';
import type {RoomQuestion,RoomSeasonStanding,QuestionResolution} from '../types.js';
import {basketballEventSchema,type BasketballEvent,type BasketballCatalog} from '../basketball/events.js';
import {initialBasketballState,reduceBasketballEvent} from '../basketball/reducer.js';
import {resolveBasketballTarget} from '../predictions/resolve.js';
import {scorePrediction} from '../scoring.js';
import {bankFor,correctFreePick,freeRewardUnits,pointsToUnits,validatePointsState} from '../points/ledger.js';
import {settleTarget} from '../points/settle.js';
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
function fail(message:string):never {throw Error(`Outcome correction: ${message}`);}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export const correctionPayloadHash=(events:readonly BasketballEvent[])=>createHash('sha256').update(JSON.stringify(canonical(events))).digest('hex');

export function initializeCorrections(room:Room):void {
 if(room.phase!=='lobby'||room.beatIndex!==-1||room.recorded||room.question||room.lastQuestion||room.participants.some(p=>p.predictionPoints!==0))fail('only a new lobby can enable complete history');
 if(room.correctionState)fail('history already initialized');
 room.correctionState={version:1,revision:1,questions:[],applied:[]};
}
/** Call after every prompted target resolves or voids, including targets with no picks. */
export function recordResolvedQuestion(room:Room,question:QuestionState):void {
 const state=room.correctionState;if(!state)return;
 if(!question.view.target||!['resolved','void'].includes(question.view.status))fail('history requires a terminal basketball target');
 const old=state.questions.find(q=>q.question.view.id===question.view.id);
 if(old){if(JSON.stringify(canonical(old.question))!==JSON.stringify(canonical(question)))fail('question history conflict');return;}
 state.questions.push({question:structuredClone(question),revision:1,correctionKey:'original'});
}
function contribution(room:Room,adapter:RoomSportAdapter):RoomSeasonStanding[]{
 const rows=room.participants.map(p=>{
  const ids=p.lineup?[p.lineup.captainId,...p.lineup.flexIds]:[];
  const fantasyPoints=round(ids.reduce((sum,id,index)=>{
   const player=adapter.playerById[id];if(!player)fail('unknown lineup player');
   const delta=Object.fromEntries(Object.entries(room.stats[id]??{}).map(([key,n])=>[key,n-(p.baseline[id]?.[key]??0)]));
   return sum+round(adapter.rawPoints(delta,player.role)*(room.rules.positionMultipliers[player.pos]??1)*(index===0?room.rules.captainMultiplier:1));
  },0));
  const risk=room.points?bankFor(room.points,p.id).settledRiskNet:0;
  return {participantId:p.id,name:p.name,points:round(fantasyPoints+p.predictionPoints+risk),fantasyPoints,predictionPoints:p.predictionPoints,nightsPlayed:1,nightsWon:0};
 });
 const top=rows.length?Math.max(...rows.map(row=>row.points)):undefined;
 for(const row of rows)row.nightsWon=row.points===top?1:0;
 return rows;
}
/** Capture exactly what recordSeason is about to add. No season mutation here. */
export function captureSeasonContribution(room:Room,adapter:RoomSportAdapter):void {
 const state=room.correctionState;if(!state)return;
 if(room.phase!=='final'||room.recorded||state.seasonContribution)fail('capture initial contribution before recording the final night');
 state.seasonContribution={resultVersion:'original',rows:contribution(room,adapter)};
}
function catalogFor(room:Room,adapter:RoomSportAdapter):BasketballCatalog {
 const game=adapter.projectGame(-1,'lobby');
 return {gameId:room.gameId,teamIds:[game.home.id,game.away.id],playerTeams:Object.fromEntries(adapter.players.map(player=>[player.id,player.team]))};
}
function replay(room:Room,adapter:RoomSportAdapter,input:readonly BasketballEvent[]){
 if(input.length===0||input.length>100_000)fail('complete bounded final event log required');
 const events=input.map(event=>basketballEventSchema.parse(event));
 if(new Set(events.map(event=>event.id)).size!==events.length)fail('duplicate authoritative event');
 const catalog=catalogFor(room,adapter);let state=initialBasketballState(catalog);
 const baselines=new Map<number,Room['stats']>();
 for(const participant of room.participants){
  const sequence=participant.joinedSequence;
  if(sequence===undefined||!Number.isSafeInteger(sequence)||sequence<0)fail('missing participant join sequence');
  baselines.set(sequence,{});
 }
 for(const event of events){
  state=reduceBasketballEvent(state,event,catalog).state;
  for(const sequence of baselines.keys())if(event.sequence<=sequence)baselines.set(sequence,structuredClone(state.stats));
 }
 if(!state.final||events.at(-1)?.kind!=='final')fail('complete final event log required');
 if(room.participants.some(p=>p.joinedSequence!>state.appliedSequence))fail('join boundary exceeds final event sequence');
 return {events,state,baselines};
}
function resolution(question:RoomQuestion,events:readonly BasketballEvent[]):QuestionResolution {
 if(!question.target)fail('missing target history');
 for(const event of events){const result=resolveBasketballTarget(question.target!,event);if(result)return 'optionId' in result?{...result,explanation:'Corrected authoritative event log.'}:result;}
 return fail('target has no terminal result in the complete final log');
}
function setResolution(view:RoomQuestion,result:QuestionResolution):void {
 delete view.result;delete view.voidReason;view.remainingMs=0;
 if('optionId' in result){if(!view.options.some(option=>option.id===result.optionId))fail('corrected outcome outside accepted options');view.status='resolved';view.result=result;}
 else {view.status='void';view.voidReason=result.voidReason;}
}
function requireCompleteHistory(room:Room,adapter:RoomSportAdapter):void {
 const history=room.correctionState!.questions,ids=new Set(history.map(item=>item.question.view.id));
 const expected=adapter.beats.filter(beat=>adapter.isWindow(beat)).map(beat=>adapter.question(beat,0,adapter.duration(beat,room.speed))?.id).filter((id):id is string=>!!id);
 if(ids.size!==history.length||expected.some(id=>!ids.has(id))||[room.question,room.lastQuestion].some(q=>q&&!ids.has(q.view.id))||(room.pickReceipts??[]).some(receipt=>receipt.questionId!==room.pregame?.id&&!ids.has(receipt.questionId)))fail('incomplete prompted question history');
 const recorded=history.map(item=>item.question.view.id).filter(id=>expected.includes(id));
 if(JSON.stringify(recorded)!==JSON.stringify(expected))fail('prompted question history order mismatch');
}
function scoreAcceptedPick(q:QuestionState,participantId:string,result:string,streak:number,factorCap:number){
 const pick=q.picks[participantId],option=q.view.options.find(option=>option.id===pick.optionId);if(!option)fail('history pick option missing');
 const picks=Object.values(q.picks);
 return scorePrediction({optionId:pick.optionId,result,base:option.basePoints,probability:option.probability,optionCount:q.view.options.length,streak,elapsedFraction:pick.elapsedFraction,same:picks.filter(value=>value.optionId===pick.optionId).length,pickers:picks.length,factorCap});
}
function requireRecordedPredictions(room:Room):void {
 const expected=new Map(room.participants.map(p=>[p.id,{points:0,streak:0}]));
 for(const item of room.correctionState!.questions){
  const q=item.question;if(q.view.status==='void')continue;
  for(const participantId of q.view.target!.eligibleParticipantIds){
   const actor=expected.get(participantId);if(!actor)fail('unknown eligible participant in history');
   if(!q.picks[participantId]){actor.streak=0;continue;}
   const score=scoreAcceptedPick(q,participantId,q.view.result!.optionId,actor.streak,room.rules.pickFactorCap);
   actor.points+=score.points;actor.streak=score.correct?actor.streak+1:0;
  }
 }
 if(room.pregame?.status==='resolved')for(const [id,pick] of Object.entries(room.pregame.picks))if(pick.optionId===room.pregame.result!.optionId){const actor=expected.get(id);if(!actor)fail('unknown pregame participant');actor.points+=room.pregame.correctPoints;}
 for(const p of room.participants){const actor=expected.get(p.id)!;if(p.predictionPoints!==actor.points||p.streak!==actor.streak)fail('incomplete or inconsistent prediction history');}
}
/** Pure recomputation. All caller-visible mutations occur only on cloned transaction state. */
export function reconcileFinal(previous:Room,previousSeason:Season,input:readonly BasketballEvent[],resultVersion:string,adapter:RoomSportAdapter,now=Date.now()){
 if(previous.phase!=='final'||!previous.recorded||adapter.sport!=='basketball'||adapter.gameId!==previous.gameId)fail('only recorded final basketball rooms can reconcile');
 if(!/^[a-f0-9]{64}$/.test(resultVersion)||!Number.isFinite(now)||now<0)fail('invalid result version/time');
 const old=previous.correctionState;if(!old?.seasonContribution)fail('complete history and season contribution required');
 validateCorrectionState(previous,adapter);
 const {events,state,baselines}=replay(previous,adapter,input),payloadHash=correctionPayloadHash(events);
 const applied=old.applied.find(item=>item.resultVersion===resultVersion);
 if(applied){if(applied.payloadHash!==payloadHash)fail('result version payload conflict');return {room:structuredClone(previous),season:structuredClone(previousSeason),changed:false,projection:{score:structuredClone(old.score??state.score),resultVersion}};}
 if(old.applied.length>=1000)fail('correction version history limit reached');
 const ids=new Set(old.questions.map(item=>item.question.view.id));
 requireCompleteHistory(previous,adapter);
 requireRecordedPredictions(previous);
 if(previousSeason.id!==previous.seasonId)fail('season identity mismatch');
 const room=structuredClone(previous),season=structuredClone(previousSeason),corrections=room.correctionState!;
 const revision=Math.max(corrections.revision,...(room.points?.calls.map(call=>call.outcomeRevision)??[]))+1;
 room.stats=state.stats;
 for(const p of room.participants){p.baseline=structuredClone(baselines.get(p.joinedSequence!)!);p.predictionPoints=0;p.streak=0;delete p.lastPickScore;}
 for(const item of corrections.questions){
  const q=item.question,result=resolution(q.view,events);setResolution(q.view,result);item.revision=revision;item.correctionKey=resultVersion;
  for(const p of room.participants){
   let points=0;
   if(q.view.target!.eligibleParticipantIds.includes(p.id)&&'optionId' in result){
    const pick=q.picks[p.id];
    if(!pick)p.streak=0;
    else {
     const score=scoreAcceptedPick(q,p.id,result.optionId,p.streak,room.rules.pickFactorCap);
     points=score.points;p.predictionPoints+=points;p.streak=score.correct?p.streak+1:0;p.lastPickScore=score;
    }
   }
   if(room.points)room.points=correctFreePick(room.points,p.id,q.view.id,points,resultVersion,now);
  }
  if(room.points)room.points=settleTarget(room.points,q.view.id,{revision,...('optionId' in result?{optionId:result.optionId}:{voidReason:result.voidReason})},now);
  if(room.question?.view.id===q.view.id)room.question=structuredClone(q);
  if(room.lastQuestion?.view.id===q.view.id)room.lastQuestion=structuredClone(q);
 }
 for(const call of room.playerCalls??[]){
  const result=resolution(call.view,events);setResolution(call.view,result);
  if(room.points)room.points=settleTarget(room.points,call.view.id,{revision,...('optionId' in result?{optionId:result.optionId}:{voidReason:result.voidReason})},now);
 }
 if(room.points?.calls.some(call=>!ids.has(call.targetId)&&!(room.playerCalls??[]).some(target=>target.view.id===call.targetId)))fail('commitment target history missing');
 if(room.pregame){
  const pregame=room.pregame,game=adapter.projectGame(-1,'lobby'),home=state.score[game.home.id],away=state.score[game.away.id];
  delete pregame.result;delete pregame.voidReason;
  if(home===away){pregame.status='void';pregame.voidReason='The corrected final score is tied.';}
  else {pregame.status='resolved';pregame.result={optionId:home>away?game.home.id:game.away.id,explanation:'Corrected authoritative final score.'};}
  for(const p of room.participants){const points=pregame.result&&pregame.result.optionId===pregame.picks[p.id]?.optionId?pregame.correctPoints:0;p.predictionPoints+=points;if(room.points)room.points=correctFreePick(room.points,p.id,pregame.id,points,resultVersion,now);}
 }
 if(room.points)validatePointsState(room.points);
 const next=contribution(room,adapter),prior=corrections.seasonContribution!.rows;
 if(prior.length!==next.length||prior.some(row=>!next.some(value=>value.participantId===row.participantId)))fail('season contribution participant mismatch');
 for(const before of prior){
  const row=season.standings.find(row=>row.participantId===before.participantId),after=next.find(row=>row.participantId===before.participantId)!;
  if(!row||row.nightsPlayed<before.nightsPlayed||row.nightsWon<before.nightsWon)fail('season contribution cannot be reversed');
  row.points=round(row.points-before.points+after.points);row.fantasyPoints=round(row.fantasyPoints-before.fantasyPoints+after.fantasyPoints);row.predictionPoints=round(row.predictionPoints-before.predictionPoints+after.predictionPoints);row.nightsPlayed=row.nightsPlayed-before.nightsPlayed+after.nightsPlayed;row.nightsWon=row.nightsWon-before.nightsWon+after.nightsWon;
 }
 corrections.seasonContribution={resultVersion,rows:next};corrections.applied.push({resultVersion,payloadHash});corrections.revision=revision;corrections.score=state.score;corrections.events=events;
 return {room,season,changed:true,projection:{score:structuredClone(state.score),resultVersion}};
}

/** Cross-record checks used before durable writes and on reload. */
export function validateCorrectionState(room:Room,adapter:RoomSportAdapter):void {
 const state=room.correctionState;if(!state)return;
 if(adapter.sport!=='basketball'||new Set(state.questions.map(item=>item.question.view.id)).size!==state.questions.length)fail('invalid correction history identity');
 for(const p of room.participants)if(p.joinedSequence===undefined||!Number.isSafeInteger(p.joinedSequence)||p.joinedSequence<0)fail('missing participant join sequence');
 for(const item of state.questions){
  const q=item.question;if(!q.view.target||!['resolved','void'].includes(q.view.status)||item.revision>state.revision)fail('nonterminal correction history');
  for(const [id,pick] of Object.entries(q.picks))if(!room.participants.some(p=>p.id===id)||!q.view.target.eligibleParticipantIds.includes(id)||!q.view.options.some(option=>option.id===pick.optionId))fail('invalid history pick');
 }
 if(new Set(state.applied.map(item=>item.resultVersion)).size!==state.applied.length)fail('duplicate applied correction version');
 if(room.recorded!==!!state.seasonContribution)fail('missing contribution evidence');
 if(room.phase==='final'){requireCompleteHistory(room,adapter);requireRecordedPredictions(room);}
 if(state.seasonContribution){
  const rows=state.seasonContribution.rows;if(rows.length!==room.participants.length||new Set(rows.map(row=>row.participantId)).size!==rows.length||rows.some(row=>!room.participants.some(p=>p.id===row.participantId)||row.nightsPlayed!==1||![0,1].includes(row.nightsWon)))fail('invalid contribution rows');
  if(JSON.stringify(canonical(contribution(room,adapter)))!==JSON.stringify(canonical(rows)))fail('contribution does not match corrected room');
 }
 if(state.applied.length){
  if(room.phase!=='final'||!state.events||!state.score)fail('missing corrected final projection');
  const latest=state.applied.at(-1)!;if(state.seasonContribution?.resultVersion!==latest.resultVersion||correctionPayloadHash(state.events)!==latest.payloadHash)fail('corrected projection fingerprint');
  const rebuilt=replay(room,adapter,state.events);
  if(JSON.stringify(canonical(rebuilt.state.score))!==JSON.stringify(canonical(state.score))||JSON.stringify(canonical(rebuilt.state.stats))!==JSON.stringify(canonical(room.stats)))fail('corrected projection mismatch');
  for(const p of room.participants){if(JSON.stringify(canonical(p.baseline))!==JSON.stringify(canonical(rebuilt.baselines.get(p.joinedSequence!))))fail('corrected join baseline mismatch');if(room.points&&freeRewardUnits(room.points,p.id)!==pointsToUnits(p.predictionPoints))fail('corrected reward ledger mismatch');}
  for(const item of state.questions){
   const expected=resolution(item.question.view,state.events),actual=item.question.view;
   if('optionId' in expected?actual.status!=='resolved'||actual.result?.optionId!==expected.optionId:actual.status!=='void'||actual.voidReason!==expected.voidReason)fail('corrected history outcome mismatch');
   if(item.revision!==state.revision||item.correctionKey!==latest.resultVersion)fail('corrected history revision mismatch');
  }
 }else if(state.events||state.score||state.seasonContribution?.resultVersion!=='original'&&state.seasonContribution!==undefined)fail('unversioned correction projection');
}
