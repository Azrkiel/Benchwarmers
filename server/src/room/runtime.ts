import {RoomStore} from './store.js';
import {SecurityTelemetry} from './security/index.js';
import type {RoomRouterOptions} from './routes.js';

/** Trusted server configuration only; gameplay and live sources stay opt-in elsewhere. */
export async function createRoomRuntime(environment:Readonly<Record<string,string|undefined>>=process.env){
 const storage=environment.ROOM_STORAGE??'json';
 if(!['json','sqlite'].includes(storage))throw new Error('ROOM_STORAGE must be json or sqlite.');
 const sessions=environment.ROOM_SESSIONS??'off';if(!['on','off'].includes(sessions))throw new Error('ROOM_SESSIONS must be on or off.');
 const origins=(environment.ROOM_SESSION_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean);
 if(sessions==='on'&&(!origins.length||origins.some(origin=>{try{const url=new URL(origin);return url.origin!==origin||url.protocol!=='https:';}catch{return true;}})))throw new Error('Session mode requires exact HTTPS origins.');
 const telemetry=new SecurityTelemetry();
 const repository=storage==='sqlite'?new (await import('./storage/sqlite.js')).SqliteRoomRepository(environment.ROOM_SQLITE_FILE??'data/rooms.sqlite'):undefined;
 try {
  const store=new RoomStore({repository,dataFile:environment.ROOM_DATA_FILE??'data/rooms.json',speed:Number(environment.ROOM_SPEED)||1,telemetry});
  const security:RoomRouterOptions['security']=sessions==='on'?{enabled:true,allowedOrigins:origins,allowLegacyCredentials:environment.ROOM_ALLOW_LEGACY_CREDENTIALS==='true',telemetry}:undefined;
  let closed=false;
  return {store,security,telemetry,storage,close(){if(!closed){repository?.close();closed=true;}}};
 }catch(error){repository?.close();throw error;}
}
