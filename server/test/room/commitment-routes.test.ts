import express from 'express';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createRoomRouter } from '../../src/room/routes.js';
import { RoomStore } from '../../src/room/store.js';
import type { CommitmentQuote, CommitmentReceipt } from '../../src/shared/points.js';

it('serves B-compatible quotes, acceptance, private receipts and actor-bound confirmation',async()=>{
  let now=1000;
  const store=new RoomStore({persist:false,now:()=>now,enableCommitments:true,probabilities:[{gameId:'harbor-vs-summit',templateId:'next_score_team',optionId:'harbor',estimate:{p:.366,version:'demo-v1',label:'Authored demo',source:'demo_projection',observedAt:0,validUntil:1000000}}]});
  const app=express();app.use('/api/rooms',createRoomRouter(store));
  const server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`;
  const post=async(suffix:string,body:unknown)=>fetch(base+suffix,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    const room=store.create({gameId:'harbor-vs-summit',speed:4});const code=room.view.room.code;const prefix=`/${code}`;
    const seat=store.join(code,{name:'Fan'}),other=store.join(code,{name:'Other'});
    store.host(code,{hostToken:room.hostToken,action:'start'});now+=100000;const question=store.view(code).question!;
    const input={participantToken:seat.participantToken,questionId:question.id,optionId:'harbor',commitPoints:25};
    expect((await post(`${prefix}/commitment-quotes`,{...input,commitPoints:15})).status).toBe(400);
    const response=await post(`${prefix}/commitment-quotes`,input);expect(response.status).toBe(200);
    const {quote}=await response.json() as {quote:CommitmentQuote};expect(quote.totalReturnPoints).toBe(75);
    const acceptance={participantToken:seat.participantToken,quoteId:quote.quoteId,requestId:'http-commit'};
    const accepted=await post(`${prefix}/commitments`,acceptance);expect(accepted.status).toBe(200);
    const body=await accepted.json() as {commitment:CommitmentReceipt};expect(body.commitment.state).toBe('pending');
    const receiptUrl=base+`${prefix}/commitment-receipts/http-commit`;
    expect((await fetch(receiptUrl)).status).toBe(401);
    expect((await fetch(receiptUrl,{headers:{authorization:`Bearer ${other.participantToken}`}})).status).toBe(404);
    expect((await fetch(receiptUrl,{headers:{authorization:`Bearer ${room.hostToken}`}})).status).toBe(401);
    const recovered=await fetch(receiptUrl,{headers:{authorization:`Bearer ${seat.participantToken}`}});expect(await recovered.json()).toEqual(body);
    expect(await (await post(`${prefix}/commitments`,acceptance)).json()).toEqual(body);
    const denied=await post(`${prefix}/commitments`,{...acceptance,quoteId:'different'});expect(denied.status).toBe(409);expect(await denied.json()).toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    const pending=await post(`${prefix}/commitment-confirmations/quote`,{...input,participantToken:other.participantToken});expect(pending.status).toBe(200);
    const confirmed=await post(`${prefix}/commitment-confirmations/confirm`,{participantToken:other.participantToken,requestId:'voice-http'});expect(confirmed.status).toBe(200);
    const duplicate=await post(`${prefix}/commitment-confirmations/confirm`,{participantToken:other.participantToken,requestId:'voice-http'});expect(await duplicate.json()).toEqual(await confirmed.json());
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
