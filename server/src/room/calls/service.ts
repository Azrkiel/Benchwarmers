import type { Room } from '../domain.js';
import type { RoomSportAdapter } from '../sports/adapter.js';
import type { PlayerCallDraft } from './model.js';
import { callTemplates, canonicalTargetId, canonicalTargetKey, type PlayerCallInput } from './catalog.js';
import { PointsError } from '../points/model.js';

const fail=(code:string,message:string):never=>{throw new PointsError(409,code,message);};
export function callWindow(room:Room,adapter:RoomSportAdapter,now:number) {
  const q=room.question?.view,beat=adapter.beats[room.beatIndex];
  if(adapter.sport!=='basketball'||room.phase!=='live'||!q?.target||q.status!=='open'||now>=q.locksAt||!beat||!adapter.isWindow(beat))return;
  if(adapter.projectGame(room.beatIndex,room.phase).sourceStatus!=='healthy')return;
  return {questionId:q.id,anchorSequence:q.target.anchorSequence,minimumHorizonGameElapsedMs:(beat.gameElapsedMs??0)+1,maximumHorizonGameElapsedMs:q.target.horizonGameElapsedMs,locksAt:q.locksAt};
}
export function draftPlayerCall(room:Room,adapter:RoomSportAdapter,input:PlayerCallInput,now:number):PlayerCallDraft {
  if(!callTemplates.some(t=>t.templateId===input.templateId))fail('TARGET_UNSUPPORTED','Choose next scoring team or next made field goal value.');
  const window=callWindow(room,adapter,now);
  if(!window) return fail('PICKS_LOCKED','Wait for a safe prediction window.');
  if(input.anchorSequence!==window.anchorSequence)fail('STALE_ANCHOR','Review a call for the current action anchor.');
  if(!Number.isSafeInteger(input.horizonGameElapsedMs)||input.horizonGameElapsedMs<window.minimumHorizonGameElapsedMs||input.horizonGameElapsedMs>window.maximumHorizonGameElapsedMs)fail('BAD_HORIZON','Choose a game-time horizon within the server safe window.');
  const prompted=room.question!.view,game=adapter.projectGame(room.beatIndex,room.phase);
  const target={templateId:input.templateId,anchorSequence:input.anchorSequence,horizonGameElapsedMs:input.horizonGameElapsedMs,eligibleParticipantIds:prompted.target!.eligibleParticipantIds};
  const key=canonicalTargetKey(room.gameId,target);
  const existing=room.playerCalls?.find(call=>call.key===key);
  if(existing)return structuredClone({key:existing.key,windowQuestionId:existing.windowQuestionId,view:existing.view});
  // Use the prompted target's existing identity when semantics match, including pre-upgrade holds.
  const id=canonicalTargetKey(room.gameId,prompted.target!)===key?prompted.id:canonicalTargetId(key);
  const options=input.templateId==='next_score_team'
    ? [game.home,game.away].map(team=>({id:team.id,label:team.name,basePoints:0 as const}))
    : [{id:'two',label:'Two',basePoints:0 as const},{id:'three',label:'Three',basePoints:0 as const}];
  return {key,windowQuestionId:prompted.id,view:{id,kind:input.templateId,text:input.templateId==='next_score_team'?'Which team scores next?':'Next made basket: two or three?',opensAt:now,locksAt:window.locksAt,remainingMs:window.locksAt-now,options,pickCounts:{},status:'open',target}};
}
export function checkPlayerCallLimits(room:Room,participantId:string,draft:PlayerCallDraft,now:number):void {
  if(room.points?.calls.some(call=>call.participantId===participantId&&call.targetId===draft.view.id))fail('CALL_ALREADY_COMMITTED','This target already has your immutable commitment.');
  const calls=room.playerCalls??[];
  if(room.points?.calls.some(call=>call.participantId===participantId&&call.state==='pending'&&room.points!.quotes.some(quote=>quote.quoteId===call.quoteId&&quote.playerCall)))fail('CALL_LIMIT_REACHED','You already have an active voluntary call.');
  if(calls.some(call=>call.key===draft.key))return; // Followers do not allocate a target or restart creation cooldown.
  if(calls.filter(call=>call.view.status==='open'||call.view.status==='locked').length>=3)fail('CALL_LIMIT_REACHED','The room already has three active call targets.');
  if(calls.some(call=>call.creatorId===participantId&&now<call.createdAt+15000))fail('CALL_LIMIT_REACHED','Wait 15 seconds between creating call targets.');
}
