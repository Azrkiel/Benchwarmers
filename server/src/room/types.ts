/** Browser-safe room snapshots. Credentials exist only in create/join results. */
import type { CallBank, CommitmentReceipt } from '../shared/points.js';
import type { PregameView } from '../shared/pregame.js';
export type SourceMode = 'scripted' | 'live';
export type SourceStatus = 'healthy' | 'delayed' | 'stale' | 'unavailable';
export type CourtPoint = { x: number; y: number };
export type BasketballContext = { sport: 'basketball'; possessionTeamId: string | null; possessionPlayerId: string | null; ball: { point: CourtPoint; observedAt: number } | null; tracking: 'score_only' | 'team_possession' | 'player_possession' | 'ball' };
export type FootballContext = { sport: 'football'; possessionTeamId: string | null; ballOn: number; down: number | null; toGo: number | null };
export type GameContext = BasketballContext | FootballContext;
export type RoomGameMetadata = { gameId: string; sport: GameContext['sport']; sourceMode: SourceMode; sourceStatus: SourceStatus; context: GameContext };
export type RoomSnapshotMetadata = { version: number; serverNow: number; rulesVersion: string };
export type RoomPhase = 'lobby'|'live'|'paused'|'final';
export type RoomSummary = {code:string;name:string;seasonId:string;phase:RoomPhase;speed:number;participantCount:number;createdAt:number};
export type RoomRules = {salaryCap:number;flexSlots:number;captainMultiplier:number;positionMultipliers:Record<string,number>;pickFactorCap:number};
export type RoomLineup = {captainId:string;flexIds:string[];salaryUsed:number};
export type RoomPlayer = {id:string;name:string;teamId:string;teamShort:string;position:string;role:string;salary:number;multiplier:number;stats:Record<string,number>;rawPoints:number;points:number;statLine:string;projectedPoints?:number;projectionSource?:'demo_projection';salaryModelVersion?:string};
export type RoomPickScore = {points:number;base:number;factor:number;bonuses:string[];correct:boolean};
export type BasketballTarget = {templateId:'next_score_team'|'next_made_field_goal_value'|'team_scores_in_window';anchorSequence:number;horizonGameElapsedMs:number;teamId?:string;eligibleParticipantIds:string[]};
export type PickReceipt = {requestId:string;participantId:string;questionId:string;optionId:string;acceptedAt:number;acceptanceSequence:number};
export type QuestionResolution = {optionId:string;explanation:string}|{voidReason:string};
export type RoomStanding = {participantId:string;name:string;rank:number;total:number;fantasyPoints:number;predictionPoints:number;settledRiskNet?:number;streak:number;roster:{playerId:string;captain:boolean;points:number;rawPoints?:number;positionMultiplier?:number;captainMultiplier?:number}[];lastPickScore?:RoomPickScore};
export type RoomQuestion = {id:string;kind:string;text:string;opensAt:number;locksAt:number;remainingMs:number;options:{id:string;label:string;basePoints:number;probability?:number}[];pickCounts:Record<string,number>;status:'open'|'locked'|'resolved'|'void';result?:{optionId:string;explanation:string};voidReason?:string;target?:BasketballTarget};
export type RoomPlayerCall = RoomQuestion & {creatorId:string;createdAt:number};
export type RoomSeasonStanding = {participantId:string;name:string;points:number;fantasyPoints:number;predictionPoints:number;nightsPlayed:number;nightsWon:number};
type RoomTeam = {id:string;short:string;name:string;color:string;score:number};
// Optional additive fields allow older consumer fixtures during the migration.
// All RoomStore responses use RoomSnapshot and always supply this metadata.
export type RoomView = Partial<RoomSnapshotMetadata> & {
 room:RoomSummary;
 game:Partial<RoomGameMetadata> & {title:string;home:RoomTeam;away:RoomTeam;quarter:number;clock:string;situation:string;ballOn:number;fieldX:number;possession:string|null;driveNumber:number;driveCount:number;recentPlays:{id:string;text:string;kind:string;quarter:number;clock:string}[];isScripted:true};
 rules:RoomRules;players:RoomPlayer[];standings:RoomStanding[];question?:RoomQuestion;lastQuestion?:RoomQuestion;calls?:RoomPlayerCall[];pregame?:PregameView;
 me?:{participantId:string;name:string;lineup?:RoomLineup;currentPick?:{questionId:string;optionId:string};bank?:CallBank;commitments?:CommitmentReceipt[];pregamePick?:{optionId:string;acceptedAt:number}};
 season:{id:string;name:string;standings:RoomSeasonStanding[]};
};
export type RoomSnapshot = RoomView & RoomSnapshotMetadata & { game: RoomView['game'] & RoomGameMetadata; receipt?: PickReceipt };
