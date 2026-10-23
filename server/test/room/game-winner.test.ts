import { expect,it } from 'vitest';
import { resolveGameWinner } from '../../src/room/predictions/game-winner.js';

const result={status:'final' as const,home:{id:'home',name:'Home',score:101},away:{id:'away',name:'Away',score:99}};
it.each(['scheduled','postponed','in_progress','provisional_final'] as const)('does not settle a %s game',status=>{
  expect(resolveGameWinner({...result,status})).toBeUndefined();
});
it('voids an abandoned game and a tied final',()=>{
  expect(resolveGameWinner({...result,status:'abandoned'})).toHaveProperty('voidReason');
  expect(resolveGameWinner({...result,away:{...result.away,score:101}})).toHaveProperty('voidReason');
});
it('uses the authoritative score, including a later revised final input',()=>{
  expect(resolveGameWinner(result)).toMatchObject({optionId:'home'});
  expect(resolveGameWinner({...result,away:{...result.away,score:102}})).toMatchObject({optionId:'away'});
});
it('rejects invalid score data instead of awarding a winner',()=>{
  expect(()=>resolveGameWinner({...result,home:{...result.home,score:NaN}})).toThrow();
  expect(()=>resolveGameWinner({...result,home:{...result.home,score:-1}})).toThrow();
});
