import type {MarketSnapshot,ReadOnlyMarketAdapter} from './types.js';
type Options={fetch?:typeof fetch;now?:()=>number;timeoutMs?:number;maxResponseBytes?:number};
const text=(value:unknown):string=>{if(typeof value!=='string'||!value.trim()||value.length>16_384)throw Error('invalid market text');return value;};
const number=(value:unknown):number=>{if(typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value))throw Error('invalid price');const result=typeof value==='string'?Number(value):value;if(typeof result!=='number'||!Number.isFinite(result)||result<0||result>1)throw Error('invalid price');return result;};
/** Public Gamma reads only. No search-based mapping, wallet, credentials or trading endpoints. */
export class PolymarketAdapter implements ReadOnlyMarketAdapter {
 private fetcher:typeof fetch;private now:()=>number;private timeoutMs:number;private maxBytes:number;
 constructor(options:Options={}){
  this.fetcher=options.fetch??fetch;this.now=options.now??Date.now;this.timeoutMs=options.timeoutMs??3000;this.maxBytes=options.maxResponseBytes??128*1024;
  if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>30_000||!Number.isSafeInteger(this.maxBytes)||this.maxBytes<1||this.maxBytes>1024*1024)throw Error('invalid market HTTP bounds');
 }
 async fetchMarket(marketId:string):Promise<MarketSnapshot>{
  if(!/^\d{1,30}$/.test(marketId))throw Error('invalid market id');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('market request timeout'));},this.timeoutMs);});
  try{return await Promise.race([this.load(marketId,controller.signal),timeout]);}finally{clearTimeout(timer);controller.abort();}
 }
 private async load(marketId:string,signal:AbortSignal):Promise<MarketSnapshot>{
  const response=await this.fetcher(`https://gamma-api.polymarket.com/markets/${marketId}`,{method:'GET',redirect:'error',signal,headers:{accept:'application/json'}});
  if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('application/json')||!response.body)throw Error('market source unavailable');
  const reader=response.body.getReader();let length=0;const chunks:Uint8Array[]=[];
  try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>this.maxBytes)throw Error('market response too large');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const payload:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('invalid market response');
  const raw=payload as Record<string,unknown>;
  if(raw.id!==marketId||typeof raw.active!=='boolean'||typeof raw.closed!=='boolean'||typeof raw.archived!=='boolean')throw Error('invalid market identity/status');
  const labels:unknown=JSON.parse(text(raw.outcomes)),prices:unknown=JSON.parse(text(raw.outcomePrices));
  if(!Array.isArray(labels)||!Array.isArray(prices)||labels.length!==2||prices.length!==2)throw Error('missing market outcome');
  const scheduledStart=text(raw.gameStartTime);if(!Number.isFinite(Date.parse(scheduledStart)))throw Error('invalid game date');
  const slug=text(raw.slug);if(!/^[a-z0-9-]{1,200}$/.test(slug))throw Error('invalid market slug');
  return {provider:'polymarket',marketId,slug,question:text(raw.question),description:text(raw.description),scheduledStart,observedAt:this.now(),active:raw.active,closed:raw.closed,archived:raw.archived,outcomes:labels.map((label,i)=>({label:text(label),price:number(prices[i])})),bestBid:number(raw.bestBid),bestAsk:number(raw.bestAsk)};
 }
}
