import { z } from 'zod';
import type { QuestionResolution } from '../types.js';
const team=z.object({id:z.string().min(1),name:z.string().min(1),score:z.number().int().nonnegative().safe()});
const resultSchema=z.object({status:z.enum(['scheduled','postponed','in_progress','provisional_final','final','abandoned']),home:team,away:team});
export type GameWinnerInput=z.infer<typeof resultSchema>;

/** The sports result decides the winner; market resolution is never an input. */
export function resolveGameWinner(input:GameWinnerInput):QuestionResolution|undefined {
  const result=resultSchema.parse(input);
  if(result.home.id===result.away.id)throw new Error('Winner target requires two distinct teams.');
  if(result.status==='abandoned')return {voidReason:'The game was abandoned; winner picks are void.'};
  if(result.status!=='final')return;
  if(result.home.score===result.away.score)return {voidReason:'The final score is tied; winner picks are void.'};
  const winner=result.home.score>result.away.score?result.home:result.away;
  return {optionId:winner.id,explanation:`Final score: ${result.home.score}-${result.away.score}. ${winner.name} wins.`};
}
