import express from 'express';
import type http from 'node:http';
import type {AddressInfo} from 'node:net';
import {expect,it} from 'vitest';
import {RoomStore} from '../../src/room/store.js';
import {createRoomRouter} from '../../src/room/routes.js';

it('uses a cookie seat for actual mutations and rejects conflicting body credentials and host impersonation',async()=>{
 const store=new RoomStore({persist:false,enablePregame:true});const room=store.create({gameId:'harbor-vs-summit'}),code=room.view.room.code;
 const seat=store.join(code,{name:'Maya'}),other=store.join(code,{name:'Leo'});
 const app=express();app.use('/api/rooms',createRoomRouter(store,{security:{enabled:true,allowedOrigins:['https://rooms.example']}}));
 const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms/${code}`;
 const post=(path:string,body:unknown,headers:Record<string,string>={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://rooms.example',...headers},body:JSON.stringify(body)});
 try {
  const session=await post('/session',{role:'participant',credential:seat.participantToken});expect(session.status).toBe(201);
  const cookie=session.headers.get('set-cookie')!.split(';')[0];const {csrfToken}=await session.json() as {csrfToken:string};const headers={cookie,'x-room-csrf':csrfToken};
  const accepted=await post('/pregame-picks',{optionId:'harbor',requestId:'cookie-winner'},headers);expect(accepted.status).toBe(200);
  expect(store.view(code,seat.participantToken).me!.pregamePick!.optionId).toBe('harbor');
  expect((await post('/pregame-picks',{participantToken:other.participantToken,optionId:'summit',requestId:'wrong-actor'},headers)).status).toBe(403);
  expect((await post('/host',{action:'start'},headers)).status).toBe(403);
  expect((await post('/pregame-picks',{optionId:'harbor',requestId:'no-csrf'},{cookie})).status).toBe(403);
  const privateView=await fetch(base,{headers:{cookie}});expect(privateView.status).toBe(200);expect(await privateView.json()).toMatchObject({me:{participantId:seat.participantId}});
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it('enforces authoritative room/seat/discovery limits while allowing returning seats',()=>{
 const store=new RoomStore({persist:false,limits:{maxRooms:2,maxParticipantsPerRoom:1,maxDiscoveryRooms:1}});
 const first=store.create(),seat=store.join(first.view.room.code,{name:'Fan'});
 expect(()=>store.join(first.view.room.code,{name:'Other'})).toThrow(expect.objectContaining({code:'ROOM_CAPACITY'}));
 expect(store.join(first.view.room.code,{name:'Fan',participantToken:seat.participantToken}).participantId).toBe(seat.participantId);
 store.create();expect(store.list()).toHaveLength(1);
 expect(()=>store.create()).toThrow(expect.objectContaining({code:'ROOM_CAPACITY'}));
});
