import {normalizeMarketLabel,validateMarketMapping} from './mapping.js';
import type {MarketGameIdentity,MarketReferenceView,MarketUnavailableReason,ReadOnlyMarketAdapter,VerifiedMarketMapping} from './types.js';
const unavailable=(reason:MarketUnavailableReason):MarketReferenceView=>({status:'unavailable',reason,label:reason==='fictional_game'?'No external market reference for this fictional matchup.':'Market reference unavailable.',reference:null,commitmentQuotingEnabled:false});
const price=(value:number)=>Number.isFinite(value)&&value>=0&&value<=1;
/** Refresh is an explicit background operation; read is synchronous and never performs I/O. */
export class MarketReferenceCache {
 private entries=new Map<string,MarketReferenceView>();
 private refreshes=new Map<string,symbol>();
 private now:()=>number;private maxAgeMs:number;private maxEntries:number;private maxSpread:number;
 constructor(options:{now?:()=>number;maxAgeMs?:number;maxEntries?:number;maxSpread?:number}={}){
  this.now=options.now??Date.now;this.maxAgeMs=options.maxAgeMs??60_000;this.maxEntries=options.maxEntries??100;this.maxSpread=options.maxSpread??0.1;
  if(!Number.isFinite(this.maxAgeMs)||this.maxAgeMs<=0||!Number.isSafeInteger(this.maxEntries)||this.maxEntries<1||!price(this.maxSpread))throw Error('invalid market cache bounds');
 }
 read(gameId:string,fictional=false):MarketReferenceView{
  if(fictional)return unavailable('fictional_game');
  const entry=this.entries.get(gameId);if(!entry)return unavailable('unmapped_game');
  if(entry.status==='unavailable')return structuredClone(entry);
  const age=this.now()-entry.reference.observedAt;
  if(!Number.isFinite(age)||age<0)return unavailable('invalid_source');
  return {...structuredClone(entry),status:age>this.maxAgeMs?'stale':'available',label:age>this.maxAgeMs?'Market reference (stale)':'Market reference',reference:{...structuredClone(entry.reference),freshnessMs:age,stale:age>this.maxAgeMs}};
 }
 async refresh(game:MarketGameIdentity,mapping:VerifiedMarketMapping,adapter:ReadOnlyMarketAdapter):Promise<MarketReferenceView>{
  const refresh=Symbol();this.refreshes.set(game.gameId,refresh);
  let view:MarketReferenceView;
  if(game.fictional)view=unavailable('fictional_game');
  else try{
   const market=await adapter.fetchMarket(mapping.marketId);
   if(!validateMarketMapping(game,mapping,market))view=unavailable('mapping_mismatch');
   else if(!market.active||market.closed||market.archived)view=unavailable('market_closed');
   else if(!price(market.bestBid)||!price(market.bestAsk)||market.bestBid>market.bestAsk||!market.outcomes.every(o=>price(o.price))||!Number.isFinite(market.observedAt)||market.observedAt>this.now())view=unavailable('invalid_source');
   else if(market.bestAsk-market.bestBid>this.maxSpread)view=unavailable('wide_spread');
   else view={status:'available',label:'Market reference',commitmentQuotingEnabled:false,reference:{source:'Polymarket',method:'Gamma outcome prices',stale:false,prices:Object.fromEntries(market.outcomes.map(o=>[normalizeMarketLabel(o.label)===normalizeMarketLabel(mapping.homeOutcome)?game.home.id:game.away.id,o.price])),provider:'polymarket',marketId:market.marketId,sourceUrl:`https://polymarket.com/event/${encodeURIComponent(market.slug)}`,observedAt:market.observedAt,freshnessMs:0,priceMethod:'gamma_outcome_prices',bestBid:market.bestBid,bestAsk:market.bestAsk,outcomes:market.outcomes.map(o=>({teamId:normalizeMarketLabel(o.label)===normalizeMarketLabel(mapping.homeOutcome)?game.home.id:game.away.id,...o}))}};
  }catch{view=unavailable('source_unavailable');}
  if(this.refreshes.get(game.gameId)!==refresh)return this.read(game.gameId,game.fictional);
  this.refreshes.delete(game.gameId);
  this.entries.delete(game.gameId);this.entries.set(game.gameId,view);
  while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value!);
  return this.read(game.gameId,game.fictional);
 }
}
