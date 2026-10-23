import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { BoundedRateLimiter, RoomSessions, SecurityTelemetry, createRoomSecurity } from '../../src/room/security/index.js';

describe('private room sessions',()=>{
  it('isolates rooms and roles, expires and revokes opaque credentials',()=>{
    let time=100;
    const sessions=new RoomSessions({now:()=>time,ttlMs:100,maxSessions:2});
    const host=sessions.create({roomCode:'ABC',role:'host',actorId:'host',credential:'host-secret'});
    const fan=sessions.create({roomCode:'ABC',role:'participant',actorId:'fan',credential:'fan-secret'});
    expect(host.id).not.toBe(fan.id);
    expect(sessions.resolve(host.id,'DEF')).toBeUndefined();
    expect(sessions.resolve(host.id,'ABC')?.role).toBe('host');
    expect(sessions.resolve(fan.id,'ABC')?.actorId).toBe('fan');
    expect(()=>sessions.create({roomCode:'ABC',role:'spectator',actorId:'guest'})).toThrow('capacity');
    sessions.revoke(host.id);expect(sessions.resolve(host.id,'ABC')).toBeUndefined();
    time=200;expect(sessions.resolve(fan.id,'ABC')).toBeUndefined();expect(sessions.size).toBe(0);
  });
  it('enforces independent actor/room limits with bounded keys and expiry',()=>{
    let now=0;
    const limiter=new BoundedRateLimiter({now:()=>now,windowMs:100,actorRequests:2,roomRequests:3,maxKeys:4});
    expect(limiter.allow('A','one')).toBe(true);expect(limiter.allow('A','one')).toBe(true);
    expect(limiter.allow('A','one')).toBe(false);
    expect(limiter.allow('A','two')).toBe(true);expect(limiter.allow('A','three')).toBe(false);
    expect(limiter.allow('B','one')).toBe(false);expect(limiter.size).toBeLessThanOrEqual(4);
    now=100;expect(limiter.allow('B','one')).toBe(true);
  });
  it('keeps aggregate telemetry finite and never accepts payload labels',()=>{
    const telemetry=new SecurityTelemetry();
    telemetry.record('accepted');telemetry.record('rejected');telemetry.record('save_error');
    expect(telemetry.snapshot()).toMatchObject({accepted:1,rejected:1,save_error:1});
    expect(JSON.stringify(telemetry.snapshot())).not.toContain('secret');
  });
});

async function fixture(enabled=true){
  let now=0;
  let revoked=false;
  const security=createRoomSecurity({enabled,allowedOrigins:['https://rooms.example'],now:()=>now,sessionTtlMs:100,
    validateCredential:({roomCode,role,credential})=>!revoked&&roomCode==='ABC'&&credential===`${role}-secret`?{actorId:role==='participant'?'seat-one':role}:undefined});
  const app=express();app.use('/api/rooms',security.router);
  app.all('/api/rooms/:code/action',security.authorize('participant'),(_req,res)=>res.json({actor:res.locals.roomActor?.actorId??'legacy'}));
  app.get('/api/rooms/:code/host-only',security.authorize('host'),(_req,res)=>res.json({ok:true}));
  const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
  const request=(path:string,body?:unknown,headers:Record<string,string>={})=>fetch(`${base}/${path}`,{method:body===undefined?'GET':'POST',headers:{origin:'https://rooms.example','content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {security,request,base,revoke:()=>{revoked=true;},setTime:(time:number)=>{now=time;},close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

it('exchanges privately; enforces origin, CSRF, scope, expiry, and logout',async()=>{
  const f=await fixture();
  try{
    expect((await f.request('ABC/session',{role:'participant',credential:'participant-secret'},{origin:'https://evil.example'})).status).toBe(403);
    expect((await f.request('ABC/session?credential=participant-secret',{role:'participant',credential:'participant-secret'})).status).toBe(400);
    expect((await f.request('ABC/session',{role:'participant',credential:'host-secret'})).status).toBe(401);
    const exchange=await f.request('ABC/session',{role:'participant',credential:'participant-secret'});
    expect(exchange.status).toBe(201);
    const setCookie=exchange.headers.get('set-cookie')!;
    expect(setCookie).toContain('__Host-bw-room=');expect(setCookie).toContain('HttpOnly');expect(setCookie).toContain('Secure');expect(setCookie).toContain('SameSite=Strict');
    const cookie=setCookie.split(';')[0];const body=await exchange.json() as {csrfToken:string};
    expect(JSON.stringify(body)).not.toContain('participant-secret');
    expect((await f.request('ABC/action',{}, {cookie})).status).toBe(403);
    expect((await f.request('ABC/action',{}, {cookie,'x-room-csrf':body.csrfToken,origin:'https://evil.example'})).status).toBe(403);
    expect((await f.request('ABC/action',{}, {cookie,'x-room-csrf':body.csrfToken})).status).toBe(200);
    expect((await f.request('ABC/host-only',undefined,{cookie})).status).toBe(403);
    expect((await f.request('DEF/action',{}, {cookie,'x-room-csrf':body.csrfToken})).status).toBe(401);
    const logout=await fetch(`${f.base}/ABC/session`,{method:'DELETE',headers:{origin:'https://rooms.example',cookie,'x-room-csrf':body.csrfToken}});
    expect(logout.status).toBe(204);expect((await f.request('ABC/action',{}, {cookie,'x-room-csrf':body.csrfToken})).status).toBe(401);
    const second=await f.request('ABC/session',{role:'participant',credential:'participant-secret'});
    f.setTime(100);expect((await f.request('ABC/action',{}, {cookie:second.headers.get('set-cookie')!.split(';')[0]})).status).toBe(401);
  }finally{await f.close();}
});

it('leaves bearer routes compatible and disables exchange by default',async()=>{
  const f=await fixture(false);
  try{
    expect((await f.request('ABC/session',{role:'participant',credential:'participant-secret'})).status).toBe(404);
    const legacy=await f.request('ABC/action',{}, {authorization:'Bearer existing-secret'});
    expect(await legacy.json()).toEqual({actor:'legacy'});
  }finally{await f.close();}
});

it('rejects duplicated cookies and authority revoked after session exchange',async()=>{
  const f=await fixture();
  try{
    const response=await f.request('ABC/session',{role:'participant',credential:'participant-secret'});
    const cookie=response.headers.get('set-cookie')!.split(';')[0];
    expect((await f.request('ABC/action',undefined,{cookie:`${cookie}; ${cookie}`})).status).toBe(401);
    f.revoke();expect((await f.request('ABC/action',undefined,{cookie})).status).toBe(401);
    expect(f.security.sessions.size).toBe(0);
  }finally{await f.close();}
});

it('bounds legacy bearer traffic without exposing credentials in telemetry',async()=>{
  const security=createRoomSecurity({enabled:true,allowedOrigins:['https://rooms.example'],limits:{actorRequests:1,roomRequests:2},validateCredential:()=>undefined});
  const app=express();app.use(express.json());app.post('/api/rooms/:code/action',security.requestLimits,(_req,res)=>res.json({ok:true}));
  const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms/ABC/action`;
  const post=(credential:string)=>fetch(url,{method:'POST',headers:{authorization:`Bearer ${credential}`}});
  try{
    expect((await post('one-secret')).status).toBe(200);expect((await post('one-secret')).status).toBe(429);
    expect((await post('two-secret')).status).toBe(200);expect((await post('three-secret')).status).toBe(429);
    expect(JSON.stringify(security.telemetry.snapshot())).not.toContain('secret');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
