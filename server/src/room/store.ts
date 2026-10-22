import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { PLAYERS, PLAYER_BY_ID, TEAMS, PREDICTION_LABELS, PREDICTION_POINTS } from './replay/data.js';
import { buildTimeline, toSec, type Beat } from './replay/timeline.js';
import { fantasyPoints } from './replay/scoring.js';
import { DEFAULT_RULES, FOUR_WAY_PROBABILITIES, positionPoints, scorePrediction, statLine } from './scoring.js';
import { getOdds } from '../game/odds.js';
import type { RoomLineup, RoomPhase, RoomPickScore, RoomQuestion, RoomRules, RoomSeasonStanding, RoomStanding, RoomSummary, RoomView } from './types.js';

export class RoomError extends Error {
 constructor(readonly status:number,readonly code:string,message:string){super(message);this.name='RoomError';}
}
type Stats=Record<string,Record<string,number>>;
type Identity={id:string;name:string;token:string};
type Participant={id:string;name:string;token:string;baseline:Stats;lineup?:RoomLineup;predictionPoints:number;streak:number;lastPickScore?:RoomPickScore};
type QuestionState={view:RoomQuestion;picks:Record<string,{optionId:string;elapsedFraction:number}>};
type Room={code:string;name:string;seasonId:string;hostToken:string;createdAt:number;phase:RoomPhase;speed:number;rules:RoomRules;participants:Participant[];beatIndex:number;elapsedMs:number;durationMs:number;windowElapsedMs:number;lastTickAt:number;stats:Stats;question?:QuestionState;lastQuestion?:QuestionState;recorded:boolean};
type Season={id:string;name:string;identities:Identity[];standings:RoomSeasonStanding[]};
type Saved={version:1;rooms:Room[];seasons:Season[]};
const TIMELINE=buildTimeline();
const BEATS=TIMELINE.beats;
const clone=<T>(value:T):T=>structuredClone(value);
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const secret=()=>randomBytes(32).toString('base64url');
const fail=(status:number,code:string,message:string):never=>{throw new RoomError(status,code,message);};

/** Independent room store: never reads or rewrites the legacy household store. */
export class RoomStore {
 private rooms:Room[]=[];
 private seasons:Season[]=[];
 private readonly dataFile:string;
 private readonly persist:boolean;
 private readonly now:()=>number;
 private readonly defaultSpeed:number;
 constructor(options:{dataFile?:string;persist?:boolean;now?:()=>number;speed?:number}={}){
  this.dataFile=options.dataFile??'data/rooms.json';this.persist=options.persist??true;this.now=options.now??Date.now;this.defaultSpeed=this.validSpeed(options.speed??1);
  if(this.persist&&fs.existsSync(this.dataFile)){
   const saved=JSON.parse(fs.readFileSync(this.dataFile,'utf8')) as Saved;
   if(saved.version!==1||!Array.isArray(saved.rooms)||!Array.isArray(saved.seasons))throw new Error('Unsupported room data file');
   this.rooms=saved.rooms;this.seasons=saved.seasons;
   // Restore the last durable replay position. Offline time never skips questions.
   for(const room of this.rooms){room.lastTickAt=this.now();if(room.question?.view.status==='open')this.refreshDeadline(room);}
  }
 }
 private validSpeed(speed:number):number {if(![1,2,3,4].includes(speed))fail(400,'BAD_SPEED','Speed must be 1, 2, 3, or 4.');return speed;}
 private save():void {
  if(!this.persist)return;
  fs.mkdirSync(path.dirname(this.dataFile),{recursive:true});
  const temp=`${this.dataFile}.tmp`;fs.writeFileSync(temp,JSON.stringify({version:1,rooms:this.rooms,seasons:this.seasons} satisfies Saved));
  fs.renameSync(temp,this.dataFile);
 }
 private room(code:string):Room {const r=this.rooms.find(r=>r.code===String(code).trim().toUpperCase());if(!r)return fail(404,'ROOM_NOT_FOUND','Room not found. Check the join code.');return r;}
 private participant(room:Room,token:string):Participant {const p=room.participants.find(p=>token&&p.token===token);if(!p)return fail(401,'BAD_CREDENTIAL','A valid participant credential is required.');return p;}
 private season(room:Room):Season{return this.seasons.find(s=>s.id===room.seasonId)!;}
 private summary(r:Room):RoomSummary{return {code:r.code,name:r.name,seasonId:r.seasonId,phase:r.phase,speed:r.speed,participantCount:r.participants.length,createdAt:r.createdAt};}
 create(input:{name?:string;seasonId?:string;speed?:number}={}):{view:RoomView;hostToken:string}{
  const speed=this.validSpeed(input.speed??this.defaultSpeed);
  const seasonId=input.seasonId?.trim()||'demo-season';
  if(seasonId.length>80)fail(400,'BAD_SEASON','Season ID must be at most 80 characters.');
  if(!this.seasons.some(s=>s.id===seasonId))this.seasons.push({id:seasonId,name:seasonId==='demo-season'?'Demo season':seasonId,identities:[],standings:[]});
  let code:string;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.some(r=>r.code===code));
  const r:Room={code,name:input.name?.trim().slice(0,60)||'Football Watch Party',seasonId,hostToken:secret(),createdAt:this.now(),phase:'lobby',speed,rules:clone(DEFAULT_RULES),participants:[],beatIndex:-1,elapsedMs:0,durationMs:0,windowElapsedMs:0,lastTickAt:this.now(),stats:{},recorded:false};
  this.rooms.push(r);this.save();return {view:this.snapshot(r),hostToken:r.hostToken};
 }
 list():RoomSummary[]{this.tick();return this.rooms.map(r=>this.summary(r)).reverse();}
 join(code:string,input:{name:string;participantToken?:string}):{view:RoomView;participantId:string;participantToken:string}{
  this.tick();const r=this.room(code);const name=String(input.name??'').trim().slice(0,24);if(!name)fail(400,'BAD_NAME','Pick a display name to join.');
  const season=this.season(r);
  let identity:Identity|undefined;
  if(input.participantToken){identity=season.identities.find(i=>i.token===input.participantToken);if(!identity)fail(401,'BAD_CREDENTIAL','That participant credential is not valid for this season.');}
  let p=identity?r.participants.find(p=>p.id===identity!.id):undefined;
  if(!p){
   if(r.phase==='final')fail(409,'ROOM_FINAL','This game has finished. Join a new room.');
   if(r.participants.some(p=>p.name.toLowerCase()===(identity?.name??name).toLowerCase()))fail(409,'NAME_TAKEN','That name is already in this room. Use your saved credential to rejoin or choose another name.');
   if(!identity){identity={id:randomUUID(),name,token:secret()};season.identities.push(identity);}
   p={id:identity.id,name:identity.name,token:identity.token,baseline:clone(r.stats),predictionPoints:0,streak:0};
   if(r.phase!=='lobby')p.lineup=this.buildAutoLineup(r,'balanced');r.participants.push(p);this.save();
  }
  return {view:this.snapshot(r,p),participantId:p.id,participantToken:p.token};
 }
 view(code:string,participantToken?:string):RoomView {this.tick();const r=this.room(code);return this.snapshot(r,participantToken!==undefined?this.participant(r,participantToken):undefined);}
 private validateLineup(r:Room,captainId:string,flexIds:string[]):RoomLineup {
  if(!Object.hasOwn(PLAYER_BY_ID,captainId))fail(400,'BAD_PLAYER','Choose a valid captain.');
  if(!Array.isArray(flexIds)||flexIds.length!==r.rules.flexSlots)fail(400,'BAD_LINEUP',`Choose exactly ${r.rules.flexSlots} flex players.`);
  if(flexIds.some(id=>!Object.hasOwn(PLAYER_BY_ID,id)))fail(400,'BAD_PLAYER','Choose valid flex players.');
  if(new Set([captainId,...flexIds]).size!==1+flexIds.length)fail(400,'DUPLICATE_PLAYER','Each athlete can appear only once in your lineup.');
  const salaryUsed=Math.round(PLAYER_BY_ID[captainId].salary*r.rules.captainMultiplier)+flexIds.reduce((sum,id)=>sum+PLAYER_BY_ID[id].salary,0);
  if(salaryUsed>r.rules.salaryCap)fail(400,'OVER_CAP',`That lineup costs $${salaryUsed.toLocaleString()}, above the $${r.rules.salaryCap.toLocaleString()} cap. The captain costs 1.5x.`);
  return {captainId,flexIds:[...flexIds],salaryUsed};
 }
 setLineup(code:string,input:{participantToken:string;captainId:string;flexIds:string[]}):RoomView {
  this.tick();const r=this.room(code);const p=this.participant(r,input.participantToken);if(r.phase!=='lobby')fail(409,'LINEUPS_LOCKED','Lineups locked at kickoff.');
  p.lineup=this.validateLineup(r,input.captainId,input.flexIds);this.save();return this.snapshot(r,p);
 }
 private buildAutoLineup(r:Room,style:'balanced'|'stars'|'value'):RoomLineup {
  // Salary/role heuristics only; never peek at the immutable future script.
  const chosen=style==='stars'?['will-power','max-yardage','robin-banks','lance-downfield','major-package']:style==='value'?['hugh-jass','barb-dwyer','phil-mccracken','ben-dover','holden-penalty']:['max-yardage','robin-banks','hugh-jass','barb-dwyer','chip-shot'];
  return this.validateLineup(r,chosen[0],chosen.slice(1));
 }
 autoLineup(code:string,input:{participantToken:string;style?:'balanced'|'stars'|'value'}):RoomView {
  this.tick();const r=this.room(code);const p=this.participant(r,input.participantToken);if(r.phase!=='lobby')fail(409,'LINEUPS_LOCKED','Lineups locked at kickoff.');
  const style=input.style??'balanced';if(!['balanced','stars','value'].includes(style))fail(400,'BAD_STYLE','Choose balanced, stars, or value.');p.lineup=this.buildAutoLineup(r,style);this.save();return this.snapshot(r,p);
 }
 pick(code:string,input:{participantToken:string;questionId:string;optionId:string}):RoomView {
  this.tick();const r=this.room(code);const p=this.participant(r,input.participantToken);const q=r.question;
  if(r.phase!=='live'||!q||q.view.id!==input.questionId||q.view.status!=='open')return fail(409,'PICKS_LOCKED','That question is not open.');
  if(!q.view.options.some(o=>o.id===input.optionId))fail(400,'BAD_OPTION','Choose one of the displayed prediction options.');
  // Duplicate transmissions retain early-call timing. A changed mind gets the new time.
  if(q.picks[p.id]?.optionId!==input.optionId)q.picks[p.id]={optionId:input.optionId,elapsedFraction:r.elapsedMs/r.durationMs};
  this.save();return this.snapshot(r,p);
 }
 host(code:string,input:{hostToken:string;action:'start'|'pause'|'resume'|'set_speed';speed?:number}):RoomView {
  this.tick();const r=this.room(code);if(!input.hostToken||input.hostToken!==r.hostToken)fail(401,'BAD_HOST_CREDENTIAL','A valid host credential is required.');
  switch(input.action){
   case 'start':if(r.phase!=='lobby')fail(409,'BAD_PHASE','Only a lobby can start.');for(const p of r.participants)p.lineup??=this.buildAutoLineup(r,'balanced');r.phase='live';r.lastTickAt=this.now();this.advanceBeat(r);break;
   case 'pause':if(r.phase!=='live')fail(409,'BAD_PHASE','Only a live game can pause.');r.phase='paused';break;
   case 'resume':if(r.phase!=='paused')fail(409,'BAD_PHASE','Only a paused game can resume.');r.phase='live';r.lastTickAt=this.now();this.refreshDeadline(r);break;
   case 'set_speed':{
    const speed=this.validSpeed(input.speed??NaN);const fraction=r.durationMs>0?r.elapsedMs/r.durationMs:0;r.speed=speed;
    if(r.beatIndex>=0){const beat=BEATS[r.beatIndex];let duration=this.duration(beat,speed);
     // Keep elapsed replay fraction, while every prediction gets >=5s active wall time.
     if(beat.type==='drive_start')duration=Math.max(duration,(5000-r.windowElapsedMs)/Math.max(.000001,1-fraction));
     r.durationMs=duration;r.elapsedMs=fraction*duration;this.refreshDeadline(r);
    }break;
   }
   default:fail(400,'BAD_ACTION','Unknown host action.');
  }
  this.save();return this.snapshot(r);
 }
 private duration(beat:Beat,speed:number):number {
  if(beat.type==='drive_start')return Math.max(8000/speed,5000);
  const ms=beat.type==='play'&&beat.kind==='td'?4500:({play:3000,pat:2000,drive_end:2500,halftime:6000}[beat.type]??3000);return ms/speed;
 }
 private refreshDeadline(r:Room):void {
  const q=r.question?.view;if(q?.status!=='open')return;
  const remaining=Math.max(0,r.durationMs-r.elapsedMs);q.remainingMs=remaining;q.locksAt=this.now()+remaining;q.opensAt=q.locksAt-r.durationMs;
 }
 tick():void {
  const now=this.now();let changed=false;
  for(const r of this.rooms){if(r.phase!=='live')continue;
   let remaining=Math.max(0,now-r.lastTickAt);r.lastTickAt=now;if(remaining===0)continue;changed=true;
   while(r.phase==='live'&&remaining>=0){
    const left=r.durationMs-r.elapsedMs;
    if(remaining<left){r.elapsedMs+=remaining;if(BEATS[r.beatIndex]?.type==='drive_start')r.windowElapsedMs+=remaining;break;}
    remaining-=left;if(BEATS[r.beatIndex]?.type==='drive_start')r.windowElapsedMs+=left;this.advanceBeat(r);
    // Newly featured question must be visible for a real response window, even after a stalled timer.
    if(BEATS[r.beatIndex]?.type==='drive_start')break;
    if(remaining===0)break;
   }
   this.refreshDeadline(r);
  }
  if(changed)this.save();
 }
 private advanceBeat(r:Room):void {
  r.beatIndex++;const beat=BEATS[r.beatIndex];if(!beat)return;
  r.elapsedMs=0;r.durationMs=this.duration(beat,r.speed);r.windowElapsedMs=0;
  if(beat.type==='play'&&r.question?.view.status==='open'){r.question.view.status='locked';r.question.view.remainingMs=0;}
  for(const [id,key,n] of beat.deltas){r.stats[id]??={};r.stats[id][key]=(r.stats[id][key]??0)+n;}
  if(beat.type==='drive_start'){
   const kind=beat.drive%2===0?'drive_outcome':beat.drive%4===1?'drive_score':'drive_td';
   const binary=kind!=='drive_outcome';const odds=binary?getOdds(100-beat.ballOn,(beat.q%2===1?900:0)+toSec(beat.clock),kind==='drive_td'?'td':'score'):undefined;
   const options=binary?[{id:'yes',label:'Yes',basePoints:10,probability:odds!.p},{id:'no',label:'No',basePoints:10,probability:1-odds!.p}]:Object.keys(PREDICTION_POINTS).map(id=>({id,label:PREDICTION_LABELS[id],basePoints:PREDICTION_POINTS[id],probability:FOUR_WAY_PROBABILITIES[id]}));
   r.question={view:{id:`drive-${beat.drive+1}`,kind,text:binary?`Will ${TEAMS[beat.off].name} ${kind==='drive_td'?'score a touchdown':'score'} on this drive?`:`How will ${TEAMS[beat.off].name}'s drive end?`,opensAt:this.now(),locksAt:this.now()+r.durationMs,remainingMs:r.durationMs,options,pickCounts:{},status:'open'},picks:{}};
  }
  if(beat.type==='drive_end')this.resolveQuestion(r,beat);
  if(beat.type==='final'){r.phase='final';this.recordSeason(r);}
 }
 private resolveQuestion(r:Room,beat:Beat):void {
  const q=r.question;if(!q)return;
  const optionId=q.view.kind==='drive_outcome'?beat.outcome!:q.view.kind==='drive_td'?(beat.outcome==='TD'?'yes':'no'):['TD','FG'].includes(beat.outcome!)?'yes':'no';
  const picks=Object.values(q.picks);
  for(const p of r.participants){const pick=q.picks[p.id];if(!pick){p.streak=0;continue;}const option=q.view.options.find(o=>o.id===pick.optionId)!;
   const score=scorePrediction({optionId:pick.optionId,result:optionId,base:option.basePoints,probability:option.probability,optionCount:q.view.options.length,streak:p.streak,elapsedFraction:pick.elapsedFraction,same:picks.filter(v=>v.optionId===pick.optionId).length,pickers:picks.length,factorCap:r.rules.pickFactorCap});
   p.predictionPoints+=score.points;p.lastPickScore=score;p.streak=score.correct?p.streak+1:0;
  }
  q.view.status='resolved';q.view.remainingMs=0;q.view.result={optionId,explanation:beat.text};r.lastQuestion=clone(q);
 }
 private standings(r:Room):RoomStanding[]{
  const rows=r.participants.map(p=>{
   const ids=p.lineup?[p.lineup.captainId,...p.lineup.flexIds]:[];
   const roster=ids.map((id,index)=>{const player=PLAYER_BY_ID[id];const delta=Object.fromEntries(Object.entries(r.stats[id]??{}).map(([key,n])=>[key,n-(p.baseline[id]?.[key]??0)]));
    return {playerId:id,captain:index===0,points:round(positionPoints(delta,player.role,player.pos,r.rules)*(index===0?r.rules.captainMultiplier:1))};});
   const fantasyPoints=round(roster.reduce((sum,p)=>sum+p.points,0));return {participantId:p.id,name:p.name,rank:0,total:round(fantasyPoints+p.predictionPoints),fantasyPoints,predictionPoints:p.predictionPoints,streak:p.streak,roster,...(p.lastPickScore?{lastPickScore:clone(p.lastPickScore)}:{})};
  }).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  rows.forEach((row,i)=>row.rank=i>0&&row.total===rows[i-1].total?rows[i-1].rank:i+1);return rows;
 }
 private recordSeason(r:Room):void {
  if(r.recorded)return;const season=this.season(r);const rows=this.standings(r);
  for(const row of rows){let total=season.standings.find(s=>s.participantId===row.participantId);if(!total){total={participantId:row.participantId,name:row.name,points:0,fantasyPoints:0,predictionPoints:0,nightsPlayed:0,nightsWon:0};season.standings.push(total);}
   total.points=round(total.points+row.total);total.fantasyPoints=round(total.fantasyPoints+row.fantasyPoints);total.predictionPoints+=row.predictionPoints;total.nightsPlayed++;if(row.rank===1)total.nightsWon++;
  }r.recorded=true;
 }
 private questionView(q:QuestionState):RoomQuestion {
  const view=clone(q.view);view.pickCounts=Object.fromEntries(view.options.map(o=>[o.id,Object.values(q.picks).filter(p=>p.optionId===o.id).length]));return view;
 }
 private snapshot(r:Room,p?:Participant):RoomView {
  const beat=BEATS[r.beatIndex];const score=beat?.score??{VT:0,SD:0};
  const team=(id:string)=>({id,short:id,name:TEAMS[id].name,color:TEAMS[id].color,score:score[id]});
  const view:RoomView={room:this.summary(r),game:{title:"South Dakota Swiss Cheese at Vermont's Morning Wood",home:team('VT'),away:team('SD'),quarter:beat?.q??1,clock:beat?.clock??'15:00',situation:beat?.situation??(r.phase==='lobby'?'Waiting for kickoff':`${beat?.down??1} & ${beat?.togo??10}`),ballOn:beat?.ballOn??25,fieldX:beat?.fieldX??25,possession:r.phase==='final'||r.phase==='lobby'?null:beat?.off??null,driveNumber:beat?beat.drive+1:0,driveCount:TIMELINE.driveCount,recentPlays:BEATS.slice(Math.max(0,r.beatIndex-11),r.beatIndex+1).map(b=>({id:`beat-${b.i}`,text:b.text,kind:b.kind,quarter:b.q,clock:b.clock})),isScripted:true},rules:clone(r.rules),
   players:PLAYERS.map(player=>{const stats=clone(r.stats[player.id]??{});return {id:player.id,name:player.name,teamId:player.team,teamShort:player.team,position:player.pos,role:player.role,salary:player.salary,multiplier:r.rules.positionMultipliers[player.pos]??1,stats,rawPoints:round(fantasyPoints(stats,player.role)),points:round(positionPoints(stats,player.role,player.pos,r.rules)),statLine:statLine(stats)};}),standings:this.standings(r),season:{id:r.seasonId,name:this.season(r).name,standings:clone(this.season(r).standings).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name))}};
  if(r.question)view.question=this.questionView(r.question);if(r.lastQuestion)view.lastQuestion=this.questionView(r.lastQuestion);
  if(p){view.me={participantId:p.id,name:p.name,...(p.lineup?{lineup:clone(p.lineup)}:{})};const pick=r.question?.picks[p.id];if(pick)view.me.currentPick={questionId:r.question!.view.id,optionId:pick.optionId};}
  return view;
 }
}
