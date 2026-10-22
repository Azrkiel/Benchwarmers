import { CONTRARIAN, SPEED_BUCKETS, STREAK_MULTIPLIERS, ODDS_MULTIPLIER, PICK_FACTOR_CAP } from '../shared/types.js';
import { fantasyPoints } from './replay/scoring.js';
import type { RoomRules, RoomPickScore } from './types.js';

/** Demo tuning, not measured position equivalence. Salaries and raw stat rules remain WPF's. */
export const DEFAULT_RULES:RoomRules = {salaryCap:50000,flexSlots:4,captainMultiplier:1.5,pickFactorCap:PICK_FACTOR_CAP,
 positionMultipliers:{QB:1.1,RB:1,FB:1,WR:.85,TE:1,K:1.15,'K/P':1.4,OL:2.5,LT:2.5,RT:2.5,DL:1.2,LB:.85,CB:1,FS:1,SS:1,S:1,P:1.3,LS:1.6}};
/** nflverse (nflfastR), 2015-2025, CC-BY 4.0; tools/odds/README.md.
 * Pooled observed result counts (67,555 total observed drives), conditioned on
 * four supported outcomes (60,597). Turnover combines Turnover 6,895,
 * Turnover on downs 3,259 and Opp touchdown 832, matching this game's
 * possession-loss semantics (including defensive touchdowns).
 * Missed FG, end of half and safety excluded. Not a contextual live forecast.
 */
const COUNTS = {TD:14731,FG:9962,PUNT:24918,TURNOVER:6895+3259+832};
const CONDITIONAL_N = Object.values(COUNTS).reduce((a,b)=>a+b,0);
export const FOUR_WAY_PROBABILITIES:Record<string,number> = Object.fromEntries(Object.entries(COUNTS).map(([k,n])=>[k,n/CONDITIONAL_N]));
export function positionPoints(stats:Record<string,number>,role:string,position:string,rules:RoomRules):number {
 return fantasyPoints(stats,role)*(rules.positionMultipliers[position]??1);
}
export function scorePrediction(a:{optionId:string;result:string;base:number;probability?:number;optionCount:number;streak:number;elapsedFraction:number;same:number;pickers:number;factorCap?:number}):RoomPickScore {
 const correct=a.optionId===a.result; const bonuses:string[]=[];
 const streak=STREAK_MULTIPLIERS[Math.min(a.streak,STREAK_MULTIPLIERS.length-1)];if(streak>1)bonuses.push('streak');
 const bucket=SPEED_BUCKETS.find(b=>Math.max(0,a.elapsedFraction)<=b.maxF);const speed=bucket?.factor??1;if(bucket)bonuses.push(bucket.bonus);
 let minority=1;
 if(a.same===1&&a.pickers>=CONTRARIAN.loneMinPickers){minority=CONTRARIAN.lone;bonuses.push('lone_call');}
 else if(a.pickers>=CONTRARIAN.minorityMinPickers&&a.same/a.pickers<.5){minority=CONTRARIAN.minority;bonuses.push('against_the_room');}
 // Generalize the existing binary target .5 to fair share 1/N for multi-choice.
 const odds=a.probability&&a.probability>0?Math.min(ODDS_MULTIPLIER.max,Math.max(ODDS_MULTIPLIER.min,(1/a.optionCount)/a.probability)):1;
 if(odds>1)bonuses.push('bold_call');
 const factor=Math.min(a.factorCap??PICK_FACTOR_CAP,streak*speed*minority*odds);
 return {correct,base:a.base,factor,points:correct?Math.round(a.base*factor*2)/2:0,bonuses:correct?bonuses:[]};
}
const LABELS:Record<string,string>={passYds:'pass yd',passTD:'pass TD',intThrown:'INT thrown',rushYds:'rush yd',rushTD:'rush TD',rec:'catches',recYds:'rec yd',recTD:'rec TD',fumLost:'fumbles lost',xp:'XP',fg:'FG',fg40:'FG 40+',fg50:'FG 50+',tackles:'tackles',sacks:'sacks',defInt:'INT',passDefended:'passes defended',fumRec:'fumble recoveries',defTD:'def TD',teamRushYds:'team rush yd (proxy)',teamRushTD:'team rush TD (proxy)',sacksAllowed:'sacks allowed',penalties:'penalties',cleanSnaps:'clean snaps (scripted)',puntYds:'punt yd',puntIn20:'punts inside 20'};
export function statLine(stats:Record<string,number>):string {
 return Object.entries(stats).filter(([,n])=>n!==0).map(([key,n])=>`${n} ${LABELS[key]??key}`).join(' / ')||'No stats yet';
}
