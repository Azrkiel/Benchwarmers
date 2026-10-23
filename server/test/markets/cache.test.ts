import {describe,it,expect,vi} from 'vitest';
import {MarketReferenceCache} from '../../src/markets/cache.js';
import {game,mapping,snapshot} from './fixtures.js';
describe('bounded read-only market reference cache',()=>{
 it('keeps source, observation time and both independent prices; reads never fetch',async()=>{
  const load=vi.fn(async()=>snapshot());const cache=new MarketReferenceCache({now:()=>1000});
  await cache.refresh(game,mapping,{fetchMarket:load});
  expect(cache.read(game.gameId)).toMatchObject({status:'available',commitmentQuotingEnabled:false,reference:{marketId:'123',observedAt:1000,sourceUrl:'https://polymarket.com/event/synthetic-bos-nyk',priceMethod:'gamma_outcome_prices',outcomes:[{teamId:'bos',price:0.6},{teamId:'nyk',price:0.39}]}});
  cache.read(game.gameId);expect(load).toHaveBeenCalledTimes(1);
  expect(cache.read(game.gameId)).toMatchObject({reference:{source:'Polymarket',method:'Gamma outcome prices',stale:false,prices:{bos:0.6,nyk:0.39}}});
 });
 it('marks stale prices and hides missing, fictional and wide-spread data',async()=>{
  let now=1000;const cache=new MarketReferenceCache({now:()=>now,maxAgeMs:100});
  expect(cache.read('missing')).toMatchObject({status:'unavailable',reason:'unmapped_game'});
  await cache.refresh(game,mapping,{fetchMarket:async()=>snapshot()});now=1101;
  expect(cache.read(game.gameId)).toMatchObject({status:'stale',commitmentQuotingEnabled:false});
  expect(cache.read(game.gameId)).toMatchObject({reference:{stale:true}});
  expect(cache.read(game.gameId,true)).toMatchObject({status:'unavailable',reason:'fictional_game',reference:null});
  now=1000;await cache.refresh(game,mapping,{fetchMarket:async()=>({...snapshot(),bestBid:0.2,bestAsk:0.8})});
  expect(cache.read(game.gameId)).toMatchObject({status:'unavailable',reason:'wide_spread',reference:null});
 });
 it('bounds entries, rejects invalid and future prices, clears old data after refresh failure',async()=>{
  const cache=new MarketReferenceCache({now:()=>1000,maxEntries:1});const adapter={fetchMarket:async()=>snapshot()};
  await cache.refresh(game,mapping,adapter);
  await cache.refresh({...game,gameId:'second'},{...mapping,gameId:'second'},adapter);
  expect(cache.read(game.gameId).status).toBe('unavailable');
  await cache.refresh(game,mapping,{fetchMarket:async()=>({...snapshot(),observedAt:1001})});
  expect(cache.read(game.gameId)).toMatchObject({reason:'invalid_source'});
  await cache.refresh(game,mapping,adapter);
  await cache.refresh(game,mapping,{fetchMarket:async()=>{throw Error('timeout');}});
  expect(cache.read(game.gameId)).toMatchObject({reason:'source_unavailable',reference:null});
 });
 it('an older refresh cannot overwrite a later failure or a later valid observation',async()=>{
  const cache=new MarketReferenceCache({now:()=>1000});let finish!:(value:ReturnType<typeof snapshot>)=>void;
  const old=cache.refresh(game,mapping,{fetchMarket:()=>new Promise(resolve=>{finish=resolve;})});
  await cache.refresh(game,mapping,{fetchMarket:async()=>{throw Error('source failed');}});
  finish(snapshot());await old;
  expect(cache.read(game.gameId)).toMatchObject({status:'unavailable',reason:'source_unavailable'});
 });
 it('maps canonical labels with whitespace consistently and does not expose mutable cached objects',async()=>{
  const cache=new MarketReferenceCache({now:()=>1000});const s=snapshot();s.outcomes[0].label='Boston  Celtics';
  const view=await cache.refresh(game,mapping,{fetchMarket:async()=>s});
  expect(view).toMatchObject({reference:{outcomes:[{teamId:'bos'},{teamId:'nyk'}]}});
  if(view.status!=='unavailable')view.reference.outcomes[0].price=0.01;
  expect(cache.read(game.gameId)).toMatchObject({reference:{outcomes:[{price:0.6},{price:0.39}]}});
 });
 it('fictional reads and refreshes never request a provider',async()=>{
  const fetchMarket=vi.fn(async()=>snapshot()),cache=new MarketReferenceCache();
  await cache.refresh({...game,fictional:true},mapping,{fetchMarket});
  expect(fetchMarket).not.toHaveBeenCalled();expect(cache.read(game.gameId)).toMatchObject({reason:'fictional_game'});
 });
});
