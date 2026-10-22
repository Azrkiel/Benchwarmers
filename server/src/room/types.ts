/** Browser-safe room snapshots. Credentials exist only in create/join results. */
export type RoomPhase = 'lobby'|'live'|'paused'|'final';
export type RoomSummary = {code:string;name:string;seasonId:string;phase:RoomPhase;speed:number;participantCount:number;createdAt:number};
export type RoomRules = {salaryCap:number;flexSlots:number;captainMultiplier:number;positionMultipliers:Record<string,number>;pickFactorCap:number};
export type RoomLineup = {captainId:string;flexIds:string[];salaryUsed:number};
export type RoomPlayer = {id:string;name:string;teamId:string;teamShort:string;position:string;role:string;salary:number;multiplier:number;stats:Record<string,number>;rawPoints:number;points:number;statLine:string};
export type RoomPickScore = {points:number;base:number;factor:number;bonuses:string[];correct:boolean};
export type RoomStanding = {participantId:string;name:string;rank:number;total:number;fantasyPoints:number;predictionPoints:number;streak:number;roster:{playerId:string;captain:boolean;points:number}[];lastPickScore?:RoomPickScore};
export type RoomQuestion = {id:string;kind:string;text:string;opensAt:number;locksAt:number;remainingMs:number;options:{id:string;label:string;basePoints:number;probability?:number}[];pickCounts:Record<string,number>;status:'open'|'locked'|'resolved';result?:{optionId:string;explanation:string}};
export type RoomSeasonStanding = {participantId:string;name:string;points:number;fantasyPoints:number;predictionPoints:number;nightsPlayed:number;nightsWon:number};
type RoomTeam = {id:string;short:string;name:string;color:string;score:number};
export type RoomView = {
 room:RoomSummary;
 game:{title:string;home:RoomTeam;away:RoomTeam;quarter:number;clock:string;situation:string;ballOn:number;fieldX:number;possession:string|null;driveNumber:number;driveCount:number;recentPlays:{id:string;text:string;kind:string;quarter:number;clock:string}[];isScripted:true};
 rules:RoomRules;players:RoomPlayer[];standings:RoomStanding[];question?:RoomQuestion;lastQuestion?:RoomQuestion;
 me?:{participantId:string;name:string;lineup?:RoomLineup;currentPick?:{questionId:string;optionId:string}};
 season:{id:string;name:string;standings:RoomSeasonStanding[]};
};
