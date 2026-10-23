import {describe,it,expect} from 'vitest';
import {validateMarketMapping} from '../../src/markets/mapping.js';
import {game,mapping,snapshot} from './fixtures.js';
describe('explicit market identity',()=>{
 it('accepts the reviewed game, question, full team labels and settlement rules',()=>expect(validateMarketMapping(game,mapping,snapshot())).toBe(true));
 it.each(['wrong date','series','spread','missing side','ambiguous name','rules changed','wrong league','fictional','regulation only'])('rejects %s',kind=>{
  const g=structuredClone(game),m=structuredClone(mapping),s=snapshot();
  if(kind==='wrong date')s.scheduledStart='2026-11-02T23:00:00Z';
  if(kind==='series')m.question=s.question='NBA: Boston Celtics vs New York Knicks series winner on 2026-11-01?';
  if(kind==='spread')m.question=s.question='NBA: Boston Celtics vs New York Knicks spread winner on 2026-11-01?';
  if(kind==='missing side')s.outcomes.pop();
  if(kind==='ambiguous name')m.homeOutcome=s.outcomes[0].label='Boston';
  if(kind==='rules changed')s.description+=' Rules changed.';
  if(kind==='wrong league')m.league='NCAA';
  if(kind==='fictional')g.fictional=true;
  if(kind==='regulation only')m.settlement.includesOvertime=false;
  expect(validateMarketMapping(g,m,s)).toBe(false);
 });
});
