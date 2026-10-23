import type { CommitmentQuote } from './points.js';
import type { RoomQuestion } from '../room/types.js';

export type CallTemplateId = 'next_score_team' | 'next_made_field_goal_value';
export type PlayerCallInput = {participantToken:string;templateId:CallTemplateId;anchorSequence:number;horizonGameElapsedMs:number;optionId:string;commitPoints:number};
export type CallCatalog = {
  enabled:boolean;
  templates:{templateId:CallTemplateId;requiredCapabilities:readonly string[];resolver:string;fields:readonly string[];options:'teams'|'two_three';optionIds:string[];includesFreeThrows:boolean}[];
  window:{questionId:string;anchorSequence:number;minimumHorizonGameElapsedMs:number;maximumHorizonGameElapsedMs:number;locksAt:number}|null;
};
export type PlayerCallQuote = {quote:CommitmentQuote;target:RoomQuestion};
