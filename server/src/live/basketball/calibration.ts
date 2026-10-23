import {BASKETBALL_STATS,FANTASY_SCORING} from '../../shared/types.js';
const POSITIONS=['PG','SG','SF','PF','C'] as const;
export type Position=typeof POSITIONS[number];
export type HistoricalSample={playerId:string;gameId:string;position:Position|string|null;occurredAt:number;availableAt:number;minutes:number;stats:Record<string,number>};
export type CalibrationInput={source:{kind:'synthetic'|'authorized_history';datasetId:string;authorized:boolean};training:{startsAt:number;endsAt:number};heldout:{startsAt:number;endsAt:number};minimumSamples:number;records:HistoricalSample[];currentRulesVersion:string;currentCatalogVersion:string;candidateRulesVersion:string;candidateCatalogVersion:string;pregamePlayers:{id:string;position:Position;rawProjection:number}[]};
type PositionResult={trainingCount:number;heldoutCount:number;trainingMinutes:number;heldoutMinutes:number;trainingMean:number|null;heldoutRawMean:number|null;heldoutWeightedMean:number|null;relativeHeldoutError:number|null};
const neutral=():Record<Position,number>=>({PG:1,SG:1,SF:1,PF:1,C:1});
const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
/** Offline proposal only. Caller-declared authorization is not independent verification of rights. */
export function evaluateCalibration(input:CalibrationInput){
 const reasons:string[]=[];
 const validWindows=[input.training.startsAt,input.training.endsAt,input.heldout.startsAt,input.heldout.endsAt].every(n=>Number.isFinite(n)&&n>=0)&&input.training.startsAt<input.training.endsAt&&input.training.endsAt<=input.heldout.startsAt&&input.heldout.startsAt<input.heldout.endsAt;
 if(!validWindows)reasons.push('Training and held-out windows must be chronological and disjoint');
 const thresholdValid=Number.isSafeInteger(input.minimumSamples)&&input.minimumSamples>=1;
 if(!thresholdValid)reasons.push('Invalid minimum samples per position and split');
 const groups=Object.fromEntries(POSITIONS.map(position=>[position,{training:[] as HistoricalSample[],heldout:[] as HistoricalSample[]}])) as Record<Position,{training:HistoricalSample[];heldout:HistoricalSample[]}>;
 let excludedRecords=0;const seen=new Set<string>();let duplicateRecords=0;
 for(const row of input.records){
  const valid=typeof row.playerId==='string'&&row.playerId.length>0&&typeof row.gameId==='string'&&row.gameId.length>0&&POSITIONS.includes(row.position as Position)&&Number.isFinite(row.minutes)&&row.minutes>0&&row.minutes<=120&&Number.isFinite(row.occurredAt)&&row.occurredAt>=0&&Number.isFinite(row.availableAt)&&row.availableAt>=row.occurredAt&&row.stats!==null&&typeof row.stats==='object'&&Object.keys(row.stats).length>0&&Object.entries(row.stats).every(([stat,n])=>(BASKETBALL_STATS as readonly string[]).includes(stat)&&Number.isSafeInteger(n)&&n>=0);
  if(!valid||!validWindows){excludedRecords++;continue;}
  const split=row.occurredAt>=input.training.startsAt&&row.occurredAt<input.training.endsAt?'training':row.occurredAt>=input.heldout.startsAt&&row.occurredAt<input.heldout.endsAt?'heldout':null;
  if(split===null||row.availableAt>input[split].endsAt){excludedRecords++;continue;}
  const key=JSON.stringify([row.playerId,row.gameId]);if(seen.has(key)){excludedRecords++;duplicateRecords++;continue;}seen.add(key);
  groups[row.position as Position][split].push(row);
 }
 if(duplicateRecords)reasons.push('Duplicate player-game observations require dataset repair');
 const raw=(row:HistoricalSample)=>BASKETBALL_STATS.reduce((total,stat)=>total+(row.stats[stat]??0)*FANTASY_SCORING[stat],0);
 const allTraining=POSITIONS.flatMap(position=>groups[position].training.map(raw));const allHeldout=POSITIONS.flatMap(position=>groups[position].heldout.map(raw));
 const trainingTarget=mean(allTraining),heldoutTarget=mean(allHeldout);
 const proposedWeights=neutral();const positions={} as Record<Position,PositionResult>;
 for(const position of POSITIONS){
  const {training,heldout}=groups[position];const trainingMean=mean(training.map(raw));const heldoutRawMean=mean(heldout.map(raw));
  if(trainingMean!==null&&trainingMean>0&&trainingTarget!==null&&trainingTarget>0)proposedWeights[position]=Math.max(0.8,Math.min(1.25,trainingTarget/trainingMean));
  else reasons.push(`Insufficient positive training production for ${position}`);
  const heldoutWeightedMean=heldoutRawMean===null?null:heldoutRawMean*proposedWeights[position];
  const relativeHeldoutError=heldoutWeightedMean!==null&&heldoutTarget!==null&&heldoutTarget>0?Math.abs(heldoutWeightedMean-heldoutTarget)/heldoutTarget:null;
  positions[position]={trainingCount:training.length,heldoutCount:heldout.length,trainingMinutes:training.reduce((n,row)=>n+row.minutes,0),heldoutMinutes:heldout.reduce((n,row)=>n+row.minutes,0),trainingMean,heldoutRawMean,heldoutWeightedMean,relativeHeldoutError};
  if(!thresholdValid||training.length<input.minimumSamples||heldout.length<input.minimumSamples)reasons.push(`Insufficient samples for ${position}`);
  if(relativeHeldoutError===null||relativeHeldoutError>0.1+1e-12)reasons.push(`Held-out positional difference exceeds 10% for ${position}`);
 }
 // Reprice candidate projections with the existing demo's declared salary policy.
 const proposedPlayers=input.pregamePlayers.map(player=>({...player,weightedProjection:player.rawProjection*proposedWeights[player.position],salary:Math.round(Math.max(3500,Math.min(11500,player.rawProjection*proposedWeights[player.position]*350))/500)*500}));
 const validPlayers=new Set(proposedPlayers.map(p=>p.id)).size===proposedPlayers.length&&proposedPlayers.every(p=>p.id.length>0&&POSITIONS.includes(p.position)&&Number.isFinite(p.rawProjection)&&p.rawProjection>=0&&Number.isFinite(p.salary));
 const affordableDistinctCaptainLineups=validPlayers?proposedPlayers.filter(captain=>{const flex=proposedPlayers.filter(p=>p.id!==captain.id).sort((a,b)=>a.salary-b.salary).slice(0,4);return flex.length===4&&captain.salary*1.5+flex.reduce((n,p)=>n+p.salary,0)<=50000;}).length:0;
 if(affordableDistinctCaptainLineups<3)reasons.push('Fewer than three affordable distinct captain lineups');
 const validationPassed=reasons.length===0;
 const versioned=!!input.candidateCatalogVersion.trim()&&!!input.candidateRulesVersion.trim()&&!!input.currentCatalogVersion.trim()&&!!input.currentRulesVersion.trim()&&input.candidateCatalogVersion!==input.currentCatalogVersion&&input.candidateRulesVersion!==input.currentRulesVersion;
 const adoptionEligible=validationPassed&&versioned&&input.source.kind==='authorized_history'&&input.source.authorized===true&&!!input.source.datasetId.trim();
 const adoptionBlockers=[...(!versioned?['New nonempty catalog and rules versions required']:[]),...(input.source.kind!=='authorized_history'?['Synthetic evaluation cannot authorize adoption']:[]),...(!input.source.authorized||!input.source.datasetId.trim()?['Authorized declared historical dataset required']:[])];
 return {adoptionBlockers,source:{...input.source},training:{...input.training},heldout:{...input.heldout},minimumSamples:input.minimumSamples,minutesTreatment:'observed_game_totals_no_imputation' as const,maximumMinutes:120,excludedRecords,duplicateRecords,trainingTarget,heldoutTarget,positions,proposedWeights,weights:adoptionEligible?{...proposedWeights}:neutral(),proposedPlayers,affordableDistinctCaptainLineups,validationPassed,adoptionEligible,reasons,candidateRulesVersion:input.candidateRulesVersion,candidateCatalogVersion:input.candidateCatalogVersion,limitations:['Observational per-game production; role and minutes differences are not controlled','Synthetic fixtures do not establish real-world positional equivalence','Adoption requires separately reviewed authorization and a new room catalog/rules version']};
}
