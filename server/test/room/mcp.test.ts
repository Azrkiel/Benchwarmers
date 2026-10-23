import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/index.js';
import { Store } from '../../src/game/store.js';
import { RoomStore } from '../../src/room/store.js';

let server: http.Server;let client:Client;
afterEach(async()=>{await client?.close();server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
it('exposes room tools through the existing MCP endpoint and plays a real room flow',async()=>{
  const app=createApp({store:new Store({persist:false}),roomStore:new RoomStore({persist:false})});
  server=await new Promise<http.Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client=new Client({name:'room-demo-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{authorization:`Bearer ${process.env.MCP_TOKEN??'dev-token-change-me'}`}}}));
  const names=(await client.listTools()).tools.map(t=>t.name);
  expect(names).toContain('room_create');expect(names).toContain('room_set_lineup');expect(names).toContain('room_predict');expect(names).toContain('setup_watch_party');
  const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});expect(r.isError).not.toBe(true);return r.structuredContent as any;};
  const c=await call('room_create',{name:'MCP football'});const code=c.view.room.code;
  const p=await call('room_join',{code,name:'Sam'});
  const v=await call('room_auto_lineup',{code,participantToken:p.participantToken,style:'balanced'});
  expect(v.me.lineup.flexIds).toHaveLength(4);
  const s=await call('room_host',{code,hostToken:c.hostToken,action:'start'});
  await call('room_predict',{code,participantToken:p.participantToken,questionId:s.question.id,optionId:'TD'});
  const publicState=await call('room_status',{code});expect(publicState.room.participantCount).toBe(1);expect(JSON.stringify(publicState)).not.toContain(p.participantToken);
  const denied=await client.callTool({name:'room_host',arguments:{code,hostToken:'wrong',action:'pause'}});expect(denied.isError).toBe(true);
  // Spoken requests go through the same typed commands and say whether anything was accepted.
  const rank=await client.callTool({name:'room_ask',arguments:{code,participantToken:p.participantToken,text:"what's my rank?"}});
  expect((rank.content as {text:string}[])[0]!.text).toMatch(/^Sam, you are number 1 of 1/);
  const hostless=await call('room_ask',{code,text:'pause the replay'});
  expect(hostless).toMatchObject({accepted:false,reply:'Only the host can pause the replay.'});
  expect(JSON.stringify(hostless)).not.toContain(p.participantToken);
});
