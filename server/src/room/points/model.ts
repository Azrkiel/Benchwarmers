import { z } from 'zod';
import { playerCallDraftSchema } from '../calls/model.js';

export class PointsError extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message);this.name='PointsError';}
}
export const unitsSchema=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id=z.string().min(1);
const time=z.number().finite().nonnegative();
const quoteShape={quoteId:id,targetId:id,questionId:id,optionId:id,optionLabel:id,commitPoints:z.number().positive(),totalReturnPoints:z.number().nonnegative(),multiplier:z.number().min(.7).max(5),probabilityLabel:id,firstCaller:z.boolean(),expiresAt:time};
export const storedQuoteSchema=z.object({...quoteShape,participantId:id,commitUnits:unitsSchema,totalReturnUnits:unitsSchema,multiplierHundredths:unitsSchema,targetVersion:id,probabilityVersion:id,probabilitySource:id,probabilityP:z.number().positive().max(1),pricingVersion:id,eligibleCount:unitsSchema,sameAccepted:unitsSchema,playerCall:playerCallDraftSchema.optional()}).strict();
export const storedCallSchema=z.object({
  callId:id,requestId:id,quoteId:id,questionId:id,optionId:id,optionLabel:id,
  commitPoints:z.number().positive(),totalReturnPoints:z.number().nonnegative(),
  acceptedAt:time,acceptedSequence:unitsSchema.positive(),state:z.enum(['pending','won','lost','void']),
  participantId:id,targetId:id,commitUnits:unitsSchema.positive(),totalReturnUnits:unitsSchema,
  multiplierHundredths:unitsSchema,probabilityVersion:id,probabilityP:z.number().positive().max(1),
  probabilityLabel:id,probabilitySource:id,firstCaller:z.boolean(),sameAccepted:unitsSchema,
  eligibleCount:unitsSchema,outcomeRevision:unitsSchema,settledReturnUnits:unitsSchema,outcomeKey:z.string(),
}).strict();
export const entrySchema=z.object({id,participantId:id,callId:id.optional(),questionId:id.optional(),resultVersion:id.optional(),units:unitsSchema,direction:z.enum(['credit','debit']),reason:z.enum(['grant','free_pick_reward','free_pick_correction','commit_hold','commit_return','commit_refund','correction']),createdAt:time}).strict();
export const pointsStateSchema=z.object({version:z.literal(1),entries:z.array(entrySchema),quotes:z.array(storedQuoteSchema),calls:z.array(storedCallSchema),pending:z.array(z.object({participantId:id,quoteId:id,expiresAt:time}).strict())}).strict();
export type PointsState=z.infer<typeof pointsStateSchema>;
export type StoredQuote=z.infer<typeof storedQuoteSchema>;
export type StoredCall=z.infer<typeof storedCallSchema>;
export type PointsEntry=z.infer<typeof entrySchema>;
