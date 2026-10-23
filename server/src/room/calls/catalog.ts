import { createHash } from 'node:crypto';
import type { BasketballTarget } from '../types.js';

export type { CallTemplateId, PlayerCallInput } from '../../shared/calls.js';
export const callTemplates = [
  { templateId:'next_score_team', requiredCapabilities:['scoring_events'], resolver:'resolveBasketballTarget', fields:['anchorSequence','horizonGameElapsedMs'], options:'teams', includesFreeThrows:true },
  { templateId:'next_made_field_goal_value', requiredCapabilities:['field_goal_value'], resolver:'resolveBasketballTarget', fields:['anchorSequence','horizonGameElapsedMs'], options:'two_three', includesFreeThrows:false },
] as const;

/** Actor, answer and eligibility do not define a new paid opportunity. */
export function canonicalTargetKey(gameId:string,target:BasketballTarget):string {
  return JSON.stringify([gameId,target.templateId,target.anchorSequence,target.teamId??null,target.horizonGameElapsedMs]);
}
export function canonicalTargetId(key:string):string {
  return `call-${createHash('sha256').update(key).digest('hex').slice(0,32)}`;
}
