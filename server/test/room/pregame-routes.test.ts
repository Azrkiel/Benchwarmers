import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect,it } from 'vitest';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import { RoomStore } from '../../src/room/store.js';
import type { RoomSnapshot } from '../../src/shared/room.js';

it('serves free pregame picks and honest unavailable reference data through the real app',async()=>{
  const store=new RoomStore({persist:false,enablePregame:true});
  const app=createApp({store:new Store({persist:false}),roomStore:store});
  const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
  const room=store.create({gameId:'harbor-vs-summit'}),code=room.view.room.code,seat=store.join(code,{name:'Fan'});
  const post=(route:string,input:unknown)=>fetch(`${base}/${code}/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  try {
    const reference=await fetch(`${base}/${code}/pregame-reference`);expect(reference.status).toBe(200);
    expect(await reference.json()).toMatchObject({reason:'fictional_game',reference:null,commitmentQuotingEnabled:false});
    const input={participantToken:seat.participantToken,requestId:'http-winner',optionId:'harbor'};
    expect((await post('pregame-picks',{...input,commitPoints:25})).status).toBe(400);
    expect((await post('pregame-picks',{...input,requestId:undefined})).status).toBe(400);
    const response=await post('pregame-picks',input);expect(response.status).toBe(200);
    const body=await response.json() as RoomSnapshot;expect(body.receipt!.requestId).toBe('http-winner');
    await post('host',{hostToken:room.hostToken,action:'start'});
    const late=await post('pregame-picks',{...input,requestId:'too-late'});expect(late.status).toBe(409);expect(await late.json()).toMatchObject({code:'PICKS_LOCKED'});
    expect((await post('pregame-picks',input)).status).toBe(200);
    const receipt=await fetch(`${base}/${code}/receipts/http-winner`,{headers:{authorization:`Bearer ${seat.participantToken}`}});expect(await receipt.json()).toEqual(body.receipt);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
