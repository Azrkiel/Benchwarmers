import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect,it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import type { CommitmentReceipt } from '../../src/shared/points.js';

it('exposes the constrained grammar, private review and atomic creation over HTTP',async()=>{
  let now=1000;
  const store=new RoomStore({persist:false,enableCommitments:true,now:()=>now,probabilities:[{gameId:'harbor-vs-summit',templateId:'next_score_team',optionId:'harbor',estimate:{p:.366,version:'test',source:'demo_projection',label:'Authored test',observedAt:0,validUntil:1000000}}]});
  const app=createApp({store:new Store({persist:false,now:()=>now}),roomStore:store});
  const server=await new Promise<http.Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
  const created=store.create({gameId:'harbor-vs-summit',speed:4}),code=created.view.room.code;
  const seat=store.join(code,{name:'Fan'});
  const post=async(route:string,body:unknown)=>fetch(`${base}/${code}/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    store.host(code,{hostToken:created.hostToken,action:'start'});now+=100000;store.tick();
    const catalogResponse=await fetch(`${base}/${code}/call-catalog`);expect(catalogResponse.status).toBe(200);
    const catalog=await catalogResponse.json() as ReturnType<RoomStore['callCatalog']>;expect(catalog.templates).toHaveLength(2);
    const input={participantToken:seat.participantToken,templateId:'next_score_team',anchorSequence:catalog.window!.anchorSequence,horizonGameElapsedMs:catalog.window!.maximumHorizonGameElapsedMs,optionId:'harbor',commitPoints:25};
    expect((await post('call-quotes',{...input,playerId:'made-up'})).status).toBe(400);
    expect((await post('call-quotes',{...input,templateId:'next_player_layup'})).status).toBe(400);
    expect((await post('call-quotes',{...input,commitPoints:15})).status).toBe(400);
    expect((await post('calls',{...input,requestId:'unreviewed'})).status).toBe(400);
    expect((await post('call-quotes',{...input,participantToken:created.hostToken})).status).toBe(401);
    const response=await post('call-quotes',input);expect(response.status).toBe(200);
    const {quote,target}=await response.json() as ReturnType<RoomStore['quotePlayerCall']>;expect(target.target!.templateId).toBe('next_score_team');
    const request={participantToken:seat.participantToken,quoteId:quote.quoteId,requestId:'http-call'};
    const accepted=await post('calls',request);expect(accepted.status).toBe(200);
    const receipt=await accepted.json() as {commitment:CommitmentReceipt};expect(receipt.commitment.commitPoints).toBe(25);
    expect(await (await post('calls',request)).json()).toEqual(receipt);
    expect(store.view(code).calls).toHaveLength(1);
    const missing=await post('calls',{...request,quoteId:'missing'});expect(missing.status).toBe(409);expect(await missing.json()).toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
