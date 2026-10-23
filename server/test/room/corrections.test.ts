import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {initializeCorrections,recordResolvedQuestion,captureSeasonContribution,reconcileFinal} from '../../src/room/corrections/service.js';
import {basketball as scriptedBasketball} from '../../src/room/sports/basketball.js';
import type {Room,Season,QuestionState} from '../../src/room/domain.js';
import type {BasketballEvent} from '../../src/room/basketball/events.js';
import {createPointsState,grantBank,rewardFreePick,bankFor,validatePointsState} from '../../src/room/points/ledger.js';
import {quoteCommitment,acceptCommitment,type QuoteContext} from '../../src/room/points/quotes.js';
import {settleTarget} from '../../src/room/points/settle.js';
import {validateSavedRooms} from '../../src/room/persistence.js';
import {initialBasketballState,reduceBasketballEvent} from '../../src/room/basketball/reducer.js';
import demo from '../../src/room/basketball/demo.json' with {type:'json'};
import {validateBasketballTimeline} from '../../src/room/basketball/validate.js';
// The pure-service fixture has one explicitly supplied question rather than the full demo.
const basketball={...scriptedBasketball,beats:[]};
const version=(text:string)=>createHash('sha256').update(text).digest('hex');
const events=():BasketballEvent[]=>[
 {id:'possession',revision:1,sequence:1,gameId:basketball.gameId,gameElapsedMs:0,occurredAt:0,receivedAt:0,kind:'possession',teamId:'harbor'},
 {id:'basket',revision:1,sequence:3,gameId:basketball.gameId,gameElapsedMs:1000,occurredAt:1000,receivedAt:1000,kind:'score',teamId:'harbor',playerId:'h1',scoreValue:2,statDeltas:{pts2:1}},
 {id:'final',revision:1,sequence:9,gameId:basketball.gameId,gameElapsedMs:2000,occurredAt:2000,receivedAt:2000,kind:'final'},
];
function setup(){
 const ids=basketball.players.filter(p=>p.team==='harbor').map(p=>p.id),home=ids[0];
 const log=events();log[1].playerId=home;
 const room:Room={code:'ABCDEF',name:'Test',seasonId:'season',hostToken:'host',createdAt:0,gameId:basketball.gameId,rulesVersion:basketball.rulesVersion,version:1,phase:'lobby',speed:1,rules:structuredClone(basketball.rules),participants:[{id:'p',name:'Pat',token:'token',baseline:{},predictionPoints:0,streak:0,joinedSequence:0}],beatIndex:-1,elapsedMs:0,durationMs:1,windowElapsedMs:0,lastTickAt:0,stats:{},recorded:false,points:grantBank(createPointsState(),'p',0)};
 initializeCorrections(room);
 const q:QuestionState={view:{id:'q',kind:'next_score_team',text:'Who?',opensAt:0,locksAt:1000,remainingMs:0,status:'resolved',options:[{id:'harbor',label:'Harbor',basePoints:10},{id:'summit',label:'Summit',basePoints:10}],pickCounts:{harbor:1},result:{optionId:'harbor',explanation:'Original'},target:{templateId:'next_score_team',anchorSequence:1,horizonGameElapsedMs:1500,eligibleParticipantIds:['p']}},picks:{p:{optionId:'harbor',elapsedFraction:0}}};
 room.participants[0].predictionPoints=12.5;room.participants[0].streak=1;
 room.points=rewardFreePick(room.points!,'p','q',12.5,1000);recordResolvedQuestion(room,q);
 room.lastQuestion=structuredClone(q);room.question=structuredClone(q);room.phase='final';room.beatIndex=basketball.beats.length-1;room.recorded=false;room.stats={[home]:{pts2:1}};
 captureSeasonContribution(room,basketball);room.recorded=true;
 const season:Season={id:'season',name:'Season',identities:[{id:'p',name:'Pat',token:'token'}],standings:structuredClone(room.correctionState!.seasonContribution!.rows)};
 return {room,season,log,home};
}
describe('complete final outcome reconciliation',()=>{
 it('rebuilds stats and free rewards with compensating entries and replaces one season night',()=>{
  const {room,season,log}=setup();const away=basketball.players.find(p=>p.team==='summit')!.id;
  log[1]={...log[1],teamId:'summit',playerId:away,revision:2};
  const result=reconcileFinal(room,season,log,version('corrected'),basketball,3000);
  expect(result.changed).toBe(true);expect(room.participants[0].predictionPoints).toBe(12.5);
  expect(result.room.participants[0]).toMatchObject({predictionPoints:0,streak:0});
  expect(result.room.stats).toEqual({[away]:{pts2:1}});expect(result.projection.score).toEqual({harbor:0,summit:2});
  expect(result.room.lastQuestion!.view.result!.optionId).toBe('summit');
  expect(result.room.points!.entries).toEqual(expect.arrayContaining([expect.objectContaining({reason:'free_pick_correction',direction:'debit',units:25,questionId:'q'})]));
  expect(bankFor(result.room.points!,'p').availablePoints).toBe(100);validatePointsState(result.room.points);
  expect(result.season.standings[0]).toMatchObject({points:0,predictionPoints:0,nightsPlayed:1,nightsWon:1});
 });
 it('is replay safe and rejects a reused version with different payload',()=>{
  const s=setup(),first=reconcileFinal(s.room,s.season,s.log,version('first'),basketball,3000);
  const replay=reconcileFinal(first.room,first.season,s.log,version('first'),basketball,4000);
  expect(replay.changed).toBe(false);expect(replay.room).toEqual(first.room);expect(replay.season).toEqual(first.season);
  const changed=structuredClone(s.log);changed[1].receivedAt++;
  expect(()=>reconcileFinal(first.room,first.season,changed,version('first'),basketball)).toThrow(/conflict/i);
 });
 it('rejects missing opt-in, missing history, nonfinal inputs, duplicate events and unknown join boundaries',()=>{
  const s=setup();delete s.room.correctionState;expect(()=>reconcileFinal(s.room,s.season,s.log,version('x'),basketball)).toThrow(/history/i);
  const missing=setup();missing.room.correctionState!.questions=[];expect(()=>reconcileFinal(missing.room,missing.season,missing.log,version('x'),basketball)).toThrow(/history/i);
  const live=setup();live.room.phase='live';expect(()=>reconcileFinal(live.room,live.season,live.log,version('x'),basketball)).toThrow(/final/i);
  const duplicate=setup();duplicate.log.splice(2,0,structuredClone(duplicate.log[1]));expect(()=>reconcileFinal(duplicate.room,duplicate.season,duplicate.log,version('x'),basketball)).toThrow(/duplicate/i);
  const joined=setup();delete joined.room.participants[0].joinedSequence;expect(()=>reconcileFinal(joined.room,joined.season,joined.log,version('x'),basketball)).toThrow(/join/i);
 });
 it('rebuilds late join baselines from corrected prejoin events',()=>{
  const s=setup();s.room.participants[0].joinedSequence=3;s.room.participants[0].baseline={[s.home]:{pts2:1}};
  s.log[1]={...s.log[1],scoreValue:3,statDeltas:{pts3:1},revision:2};
  const corrected=reconcileFinal(s.room,s.season,s.log,version('late'),basketball);
  expect(corrected.room.participants[0].baseline).toEqual({[s.home]:{pts3:1}});
 });
 it('can change an initially wrong pregame pick to a winner and later void without changing the original reward',()=>{
  const s=setup();s.room.pregame={version:1,id:'pregame-winner-v1',status:'resolved',cutoff:'replay_start',correctPoints:10,lockedAt:1,picks:{p:{optionId:'summit',acceptedAt:0}},result:{optionId:'harbor',explanation:'Original'}};
  const away=basketball.players.find(p=>p.team==='summit')!.id;s.log[1]={...s.log[1],teamId:'summit',playerId:away,revision:2};
  const corrected=reconcileFinal(s.room,s.season,s.log,version('winner'),basketball,3000);
  expect(corrected.room.participants[0].predictionPoints).toBe(10);expect(bankFor(corrected.room.points!,'p').availablePoints).toBe(110);validatePointsState(corrected.room.points);
  const tied=[s.log[0],s.log[2]],voided=reconcileFinal(corrected.room,corrected.season,tied,version('void'),basketball,4000);
  expect(voided.room.pregame!.status).toBe('void');expect(voided.room.participants[0].predictionPoints).toBe(0);validatePointsState(voided.room.points);
 });
 it('does not grant a void pregame reward to someone who made no pregame pick',()=>{
  const s=setup();s.room.pregame={version:1,id:'pregame-winner-v1',status:'resolved',cutoff:'replay_start',correctPoints:10,lockedAt:1,picks:{},result:{optionId:'harbor',explanation:'Original'}};
  const corrected=reconcileFinal(s.room,s.season,[s.log[0],s.log[2]],version('empty'),basketball);
  expect(corrected.room.participants[0].predictionPoints).toBe(0);
 });
 it('requires all original scripted question windows even if a missing question had no picks',()=>{
  const s=setup();
  expect(()=>reconcileFinal(s.room,s.season,s.log,version('missing'),scriptedBasketball)).toThrow(/history/i);
 });
 it('rejects a prior season contribution that differs from the recorded room rather than subtracting unknown totals',()=>{
  const s=setup();s.room.correctionState!.seasonContribution!.rows[0].points++;
  expect(()=>reconcileFinal(s.room,s.season,s.log,version('bad-contribution'),basketball)).toThrow(/contribution/i);
 });
 it('preserves accepted commitment terms and posts a reversal when a winning call becomes a loss',()=>{
  const s=setup(),context:QuoteContext={participantId:'p',targetId:'q',targetVersion:'original',optionId:'harbor',optionLabel:'Harbor',eligibleParticipantIds:['p'],open:true,now:100,locksAt:1000,probability:{p:0.5,source:'synthetic',label:'Fixture',version:'v1',observedAt:0,validUntil:1000}};
  const quote=quoteCommitment(s.room.points!,context,10,'quote');
  const accepted=acceptCommitment(quote.state,{participantId:'p',requestId:'request',quoteId:quote.quote.quoteId,callId:'call',context});
  s.room.points=settleTarget(accepted.state,'q',{revision:1,optionId:'harbor'},1000);
  const frozen=structuredClone(s.room.points.calls[0]);
  s.room.correctionState!.seasonContribution=undefined;s.room.recorded=false;captureSeasonContribution(s.room,basketball);s.room.recorded=true;s.season.standings=structuredClone(s.room.correctionState!.seasonContribution!.rows);
  const away=basketball.players.find(p=>p.team==='summit')!.id;s.log[1]={...s.log[1],teamId:'summit',playerId:away,revision:2};
  const corrected=reconcileFinal(s.room,s.season,s.log,version('call-loss'),basketball,3000),call=corrected.room.points!.calls[0];
  expect(call).toMatchObject({state:'lost',outcomeRevision:2,commitUnits:frozen.commitUnits,totalReturnUnits:frozen.totalReturnUnits,multiplierHundredths:frozen.multiplierHundredths,probabilityP:frozen.probabilityP});
  expect(corrected.room.points!.quotes).toEqual(s.room.points.quotes);
  expect(corrected.room.points!.entries).toEqual(expect.arrayContaining([expect.objectContaining({callId:'call',reason:'correction',direction:'debit',units:frozen.settledReturnUnits})]));
  expect(bankFor(corrected.room.points!,'p').settledRiskNet).toBe(-10);validatePointsState(corrected.room.points);
 });
 it('replaces tied season winners while preserving unrelated nights and recomputes the streak chain',()=>{
  const s=setup(),p=s.room.participants[0],q=s.room.correctionState!.questions[0].question;
  const q2=structuredClone(q);q2.view.id='q2';q2.view.target!.anchorSequence=3;q2.view.target!.horizonGameElapsedMs=4000;q2.view.opensAt=2000;q2.picks.p.elapsedFraction=1;
  const log=s.log;log.splice(2,0,{...log[1],id:'basket2',sequence:5,gameElapsedMs:3000});log.at(-1)!.gameElapsedMs=5000;
  p.predictionPoints+=15;p.streak=2;s.room.points=rewardFreePick(s.room.points!,'p','q2',15,2000);recordResolvedQuestion(s.room,q2);s.room.lastQuestion=q2;
  s.room.participants.push({id:'other',name:'Other',token:'other-token',baseline:{},predictionPoints:0,streak:0,joinedSequence:0});s.room.points=grantBank(s.room.points!,'other',0);
  s.room.recorded=false;s.room.correctionState!.seasonContribution=undefined;captureSeasonContribution(s.room,basketball);s.room.recorded=true;
  s.season.identities.push({id:'other',name:'Other',token:'other-token'});s.season.standings=structuredClone(s.room.correctionState!.seasonContribution!.rows);
  s.season.standings.forEach(row=>{row.nightsPlayed+=2;row.nightsWon+=1;row.points+=100;});
  const away=basketball.players.find(p=>p.team==='summit')!.id;log[1]={...log[1],teamId:'summit',playerId:away,revision:2};
  const corrected=reconcileFinal(s.room,s.season,log,version('chain'),basketball,6000);
  expect(corrected.room.participants[0]).toMatchObject({predictionPoints:10,streak:1});
  expect(corrected.season.standings).toEqual(expect.arrayContaining([expect.objectContaining({participantId:'p',points:110,nightsPlayed:3,nightsWon:2}),expect.objectContaining({participantId:'other',points:100,nightsPlayed:3,nightsWon:1})]));
  const tie=reconcileFinal(corrected.room,corrected.season,log.filter(e=>e.kind!=='score'),version('tie'),basketball,7000);
  expect(tie.season.standings).toEqual(expect.arrayContaining([expect.objectContaining({participantId:'p',points:100,nightsPlayed:3,nightsWon:2}),expect.objectContaining({participantId:'other',points:100,nightsPlayed:3,nightsWon:2})]));
 });
});

function completeRoom(){
 const s=setup(),r=s.room;delete r.correctionState;delete r.question;delete r.lastQuestion;r.participants[0].predictionPoints=0;r.participants[0].streak=0;r.points=grantBank(createPointsState(),'p',0);r.phase='lobby';r.recorded=false;r.beatIndex=-1;
 initializeCorrections(r);const timeline=validateBasketballTimeline(demo);let state=initialBasketballState(timeline.catalog);const log:BasketballEvent[]=[];
 for(const beat of timeline.beats){
  if(beat.event){state=reduceBasketballEvent(state,beat.event,timeline.catalog).state;log.push(beat.event);}
  if(beat.question){
   const sourceBeat=scriptedBasketball.beats.find(b=>b.id===beat.id)!,view=scriptedBasketball.question(sourceBeat,beat.sequence*1000,8000)!;view.target!.eligibleParticipantIds=['p'];
   const result=timeline.outcomes[view.id];view.status=result.state;view.remainingMs=0;if(result.state==='resolved')view.result={optionId:result.optionId,explanation:'Original'};else view.voidReason='No scoring event';
   const q={view,picks:{}};recordResolvedQuestion(r,q);r.lastQuestion=q;
  }
 }
 r.stats=state.stats;r.phase='final';r.beatIndex=scriptedBasketball.beats.length-1;captureSeasonContribution(r,scriptedBasketball);r.recorded=true;s.season.standings=structuredClone(r.correctionState!.seasonContribution!.rows);
 return {...s,log};
}
describe('durable correction integrity',()=>{
 it('round trips history, correction projection, contribution and baseline metadata',()=>{
  const s=completeRoom(),first=s.log.find(e=>e.kind==='score')!;first.revision++;first.scoreValue=3;first.shotType='three_pointer';first.statDeltas={pts3:1};
  const result=reconcileFinal(s.room,s.season,s.log,version('durable'),scriptedBasketball,5000);
  const saved={version:2 as const,rooms:[result.room],seasons:[result.season]};
  expect(validateSavedRooms(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  const tampered=structuredClone(saved);tampered.rooms[0].correctionState!.score!.harbor++;
  expect(()=>validateSavedRooms(tampered)).toThrow(/projection mismatch/i);
  const unknown=structuredClone(saved) as any;unknown.rooms[0].correctionState.unknown=true;expect(()=>validateSavedRooms(unknown)).toThrow(/validation/i);
 });
 it('rejects a corrupted history outcome even when overall zero-pick totals still match',()=>{
  const s=completeRoom(),corrected=reconcileFinal(s.room,s.season,s.log,version('integrity'),scriptedBasketball,5000);
  const q=corrected.room.correctionState!.questions.find(q=>q.question.view.status==='resolved')!.question;
  q.view.result!.optionId=q.view.options.find(o=>o.id!==q.view.result!.optionId)!.id;
  expect(()=>validateSavedRooms({version:2,rooms:[corrected.room],seasons:[corrected.season]})).toThrow(/history outcome/i);
 });
 it('rejects reward correction postings without an applied result version and recorded target',()=>{
  const s=completeRoom();s.room.points!.entries.push({id:'forged',participantId:'p',questionId:'unrecorded',resultVersion:version('forged'),units:0,direction:'credit',reason:'free_pick_correction',createdAt:0});
  expect(()=>validateSavedRooms({version:2,rooms:[s.room],seasons:[s.season]})).toThrow(/correction posting/i);
 });
 it('rejects apparently balanced prediction totals unsupported by complete accepted-pick history',()=>{
  const s=completeRoom();s.room.participants[0].predictionPoints=10;s.room.points=rewardFreePick(s.room.points!,'p','missing-history',10,0);
  s.room.recorded=false;s.room.correctionState!.seasonContribution=undefined;captureSeasonContribution(s.room,scriptedBasketball);s.room.recorded=true;s.season.standings=structuredClone(s.room.correctionState!.seasonContribution!.rows);
  expect(()=>validateSavedRooms({version:2,rooms:[s.room],seasons:[s.season]})).toThrow(/prediction history/i);
 });
});
