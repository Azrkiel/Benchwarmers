import express from 'express';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { createRoomRouter } from '../../src/room/routes.js';
import type { RoomSnapshot } from '../../src/room/types.js';

it('accepts 32 concurrent room participants and picks, with one acceptance for each retried request', async () => {
  let now=1000;
  const store=new RoomStore({persist:false,now:()=>now});
  const app=express();app.use('/api/rooms',createRoomRouter(store));
  const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
  const post=async<T>(suffix:string,body:unknown):Promise<T>=>{
    const response=await fetch(base+suffix,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    expect(response.status).toBeGreaterThanOrEqual(200);expect(response.status).toBeLessThan(300);
    return await response.json() as T;
  };
  try {
    const created=await post<ReturnType<RoomStore['create']>>('',{gameId:'harbor-vs-summit',speed:4});
    const code=created.view.room.code;
    const people=await Promise.all(Array.from({length:32},(_,index)=>post<ReturnType<RoomStore['join']>>(`/${code}/join`,{name:`Fan ${index+1}`})));
    expect(new Set(people.map(p=>p.participantId)).size).toBe(32);
    const lineups=await Promise.all(people.map(person=>post<RoomSnapshot>(`/${code}/auto-lineup`,{participantToken:person.participantToken})));
    expect(lineups.every(view=>view.me!.lineup!.salaryUsed<=50000)).toBe(true);
    expect(lineups.every(view=>view.me!.lineup!.captainId===lineups[0].me!.lineup!.captainId)).toBe(true);
    await post(`/${code}/host`,{hostToken:created.hostToken,action:'start'});now+=100000;
    const question=store.view(code).question!;
    const submissions=people.map((person,index)=>({participantToken:person.participantToken,requestId:`fan-${index}`,questionId:question.id,optionId:index%2?'summit':'harbor'}));
    const accepted=await Promise.all(submissions.map(input=>post<RoomSnapshot>(`/${code}/picks`,input)));
    expect(accepted.map(view=>view.receipt!.acceptanceSequence).sort((a,b)=>a-b)).toEqual(Array.from({length:32},(_,index)=>index+1));
    expect(store.view(code).question!.pickCounts).toEqual({harbor:16,summit:16});
    const version=store.view(code).version;
    const retries=await Promise.all(Array.from({length:16},()=>post<RoomSnapshot>(`/${code}/picks`,submissions[0])));
    expect(retries.every(view=>JSON.stringify(view.receipt)===JSON.stringify(accepted[0].receipt))).toBe(true);
    expect(store.view(code).version).toBe(version);
    expect(store.view(code).question!.pickCounts).toEqual({harbor:16,summit:16});
    const publicState=JSON.stringify(store.view(code));
    for(const credential of [created.hostToken,...people.map(p=>p.participantToken)]) expect(publicState).not.toContain(credential);
    let final=store.view(code);
    for(let i=0;i<100&&final.room.phase!=='final';i++){now+=100000;final=store.view(code);}
    expect(final.room.phase).toBe('final');
    expect(final.season.standings).toHaveLength(32);
    expect(final.season.standings.every(row=>row.nightsPlayed===1)).toBe(true);
    const season=final.season.standings;now+=100000;expect(store.view(code).season.standings).toEqual(season);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
