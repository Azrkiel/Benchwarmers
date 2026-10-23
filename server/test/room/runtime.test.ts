import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {createRoomRuntime} from '../../src/room/runtime.js';
it('selects explicit SQLite runtime storage and strict HTTPS sessions without enabling later gameplay',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-runtime-'));
 const runtime=await createRoomRuntime({ROOM_STORAGE:'sqlite',ROOM_SQLITE_FILE:path.join(dir,'rooms.sqlite'),ROOM_SESSIONS:'on',ROOM_SESSION_ORIGINS:'https://rooms.example'});
 try {
  const room=runtime.store.create({gameId:'harbor-vs-summit'}),seat=runtime.store.join(room.view.room.code,{name:'Fan'});
  expect(seat.view).not.toHaveProperty('pregame');expect(seat.view.me).not.toHaveProperty('bank');
  expect(runtime.security).toMatchObject({enabled:true,allowLegacyCredentials:false,allowedOrigins:['https://rooms.example']});
  expect(runtime.telemetry.snapshot().accepted).toBeGreaterThan(0);
 } finally {runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('rejects unsupported storage and insecure session configuration',async()=>{
 await expect(createRoomRuntime({ROOM_STORAGE:'guess'})).rejects.toThrow();
 await expect(createRoomRuntime({ROOM_SESSIONS:'on',ROOM_SESSION_ORIGINS:'http://rooms.example'})).rejects.toThrow();
});
