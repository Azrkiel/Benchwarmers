import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createRoomRouter } from '../../src/room/routes.js';
import { RoomStore } from '../../src/room/store.js';
import type { RoomView } from '../../src/room/types.js';

let server: http.Server;
let base: string;
let rooms: RoomStore;
beforeEach(async () => {
  rooms = new RoomStore({ persist: false, speed: 4 });
  const app = express();
  app.use('/api/rooms', createRoomRouter(rooms));
  server = await new Promise<http.Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
});
afterEach(async () => { server?.closeAllConnections(); if(server) await new Promise<void>(resolve => server.close(() => resolve())); });
async function post(path: string, body: unknown) {
  return fetch(base + path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
}
async function create() { const res = await post('', {name:'Friday football',seasonId:'friends'}); expect(res.status).toBe(201); return res.json() as Promise<ReturnType<RoomStore['create']>>; }

describe('football room REST', () => {
  it('lets thirty real clients share the same athletes and sends a private personal view', async () => {
    const created = await create(); const code = created.view.room.code;
    const people = await Promise.all(Array.from({length:30}, (_,i) => post(`/${code}/join`,{name:`Fan ${i+1}`}).then(r=>r.json() as Promise<ReturnType<RoomStore['join']>>)));
    expect(new Set(people.map(p=>p.participantId)).size).toBe(30);
    for (const person of people.slice(0,2)) {
      const res = await post(`/${code}/lineup`, {participantToken:person.participantToken,captainId:'will-power',flexIds:['max-yardage','robin-banks','ben-dover','phil-mccracken']});
      expect(res.status).toBe(200);
    }
    const publicState = await (await fetch(`${base}/${code}`)).json() as RoomView;
    expect(publicState.room.participantCount).toBe(30);
    expect(publicState.me).toBeUndefined();
    expect(publicState.standings.filter((p:any)=>p.roster.some((r:any)=>r.playerId==='will-power'))).toHaveLength(2);
    const text=JSON.stringify(publicState);
    for(const token of [created.hostToken,...people.map(p=>p.participantToken)]) expect(text).not.toContain(token);
    expect(text).not.toContain('correctOptionId');
    const own = await (await fetch(`${base}/${code}`,{headers:{authorization:`Bearer ${people[0].participantToken}`}})).json() as RoomView;
    expect(own.me!.participantId).toBe(people[0].participantId);
  });
  it('enforces host and participant credentials, lineup limits, and lock state', async () => {
    const c=await create();const code=c.view.room.code;
    const p=await (await post(`/${code}/join`,{name:'Sam'})).json() as ReturnType<RoomStore['join']>;
    expect((await post(`/${code}/host`,{hostToken:'wrong',action:'start'})).status).toBe(401);
    expect((await post(`/${code}/auto-lineup`,{participantToken:'wrong'})).status).toBe(401);
    expect((await post(`/${code}/lineup`,{participantToken:p.participantToken,captainId:'will-power',flexIds:['al-beback','max-yardage','hank-off','robin-banks']})).status).toBe(400);
    const start=await post(`/${code}/host`,{hostToken:c.hostToken,action:'start'});
    expect(start.status).toBe(200);
    const state=await start.json() as RoomView;expect(state.question!.status).toBe('open');
    expect((await post(`/${code}/picks`,{participantToken:p.participantToken,questionId:state.question!.id,optionId:state.question!.options[0].id})).status).toBe(200);
    expect((await post(`/${code}/auto-lineup`,{participantToken:p.participantToken})).status).toBe(409);
  });
  it('returns readable validation, missing-room, and malformed-JSON errors', async () => {
    expect((await post('',{speed:99})).status).toBe(400);
    expect((await post('/NOPE/join',{name:'Sam'})).status).toBe(404);
    const c=await create();const path=`/${c.view.room.code}/join`;
    for(const body of [{name:4},{name:''},{name:'A'.repeat(100)}]) expect((await post(path,body)).status).toBe(400);
    const bad=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:'{broken'});
    expect(bad.status).toBe(400);expect(bad.headers.get('content-type')).toContain('json');
  });
  it('routes typed room commands through authoritative lineup and pick validation', async () => {
    const c=await create();const code=c.view.room.code;
    const p=await (await post(`/${code}/join`,{name:'Maya'})).json() as ReturnType<RoomStore['join']>;
    const a=await post(`/${code}/assistant`,{participantToken:p.participantToken,text:'pick sleepers for me'});
    expect(a.status).toBe(200);const body=await a.json() as {reply:string;view:RoomView};
    expect(body.reply).toMatch(/lineup/i);expect(body.view.me!.lineup!.flexIds).toHaveLength(4);
    const b=await post(`/${code}/assistant`,{hostToken:c.hostToken,text:'kick off'});
    expect(b.status).toBe(200);expect(((await b.json()) as {view:RoomView}).view.room.phase).toBe('live');
    const d=await post(`/${code}/assistant`,{participantToken:p.participantToken,text:'lock in touchdown'});
    expect(d.status).toBe(200);expect(((await d.json()) as {view:RoomView}).view.me!.currentPick!.optionId).toBe('TD');
  });
});
