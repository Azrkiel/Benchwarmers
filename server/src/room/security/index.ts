import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';

export type RoomRole='host'|'participant'|'spectator'|'integration';
export interface RoomActor {roomCode:string;role:RoomRole;actorId:string;credential?:string}
export interface RoomSession extends RoomActor {id:string;csrfToken:string;expiresAt:number}
export const ROOM_ABUSE_DEFAULTS=Object.freeze({
  maxRooms:100,maxParticipantsPerRoom:64,maxDiscoveryRooms:20,payloadBytes:16_384,
  roomRetentionMs:7*24*60*60*1000,maxSessions:2048,sessionTtlMs:60*60*1000,
  windowMs:60_000,actorRequests:120,roomRequests:1000,maxRateKeys:4096,
});
const positive=(value:number,name:string)=>{if(!Number.isSafeInteger(value)||value<=0)throw new Error(`Invalid ${name}.`);return value;};
const opaque=()=>randomBytes(32).toString('base64url');

/** One-process session registry. Restart revokes all sessions; never persist/log credentials. */
export class RoomSessions {
  private readonly entries=new Map<string,RoomSession>();
  private readonly now:()=>number;
  private readonly ttlMs:number;
  private readonly maxSessions:number;
  constructor(options:{now?:()=>number;ttlMs?:number;maxSessions?:number}={}){
    this.now=options.now??Date.now;this.ttlMs=positive(options.ttlMs??ROOM_ABUSE_DEFAULTS.sessionTtlMs,'session TTL');this.maxSessions=positive(options.maxSessions??ROOM_ABUSE_DEFAULTS.maxSessions,'session capacity');
  }
  private prune(){for(const [id,session] of this.entries)if(session.expiresAt<=this.now())this.entries.delete(id);}
  get size(){this.prune();return this.entries.size;}
  create(actor:RoomActor):RoomSession{
    this.prune();if(this.entries.size>=this.maxSessions)throw new Error('Session capacity reached.');
    const session={...actor,id:opaque(),csrfToken:opaque(),expiresAt:this.now()+this.ttlMs};
    this.entries.set(session.id,session);return {...session};
  }
  resolve(id:string,roomCode:string):RoomSession|undefined{
    const session=this.entries.get(id);if(!session)return undefined;
    if(session.expiresAt<=this.now()){this.entries.delete(id);return undefined;}
    return session.roomCode===roomCode?{...session}:undefined;
  }
  revoke(id:string){this.entries.delete(id);}
  revokeActor(roomCode:string,actorId:string){for(const [id,session] of this.entries)if(session.roomCode===roomCode&&session.actorId===actorId)this.entries.delete(id);}
}

interface Bucket {count:number;expiresAt:number}
/** Fixed windows, no active-key eviction: a full registry rejects unseen keys. */
export class BoundedRateLimiter {
  private readonly buckets=new Map<string,Bucket>();
  private readonly now:()=>number;private readonly windowMs:number;private readonly actorRequests:number;private readonly roomRequests:number;private readonly maxKeys:number;
  constructor(options:{now?:()=>number;windowMs?:number;actorRequests?:number;roomRequests?:number;maxKeys?:number}={}){
    this.now=options.now??Date.now;this.windowMs=positive(options.windowMs??ROOM_ABUSE_DEFAULTS.windowMs,'rate window');
    this.actorRequests=positive(options.actorRequests??ROOM_ABUSE_DEFAULTS.actorRequests,'actor limit');this.roomRequests=positive(options.roomRequests??ROOM_ABUSE_DEFAULTS.roomRequests,'room limit');this.maxKeys=positive(options.maxKeys??ROOM_ABUSE_DEFAULTS.maxRateKeys,'rate key capacity');
  }
  private prune(){for(const [key,bucket] of this.buckets)if(bucket.expiresAt<=this.now())this.buckets.delete(key);}
  get size(){this.prune();return this.buckets.size;}
  allow(roomCode:string,actorId:string):boolean{
    this.prune();
    const keys=[JSON.stringify(['room',roomCode]),JSON.stringify(['actor',roomCode,actorId])];
    const missing=keys.filter(key=>!this.buckets.has(key)).length;
    if(this.buckets.size+missing>this.maxKeys)return false;
    const caps=[this.roomRequests,this.actorRequests];
    if(keys.some((key,i)=>(this.buckets.get(key)?.count??0)>=caps[i]))return false;
    keys.forEach(key=>{const bucket=this.buckets.get(key)??{count:0,expiresAt:this.now()+this.windowMs};bucket.count++;this.buckets.set(key,bucket);});return true;
  }
}

const metricNames=['accepted','rejected','rate_limited','save_error','settlement','correction','session_created','session_revoked'] as const;
export type SecurityMetric=typeof metricNames[number];
const gaugeNames=['source_lag_ms','active_rooms','stream_connections','queue_depth','session_count','rate_keys'] as const;
export type SecurityGauge=typeof gaugeNames[number];
/** Finite, aggregate names only. No actor, token, room, audio, or payload labels. */
export class SecurityTelemetry {
  private readonly counters=Object.fromEntries(metricNames.map(name=>[name,0])) as Record<SecurityMetric,number>;
  private readonly gauges=Object.fromEntries(gaugeNames.map(name=>[name,0])) as Record<SecurityGauge,number>;
  record(name:SecurityMetric){if(Object.hasOwn(this.counters,name))this.counters[name]=Math.min(Number.MAX_SAFE_INTEGER,this.counters[name]+1);}
  gauge(name:SecurityGauge,value:number){if(Object.hasOwn(this.gauges,name)&&Number.isFinite(value)&&value>=0)this.gauges[name]=Math.min(Number.MAX_SAFE_INTEGER,value);}
  snapshot(){return {...this.counters,...this.gauges};}
}

export interface CredentialRequest {roomCode:string;role:RoomRole;credential?:string;participantId?:string}
export interface RoomSecurityOptions {
  enabled?:boolean;
  allowedOrigins:readonly string[];
  validateCredential:(request:CredentialRequest)=>{actorId:string}|undefined|Promise<{actorId:string}|undefined>;
  now?:()=>number;sessionTtlMs?:number;maxSessions?:number;
  telemetry?:SecurityTelemetry;
  limits?:{windowMs?:number;actorRequests?:number;roomRequests?:number;maxKeys?:number};
}
const COOKIE='__Host-bw-room';
const exchangeSchema=z.object({role:z.enum(['host','participant','spectator','integration']),credential:z.string().min(1).max(200).optional(),participantId:z.string().min(1).max(100).optional()}).strict();
const safeMethods=new Set(['GET','HEAD','OPTIONS']);
const roomCode=(req:express.Request)=>String(req.params.code??'').trim().toUpperCase();
const sessionId=(req:express.Request)=>{
  const matches=(req.headers.cookie??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(`${COOKIE}=`));
  // Ambiguous duplicate cookies must fail closed.
  return matches.length===1?matches[0].slice(COOKIE.length+1):matches.length>1?'invalid':undefined;
};
const sameSecret=(supplied:string,expected:string)=>{const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);};

export function createRoomSecurity(options:RoomSecurityOptions){
  const enabled=options.enabled===true;
  const origins=new Set(options.allowedOrigins.map(origin=>{const parsed=new URL(origin);if(parsed.origin!==origin||parsed.protocol!=='https:')throw new Error('Session origins must be exact HTTPS origins.');return origin;}));
  if(enabled&&origins.size===0)throw new Error('Session mode requires an allowed origin.');
  const now=options.now??Date.now;
  const sessions=new RoomSessions({now,ttlMs:options.sessionTtlMs,maxSessions:options.maxSessions});
  const limiter=new BoundedRateLimiter({now,...options.limits});
  const telemetry=options.telemetry??new SecurityTelemetry();
  const router=express.Router();
  const fail=(res:express.Response,status:number,code:string)=>{telemetry.record(status===429?'rate_limited':'rejected');res.status(status).json({code,error:code==='RATE_LIMITED'?'Room request limit reached.':'Room session request rejected.'});};
  const originAllowed=(req:express.Request)=>!!req.headers.origin&&origins.has(req.headers.origin)&&(!req.headers['sec-fetch-site']||['same-origin','same-site','none'].includes(String(req.headers['sec-fetch-site'])));
  const guardMutation=(req:express.Request,res:express.Response,session:RoomSession)=>{
    if(safeMethods.has(req.method))return true;
    const csrf=req.headers['x-room-csrf'];
    if(!originAllowed(req)||typeof csrf!=='string'||!sameSecret(csrf,session.csrfToken)){fail(res,403,'CSRF_REJECTED');return false;}return true;
  };
  const correlation:express.RequestHandler=(_req,res,next)=>{res.setHeader('x-correlation-id',randomUUID());next();};
  const chargeRequest=(req:express.Request,res:express.Response,actorId?:string)=>{
    if(res.locals.roomSecurityRateCharged)return true;
    const code=roomCode(req);
    const session=sessions.resolve(sessionId(req)??'',code);
    const body=req.body as {participantToken?:unknown;hostToken?:unknown}|undefined;
    const raw=req.headers.authorization??body?.participantToken??body?.hostToken??`remote:${req.ip??'unknown'}`;
    const identity=actorId??session?.actorId??`legacy:${createHash('sha256').update(typeof raw==='string'?raw:'invalid').digest('hex')}`;
    if(!limiter.allow(code,identity)){fail(res,429,'RATE_LIMITED');return false;}
    res.locals.roomSecurityRateCharged=true;return true;
  };
  /** Mount on routes with :code populated, after bounded JSON parsing, before auth. */
  const requestLimits:express.RequestHandler=(req,res,next)=>{if(!enabled||chargeRequest(req,res))next();};
  router.use(correlation);
  const authorize=(required?:RoomRole):express.RequestHandler=>async(req,res,next)=>{
    if(!enabled)return next();
    const id=sessionId(req);if(id===undefined)return next(); // Existing credential validation remains authoritative for legacy requests.
    const session=sessions.resolve(id,roomCode(req));
    if(!session){fail(res,401,'SESSION_REQUIRED');return;}
    // Recheck authority so removed participants/revoked bearer credentials invalidate sessions.
    const valid=await options.validateCredential({roomCode:session.roomCode,role:session.role,credential:session.credential,participantId:session.role==='participant'?session.actorId:undefined});
    if(!valid||valid.actorId!==session.actorId){sessions.revoke(id);fail(res,401,'SESSION_REQUIRED');return;}
    if(required&&session.role!==required){fail(res,403,'SCOPE_REQUIRED');return;}
    if(!guardMutation(req,res,session))return;
    if(!chargeRequest(req,res,session.actorId))return;
    res.locals.roomActor={roomCode:session.roomCode,role:session.role,actorId:session.actorId,credential:session.credential} satisfies RoomActor;
    telemetry.record('accepted');next();
  };
  router.post('/:code/session',express.json({limit:ROOM_ABUSE_DEFAULTS.payloadBytes}),async(req,res)=>{
    if(!enabled){fail(res,404,'NOT_FOUND');return;}
    res.setHeader('Cache-Control','no-store');
    if(Object.keys(req.query).length>0){fail(res,400,'BAD_REQUEST');return;}
    if(!originAllowed(req)){fail(res,403,'ORIGIN_REJECTED');return;}
    const parsed=exchangeSchema.safeParse(req.body);if(!parsed.success){fail(res,400,'BAD_REQUEST');return;}
    const code=roomCode(req);if(!/^[A-Z0-9-]{1,64}$/.test(code)){fail(res,400,'BAD_REQUEST');return;}
    if(parsed.data.role!=='spectator'&&!parsed.data.credential){fail(res,401,'SESSION_REQUIRED');return;}
    const remote=createHash('sha256').update(req.ip??'unknown').digest('hex');
    if(!limiter.allow(code,`exchange:${remote}`)){fail(res,429,'RATE_LIMITED');return;}
    const actor=await options.validateCredential({roomCode:code,...parsed.data});
    if(!actor){fail(res,401,'SESSION_REQUIRED');return;}
    // Rotate only after proving the existing cookie belongs to this room and actor.
    const priorId=sessionId(req);const prior=priorId?sessions.resolve(priorId,code):undefined;
    if(prior&&prior.actorId===actor.actorId&&prior.role===parsed.data.role)sessions.revoke(prior.id);
    if(sessions.size>=(options.maxSessions??ROOM_ABUSE_DEFAULTS.maxSessions)){fail(res,503,'SESSION_CAPACITY');return;}
    const session=sessions.create({roomCode:code,role:parsed.data.role,actorId:actor.actorId,credential:parsed.data.credential});
    res.cookie(COOKIE,session.id,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:session.expiresAt-now()});
    telemetry.record('session_created');res.status(201).json({role:session.role,actorId:session.actorId,expiresAt:session.expiresAt,csrfToken:session.csrfToken});
  });
  router.delete('/:code/session',(req,res,next)=>{if(!enabled){fail(res,404,'NOT_FOUND');return;}if(!sessionId(req)){fail(res,401,'SESSION_REQUIRED');return;}next();},authorize(),(req,res)=>{
    sessions.revoke(sessionId(req)!);res.clearCookie(COOKIE,{httpOnly:true,secure:true,sameSite:'strict',path:'/'});res.setHeader('Cache-Control','no-store');telemetry.record('session_revoked');res.sendStatus(204);
  });
  router.use((err:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{
    const bodyError=err as {type?:string;status?:number};
    if(bodyError.type==='entity.parse.failed'||bodyError.type==='entity.too.large'){fail(res,bodyError.status??400,'BAD_REQUEST');return;}
    next(err);
  });
  return {router,authorize,sessions,limiter,telemetry,correlation,requestLimits};
}
