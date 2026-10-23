import { z } from 'zod';
export const PREGAME_ID='pregame-winner-v1';
export const PREGAME_RULE='The replay final score decides the winner. A tie voids the pick. Correct picks earn 10 points without streak, speed or probability multipliers.';
export const pregameSchema=z.object({
  version:z.literal(1),id:z.literal(PREGAME_ID),status:z.enum(['open','locked','resolved','void']),
  cutoff:z.literal('replay_start'),correctPoints:z.literal(10),lockedAt:z.number().finite().nonnegative().optional(),
  picks:z.record(z.string().min(1),z.object({optionId:z.string().min(1),acceptedAt:z.number().finite().nonnegative()}).strict()),
  result:z.object({optionId:z.string().min(1),explanation:z.string().min(1)}).strict().optional(),voidReason:z.string().min(1).optional(),
}).strict();
export type PregameState=z.infer<typeof pregameSchema>;
export function createPregame():PregameState {return {version:1,id:PREGAME_ID,status:'open',cutoff:'replay_start',correctPoints:10,picks:{}};}
