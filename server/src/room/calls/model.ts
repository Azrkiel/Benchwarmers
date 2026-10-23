import { z } from 'zod';

const id=z.string().min(1);
const amount=z.number().finite().nonnegative();
export const playerCallDraftSchema=z.object({
  key:id,windowQuestionId:id,
  view:z.object({
    id,kind:z.enum(['next_score_team','next_made_field_goal_value']),text:id,
    opensAt:amount,locksAt:amount,remainingMs:amount,
    options:z.array(z.object({id,label:id,basePoints:z.literal(0)}).strict()).length(2),
    pickCounts:z.record(id,amount.int()),status:z.enum(['open','locked','resolved','void']),
    result:z.object({optionId:id,explanation:z.string()}).optional(),voidReason:id.optional(),
    target:z.object({templateId:z.enum(['next_score_team','next_made_field_goal_value']),anchorSequence:amount.int().safe(),horizonGameElapsedMs:amount.int().safe(),eligibleParticipantIds:z.array(id)}).strict(),
  }).strict(),
}).strict();
export const playerCallSchema=playerCallDraftSchema.extend({creatorId:id,createdAt:amount}).strict();
export type PlayerCallDraft=z.infer<typeof playerCallDraftSchema>;
export type PlayerCall=z.infer<typeof playerCallSchema>;
