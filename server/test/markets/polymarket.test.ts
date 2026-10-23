import {describe,it,expect,vi} from 'vitest';
import {PolymarketAdapter} from '../../src/markets/polymarket.js';
import {gamma} from './fixtures.js';
describe('read-only Polymarket Gamma adapter',()=>{
 it('reads only fixed-origin market id with redirects disabled and parses independent prices',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(gamma()),{headers:{'content-type':'application/json'}}));
  const adapter=new PolymarketAdapter({fetch:fetcher as typeof fetch,now:()=>1234});
  expect(await adapter.fetchMarket('123')).toMatchObject({marketId:'123',observedAt:1234,outcomes:[{label:'Boston Celtics',price:0.6},{label:'New York Knicks',price:0.39}]});
  expect(fetcher).toHaveBeenCalledWith('https://gamma-api.polymarket.com/markets/123',expect.objectContaining({method:'GET',redirect:'error'}));
  await expect(adapter.fetchMarket('../secrets')).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each(['redirect','http','oversize','invalid JSON','missing price','invalid price','wrong id','missing body'])('fails closed on %s',async kind=>{
  let body=JSON.stringify(gamma());let status=200;let headers:Record<string,string>={'content-type':'application/json'};
  if(kind==='redirect')status=302;if(kind==='http')status=503;if(kind==='oversize')body='x'.repeat(1025);
  if(kind==='invalid JSON')body='{';if(kind==='missing price')body=JSON.stringify({...gamma(),outcomePrices:'["0.6"]'});
  if(kind==='invalid price')body=JSON.stringify({...gamma(),outcomePrices:'["", "0.4"]'});
  if(kind==='wrong id')body=JSON.stringify({...gamma(),id:'456'});
  const adapter=new PolymarketAdapter({maxResponseBytes:1024,fetch:(async()=>new Response(kind==='missing body'?null:body,{status,headers})) as typeof fetch});
  await expect(adapter.fetchMarket('123')).rejects.toThrow();
 });
 it('times out even when an injected transport ignores abort',async()=>{
  const adapter=new PolymarketAdapter({timeoutMs:10,fetch:(()=>new Promise(()=>{})) as typeof fetch});
  await expect(adapter.fetchMarket('123')).rejects.toThrow('timeout');
 });
});
