import type { BasketballEvent } from '../basketball/events.js';
import type { BasketballTarget } from '../types.js';

/** Resolve from normalized identity/time/value fields, never generated text or future outcomes. */
export function resolveBasketballTarget(target: BasketballTarget, event: BasketballEvent): { optionId: string } | { voidReason: string } | undefined {
  if (event.sequence <= target.anchorSequence) return;
  if (event.gameElapsedMs <= target.horizonGameElapsedMs && event.kind === 'score') {
    if (target.templateId === 'next_score_team') return { optionId: event.teamId! };
    if (target.templateId === 'next_made_field_goal_value' && event.scoreValue !== 1) return { optionId: event.scoreValue === 2 ? 'two' : 'three' };
    if (target.templateId === 'team_scores_in_window' && event.teamId === target.teamId) return { optionId: 'yes' };
  }
  if (event.gameElapsedMs > target.horizonGameElapsedMs || event.kind === 'final') {
    return target.templateId === 'team_scores_in_window' ? { optionId: 'no' } : { voidReason: 'No eligible scoring event before the target closed.' };
  }
}
