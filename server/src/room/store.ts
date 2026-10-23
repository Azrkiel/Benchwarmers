import { randomBytes, randomUUID } from 'node:crypto';
import { scorePrediction, statLine } from './scoring.js';
import type { RoomLineup, RoomQuestion, RoomStanding, RoomSummary, RoomSnapshot, PickReceipt, QuestionResolution } from './types.js';
import type { Room, Season, Participant, QuestionState } from './domain.js';
import { getRoomSportAdapter } from './sports/index.js';
import { loadSavedRooms, validateSavedRooms, writeSavedRooms } from './persistence.js';

export class RoomError extends Error {
 constructor(readonly status:number,readonly code:string,message:string){super(message);this.name='RoomError';}
}
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
  const saved=this.persist?loadSavedRooms(this.dataFile):undefined;
  if(saved){
   this.rooms=saved.rooms;this.seasons=saved.seasons;
   // Restore the last durable replay position. Offline time never skips questions.
   this.transact(()=>{
    for(const room of this.rooms){if(room.phase!=='live'&&room.phase!=='paused')continue;room.lastTickAt=this.now();if(room.question?.view.status==='open')this.refreshDeadline(room);}
    return ()=>undefined;
   });
  }
 }
 private validSpeed(speed:number):number {if(![1,2,3,4].includes(speed))fail(400,'BAD_SPEED','Speed must be 1, 2, 3, or 4.');return speed;}
 /** Stage private copies, persist before publishing, and render the result after versioning. */
 private transact<T>(work:()=>()=>T):T {
  const previousRooms=this.rooms,previousSeasons=this.seasons;
  this.rooms=clone(previousRooms);this.seasons=clone(previousSeasons);
  let result:()=>T;
  try {
   result=work();
   const changedSeasons=new Set(this.seasons.filter(s=>JSON.stringify(s)!==JSON.stringify(previousSeasons.find(old=>old.id===s.id))).map(s=>s.id));
   let changed=this.rooms.length!==previousRooms.length||changedSeasons.size>0;
   for(const r of this.rooms){const old=previousRooms.find(old=>old.code===r.code);
    if(!old){r.version=1;changed=true;}
    else if(changedSeasons.has(r.seasonId)||JSON.stringify(r)!==JSON.stringify(old)){r.version=old.version+1;changed=true;}
   }
   if(changed){
    const saved=validateSavedRooms({version:2,rooms:this.rooms,seasons:this.seasons});
    if(this.persist){try{writeSavedRooms(this.dataFile,saved);}catch{fail(503,'ROOM_SAVE_FAILED','Could not save the room. No changes were accepted; retry the request.');}}
   }
  } catch(error){this.rooms=previousRooms;this.seasons=previousSeasons;throw error;}
  return result();
 }
 private adapter(r:Room){return getRoomSportAdapter(r.gameId)!;}
 private room(code:string):Room {const r=this.rooms.find(r=>r.code===String(code).trim().toUpperCase());if(!r)return fail(404,'ROOM_NOT_FOUND','Room not found. Check the join code.');return r;}
 private participant(room:Room,token:string):Participant {const p=room.participants.find(p=>token&&p.token===token);if(!p)return fail(401,'BAD_CREDENTIAL','A valid participant credential is required.');return p;}
 private season(room:Room):Season{return this.seasons.find(s=>s.id===room.seasonId)!;}
 private summary(r:Room):RoomSummary{return {code:r.code,name:r.name,seasonId:r.seasonId,phase:r.phase,speed:r.speed,participantCount:r.participants.length,createdAt:r.createdAt};}
 /** Read-only lookups for auxiliary services; neither advances replay nor writes storage. */
 roomSummary(code:string):RoomSummary {return this.summary(this.room(code));}
 isHost(code:string,token:string):boolean {const r=this.room(code);return Boolean(token)&&token===r.hostToken;}
 create(input:{name?:string;seasonId?:string;speed?:number;gameId?:string}={}):{view:RoomSnapshot;hostToken:string}{
  const adapter=getRoomSportAdapter(input.gameId);if(!adapter)return fail(400,'GAME_NOT_SUPPORTED','Choose a supported room game.');
  return this.transact(()=>{
  const speed=this.validSpeed(input.speed??this.defaultSpeed);
  const seasonId=input.seasonId?.trim()||'demo-season';
  if(seasonId.length>80)fail(400,'BAD_SEASON','Season ID must be at most 80 characters.');
  if(!this.seasons.some(s=>s.id===seasonId))this.seasons.push({id:seasonId,name:seasonId==='demo-season'?'Demo season':seasonId,identities:[],standings:[]});
  let code:string;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.some(r=>r.code===code));
  const r:Room={code,name:input.name?.trim().slice(0,60)||adapter.defaultRoomName,seasonId,hostToken:secret(),createdAt:this.now(),gameId:adapter.gameId,rulesVersion:adapter.rulesVersion,version:1,phase:'lobby',speed,rules:clone(adapter.rules),participants:[],beatIndex:-1,elapsedMs:0,durationMs:0,windowElapsedMs:0,lastTickAt:this.now(),stats:{},recorded:false};
  this.rooms.push(r);return ()=>({view:this.snapshot(r),hostToken:r.hostToken});
  });
 }
 list():RoomSummary[]{this.tick();return this.rooms.map(r=>this.summary(r)).reverse();}
 join(code:string,input:{name:string;participantToken?:string}):{view:RoomSnapshot;participantId:string;participantToken:string}{
  this.tick();return this.transact(()=>{const r=this.room(code);const name=String(input.name??'').trim().slice(0,24);if(!name)fail(400,'BAD_NAME','Pick a display name to join.');
  const season=this.season(r);
  let identity:Season['identities'][number]|undefined;
  if(input.participantToken){identity=season.identities.find(i=>i.token===input.participantToken);if(!identity)fail(401,'BAD_CREDENTIAL','That participant credential is not valid for this season.');}
  let p=identity?r.participants.find(p=>p.id===identity!.id):undefined;
  if(!p){
   if(r.phase==='final')fail(409,'ROOM_FINAL','This game has finished. Join a new room.');
   if(r.participants.some(p=>p.name.toLowerCase()===(identity?.name??name).toLowerCase()))fail(409,'NAME_TAKEN','That name is already in this room. Use your saved credential to rejoin or choose another name.');
   if(!identity){identity={id:randomUUID(),name,token:secret()};season.identities.push(identity);}
   p={id:identity.id,name:identity.name,token:identity.token,baseline:clone(r.stats),predictionPoints:0,streak:0};
   if(r.phase!=='lobby')p.lineup=this.buildAutoLineup(r,'balanced');r.participants.push(p);
  }
  const participant=p;return ()=>({view:this.snapshot(r,participant),participantId:participant.id,participantToken:participant.token});
  });
 }
 view(code:string,participantToken?:string):RoomSnapshot {this.tick();const r=this.room(code);return this.snapshot(r,participantToken!==undefined?this.participant(r,participantToken):undefined);}
 private validateLineup(r:Room,captainId:string,flexIds:string[]):RoomLineup {
  const PLAYER_BY_ID=this.adapter(r).playerById;
  if(!Object.hasOwn(PLAYER_BY_ID,captainId))fail(400,'BAD_PLAYER','Choose a valid captain.');
  if(!Array.isArray(flexIds)||flexIds.length!==r.rules.flexSlots)fail(400,'BAD_LINEUP',`Choose exactly ${r.rules.flexSlots} flex players.`);
  if(flexIds.some(id=>!Object.hasOwn(PLAYER_BY_ID,id)))fail(400,'BAD_PLAYER','Choose valid flex players.');
  if(new Set([captainId,...flexIds]).size!==1+flexIds.length)fail(400,'DUPLICATE_PLAYER','Each athlete can appear only once in your lineup.');
  const salaryUsed=Math.round(PLAYER_BY_ID[captainId].salary*r.rules.captainMultiplier)+flexIds.reduce((sum,id)=>sum+PLAYER_BY_ID[id].salary,0);
  if(salaryUsed>r.rules.salaryCap)fail(400,'OVER_CAP',`That lineup costs $${salaryUsed.toLocaleString()}, above the $${r.rules.salaryCap.toLocaleString()} cap. The captain costs 1.5x.`);
  return {captainId,flexIds:[...flexIds],salaryUsed};
 }
 setLineup(code:string,input:{participantToken:string;captainId:string;flexIds:string[]}):RoomSnapshot {
  this.tick();return this.transact(()=>{const r=this.room(code);const p=this.participant(r,input.participantToken);if(r.phase!=='lobby')fail(409,'LINEUPS_LOCKED','Lineups locked at kickoff.');
  p.lineup=this.validateLineup(r,input.captainId,input.flexIds);return ()=>this.snapshot(r,p);
  });
 }
 private buildAutoLineup(r:Room,style:'balanced'|'stars'|'value'):RoomLineup {
  // Salary/role heuristics only; never peek at the immutable future script.
  const chosen=this.adapter(r).autoLineup(style);
  return this.validateLineup(r,chosen[0],chosen.slice(1));
 }
 autoLineup(code:string,input:{participantToken:string;style?:'balanced'|'stars'|'value'}):RoomSnapshot {
  this.tick();return this.transact(()=>{const r=this.room(code);const p=this.participant(r,input.participantToken);if(r.phase!=='lobby')fail(409,'LINEUPS_LOCKED','Lineups locked at kickoff.');
  const style=input.style??'balanced';if(!['balanced','stars','value'].includes(style))fail(400,'BAD_STYLE','Choose balanced, stars, or value.');p.lineup=this.buildAutoLineup(r,style);return ()=>this.snapshot(r,p);
  });
 }
 receipt(code:string,participantToken:string,requestId:string):PickReceipt {
  const r=this.room(code);const p=this.participant(r,participantToken);
  const receipt=r.pickReceipts?.find(receipt=>receipt.participantId===p.id&&receipt.requestId===requestId);
  if(!receipt)return fail(404,'RECEIPT_NOT_FOUND','No accepted pick was found for that request ID.');return clone(receipt);
 }
 pick(code:string,input:{participantToken:string;questionId:string;optionId:string;requestId?:string}):RoomSnapshot {
  this.tick();return this.transact(()=>{const r=this.room(code);const p=this.participant(r,input.participantToken);const q=r.question;
  if(input.requestId!==undefined&&(!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)))fail(400,'BAD_REQUEST','Use a request ID of 1-128 letters, numbers, underscores or hyphens.');
  if(this.adapter(r).sport==='basketball'&&!input.requestId)fail(400,'BAD_REQUEST','Basketball picks require a requestId.');
  const previous=r.pickReceipts?.find(receipt=>receipt.participantId===p.id&&receipt.requestId===input.requestId);
  if(previous){if(previous.questionId!==input.questionId||previous.optionId!==input.optionId)fail(409,'IDEMPOTENCY_CONFLICT','That request ID was already used for another pick.');return ()=>({...this.snapshot(r,p),receipt:clone(previous)});}
  if(r.phase!=='live'||!q||q.view.id!==input.questionId||q.view.status!=='open'||this.now()>=q.view.locksAt)return fail(409,'PICKS_LOCKED','That question is not open.');
  if(q.view.target&&!q.view.target.eligibleParticipantIds.includes(p.id))fail(409,'NOT_ELIGIBLE','Join the next question; this question opened before you joined.');
  if(!q.view.options.some(o=>o.id===input.optionId))fail(400,'BAD_OPTION','Choose one of the displayed prediction options.');
  // Duplicate transmissions retain early-call timing. A changed mind gets the new time.
  if(q.picks[p.id]?.optionId!==input.optionId)q.picks[p.id]={optionId:input.optionId,elapsedFraction:r.elapsedMs/r.durationMs};
  let receipt:PickReceipt|undefined;
  if(input.requestId){r.pickReceipts??=[];receipt={requestId:input.requestId,participantId:p.id,questionId:input.questionId,optionId:input.optionId,acceptedAt:this.now(),acceptanceSequence:(r.pickReceipts.at(-1)?.acceptanceSequence??0)+1};r.pickReceipts.push(receipt);}
  return ()=>({...this.snapshot(r,p),...(receipt?{receipt:clone(receipt)}:{})});
  });
 }
 host(code:string,input:{hostToken:string;action:'start'|'pause'|'resume'|'set_speed';speed?:number}):RoomSnapshot {
  this.tick();return this.transact(()=>{const r=this.room(code);if(!input.hostToken||input.hostToken!==r.hostToken)fail(401,'BAD_HOST_CREDENTIAL','A valid host credential is required.');
  switch(input.action){
   case 'start':if(r.phase!=='lobby')fail(409,'BAD_PHASE','Only a lobby can start.');for(const p of r.participants)p.lineup??=this.buildAutoLineup(r,'balanced');r.phase='live';r.lastTickAt=this.now();this.advanceBeat(r);break;
   case 'pause':if(r.phase!=='live')fail(409,'BAD_PHASE','Only a live game can pause.');r.phase='paused';break;
   case 'resume':if(r.phase!=='paused')fail(409,'BAD_PHASE','Only a paused game can resume.');r.phase='live';r.lastTickAt=this.now();this.refreshDeadline(r);break;
   case 'set_speed':{
    const speed=this.validSpeed(input.speed??NaN);const fraction=r.durationMs>0?r.elapsedMs/r.durationMs:0;r.speed=speed;
    if(r.beatIndex>=0){const adapter=this.adapter(r);const beat=adapter.beats[r.beatIndex];let duration=adapter.duration(beat,speed);
     // Preserve the adapter's active response budget across speed changes.
     if(adapter.isWindow(beat))duration=Math.max(duration,(adapter.minimumResponseMs-r.windowElapsedMs)/Math.max(.000001,1-fraction));
     r.durationMs=duration;r.elapsedMs=fraction*duration;this.refreshDeadline(r);
    }break;
   }
   default:fail(400,'BAD_ACTION','Unknown host action.');
  }
  return ()=>this.snapshot(r);
  });
 }
 private refreshDeadline(r:Room):void {
  const q=r.question?.view;if(q?.status!=='open')return;
  const remaining=Math.max(0,r.durationMs-r.elapsedMs);q.remainingMs=remaining;q.locksAt=this.now()+remaining;q.opensAt=q.locksAt-r.durationMs;
 }
 tick():void {
  const now=this.now();
  if(!this.rooms.some(r=>r.phase==='live'&&now>r.lastTickAt))return;
  this.transact(()=>{
  for(const r of this.rooms){if(r.phase!=='live')continue;
   let remaining=Math.max(0,now-r.lastTickAt);r.lastTickAt=now;if(remaining===0)continue;
   const adapter=this.adapter(r);
   while(r.phase==='live'&&remaining>=0){
    const left=r.durationMs-r.elapsedMs;
    if(remaining<left){r.elapsedMs+=remaining;if(adapter.isWindow(adapter.beats[r.beatIndex]))r.windowElapsedMs+=remaining;break;}
    remaining-=left;if(adapter.isWindow(adapter.beats[r.beatIndex]))r.windowElapsedMs+=left;this.advanceBeat(r);
    // Newly featured question must be visible for a real response window, even after a stalled timer.
    if(adapter.isWindow(adapter.beats[r.beatIndex]))break;
    if(remaining===0)break;
   }
   this.refreshDeadline(r);
  }
  return ()=>undefined;
  });
 }
 private advanceBeat(r:Room):void {
  const adapter=this.adapter(r);r.beatIndex++;const beat=adapter.beats[r.beatIndex];if(!beat)return;
  r.elapsedMs=0;r.durationMs=adapter.duration(beat,r.speed);r.windowElapsedMs=0;
  if(adapter.locksQuestion(beat)&&r.question?.view.status==='open'){r.question.view.status='locked';r.question.view.remainingMs=0;}
  for(const [id,key,n] of beat.deltas){r.stats[id]??={};r.stats[id][key]=(r.stats[id][key]??0)+n;}
  const question=adapter.question(beat,this.now(),r.durationMs);if(question){if(question.target)question.target.eligibleParticipantIds=r.participants.map(p=>p.id);r.question={view:question,picks:{}};}
  const result=r.question?adapter.result(r.question.view,beat):undefined;if(result)this.resolveQuestion(r,result);
  if(beat.type==='final'){r.phase='final';this.recordSeason(r);}
 }
 private resolveQuestion(r:Room,result:QuestionResolution):void {
  const q=r.question;if(!q)return;
  if('voidReason' in result){q.view.status='void';q.view.remainingMs=0;q.view.voidReason=result.voidReason;r.lastQuestion=clone(q);return;}
  const {optionId}=result;
  const picks=Object.values(q.picks);
  for(const p of r.participants){if(q.view.target&&!q.view.target.eligibleParticipantIds.includes(p.id))continue;const pick=q.picks[p.id];if(!pick){p.streak=0;continue;}const option=q.view.options.find(o=>o.id===pick.optionId)!;
   const score=scorePrediction({optionId:pick.optionId,result:optionId,base:option.basePoints,probability:option.probability,optionCount:q.view.options.length,streak:p.streak,elapsedFraction:pick.elapsedFraction,same:picks.filter(v=>v.optionId===pick.optionId).length,pickers:picks.length,factorCap:r.rules.pickFactorCap});
   p.predictionPoints+=score.points;p.lastPickScore=score;p.streak=score.correct?p.streak+1:0;
  }
  q.view.status='resolved';q.view.remainingMs=0;q.view.result=result;r.lastQuestion=clone(q);
 }
 private standings(r:Room):RoomStanding[]{
  const rows=r.participants.map(p=>{
   const ids=p.lineup?[p.lineup.captainId,...p.lineup.flexIds]:[];
   const adapter=this.adapter(r);
   const roster=ids.map((id,index)=>{const player=adapter.playerById[id];const delta=Object.fromEntries(Object.entries(r.stats[id]??{}).map(([key,n])=>[key,n-(p.baseline[id]?.[key]??0)]));
    const rawPoints=adapter.rawPoints(delta,player.role),positionMultiplier=r.rules.positionMultipliers[player.pos]??1,captainMultiplier=index===0?r.rules.captainMultiplier:1;
    return {playerId:id,captain:index===0,rawPoints:round(rawPoints),positionMultiplier,captainMultiplier,points:round(rawPoints*positionMultiplier*captainMultiplier)};});
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
 private snapshot(r:Room,p?:Participant):RoomSnapshot {
  const adapter=this.adapter(r);
  const view:RoomSnapshot={version:r.version,serverNow:this.now(),rulesVersion:r.rulesVersion,room:this.summary(r),game:adapter.projectGame(r.beatIndex,r.phase),rules:clone(r.rules),
   players:adapter.players.map(player=>{const stats=clone(r.stats[player.id]??{});const rawPoints=adapter.rawPoints(stats,player.role);return {id:player.id,name:player.name,teamId:player.team,teamShort:player.team,position:player.pos,role:player.role,salary:player.salary,...(player.projectedPoints!==undefined?{projectedPoints:player.projectedPoints,projectionSource:player.projectionSource,salaryModelVersion:player.salaryModelVersion}:{}),multiplier:r.rules.positionMultipliers[player.pos]??1,stats,rawPoints:round(rawPoints),points:round(rawPoints*(r.rules.positionMultipliers[player.pos]??1)),statLine:statLine(stats)};}),standings:this.standings(r),season:{id:r.seasonId,name:this.season(r).name,standings:clone(this.season(r).standings).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name))}};
  if(r.question)view.question=this.questionView(r.question);if(r.lastQuestion)view.lastQuestion=this.questionView(r.lastQuestion);
  if(p){view.me={participantId:p.id,name:p.name,...(p.lineup?{lineup:clone(p.lineup)}:{})};const pick=r.question?.picks[p.id];if(pick)view.me.currentPick={questionId:r.question!.view.id,optionId:pick.optionId};}
  return view;
 }
}
