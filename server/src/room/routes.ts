import express from 'express';
import { z } from 'zod';
import { RoomError, type RoomStore } from './store.js';
import { answerRoom } from './assistant.js';
import { createPlaybackRouter, PlaybackLeases } from './playback.js';
import { PointsError } from './points/model.js';
import {createRoomSecurity,type RoomSecurityOptions,type RoomActor} from './security/index.js';

const token=z.string().min(1).max(200);
export const createRoomSchema=z.object({name:z.string().trim().min(1).max(80).optional(),seasonId:z.string().trim().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),speed:z.number().int().min(1).max(4).optional(),gameId:z.string().min(1).max(100).optional()});
export const joinRoomSchema=z.object({name:z.string().trim().min(1).max(24),participantToken:token.optional()});
export const lineupSchema=z.object({participantToken:token,captainId:z.string().min(1).max(100),flexIds:z.array(z.string().min(1).max(100)).length(4)});
export const autoLineupSchema=z.object({participantToken:token,style:z.enum(['balanced','stars','value']).optional()});
export const pickSchema=z.object({participantToken:token,questionId:z.string().min(1).max(100),optionId:z.string().min(1).max(50),requestId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional()});
export const hostSchema=z.object({hostToken:token,action:z.enum(['start','pause','resume','set_speed']),speed:z.number().int().min(1).max(4).optional()});
export const utteranceSchema=z.object({text:z.string().trim().min(1).max(500),participantToken:token.optional(),hostToken:token.optional()});
export const commitmentQuoteSchema=z.object({participantToken:token,questionId:z.string().min(1).max(100),optionId:z.string().min(1).max(50),commitPoints:z.union([z.literal(10),z.literal(25),z.literal(50)])});
export const commitmentAcceptSchema=z.object({participantToken:token,quoteId:z.string().min(1).max(100),requestId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)});
export const commitmentConfirmSchema=commitmentAcceptSchema.omit({quoteId:true});
export const playerCallQuoteSchema=z.object({participantToken:token,templateId:z.enum(['next_score_team','next_made_field_goal_value']),anchorSequence:z.number().int().nonnegative().safe(),horizonGameElapsedMs:z.number().int().nonnegative().safe(),optionId:z.string().min(1).max(50),commitPoints:z.union([z.literal(10),z.literal(25),z.literal(50)])}).strict();
export const pregamePickSchema=z.object({participantToken:token,requestId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),optionId:z.string().min(1).max(50)}).strict();

export type RoomRouterOptions={security?:Omit<RoomSecurityOptions,'validateCredential'>&{allowLegacyCredentials?:boolean}};
export function createRoomRouter(store:RoomStore,options:RoomRouterOptions={}):express.Router {
  const router=express.Router();
  router.use(express.json({limit:'16kb'}));
  if(options.security){
    const security=createRoomSecurity({...options.security,validateCredential:({roomCode,role,credential})=>store.credentialActor(roomCode,role,credential)});
    router.use(security.router);
    router.use('/:code',(req,res,next)=>{
      security.requestLimits(req,res,()=>{
        const path=req.path;
        const host=path==='/host'||path.startsWith('/playback');
        const privateRead=path.startsWith('/receipts/')||path.startsWith('/commitment-receipts/');
        const mutation=!['GET','HEAD','OPTIONS'].includes(req.method);
        const required=host?'host':privateRead||(mutation&&path!=='/assistant')?'participant':undefined;
        security.authorize(required)(req,res,()=>{
          const actor=res.locals.roomActor as RoomActor|undefined;
          if(!actor&&options.security?.enabled&&options.security.allowLegacyCredentials===false&&(privateRead||mutation&&path!=='/join'||req.headers.authorization)){
            next(new RoomError(401,'SESSION_REQUIRED','Exchange your credential for a room session before continuing.'));return;
          }
          if(actor){
            const body=req.body as Record<string,unknown>|undefined;
            const key=actor.role==='host'?'hostToken':'participantToken';
            const otherKey=actor.role==='host'?'participantToken':'hostToken';
            const auth=req.headers.authorization;
            if((body?.[key]!==undefined&&body[key]!==actor.credential)||body?.[otherKey]!==undefined||(auth!==undefined&&auth!==`Bearer ${actor.credential}`)){
              next(new RoomError(403,'SCOPE_REQUIRED','The submitted credential conflicts with the active room session.'));return;
            }
            if(mutation&&actor.credential){req.body??={};req.body[key]=actor.credential;}
            if(actor.role==='participant'&&actor.credential)req.headers.authorization=`Bearer ${actor.credential}`;
            else delete req.headers.authorization;
          }
          next();
        });
      });
    });
  }
  router.get('/',(_req,res)=>res.json({rooms:store.list()}));
  router.post('/',(req,res)=>res.status(201).json(store.create(createRoomSchema.parse(req.body??{}))));
  const playback=createPlaybackRouter(new PlaybackLeases(),(code,token)=>store.isHost(code,token));
  router.use('/:code/playback',(req,res,next)=>{
    req.params.code=store.roomSummary(req.params.code).code;
    playback(req,res,next);
  });
  router.get('/:code',(req,res)=>{
    const auth=req.headers.authorization;
    if(auth && !/^Bearer\s+\S+$/i.test(auth))throw new RoomError(401,'UNAUTHORIZED','Use your saved room participant credential.');
    res.json(store.view(req.params.code,auth?.replace(/^Bearer\s+/i,'')));
  });
  router.get('/:code/receipts/:requestId',(req,res)=>{
    const auth=req.headers.authorization;
    if(!auth||!/^Bearer\s+\S+$/i.test(auth))throw new RoomError(401,'UNAUTHORIZED','Use your saved room participant credential.');
    res.json(store.receipt(req.params.code,auth.replace(/^Bearer\s+/i,''),req.params.requestId));
  });
  router.post('/:code/join',(req,res)=>res.status(201).json(store.join(req.params.code,joinRoomSchema.parse(req.body))));
  router.post('/:code/lineup',(req,res)=>res.json(store.setLineup(req.params.code,lineupSchema.parse(req.body))));
  router.post('/:code/auto-lineup',(req,res)=>res.json(store.autoLineup(req.params.code,autoLineupSchema.parse(req.body))));
  router.post('/:code/picks',(req,res)=>res.json(store.pick(req.params.code,pickSchema.parse(req.body))));
  router.get('/:code/pregame-reference',(req,res)=>res.json(store.pregameReference(req.params.code)));
  router.post('/:code/pregame-picks',(req,res)=>res.json(store.pickPregame(req.params.code,pregamePickSchema.parse(req.body))));
  router.get('/:code/call-catalog',(req,res)=>res.json(store.callCatalog(req.params.code)));
  router.post('/:code/call-quotes',(req,res)=>res.json(store.quotePlayerCall(req.params.code,playerCallQuoteSchema.parse(req.body))));
  router.post('/:code/calls',(req,res)=>res.json(store.acceptPlayerCall(req.params.code,commitmentAcceptSchema.strict().parse(req.body))));
  router.post('/:code/commitment-quotes',(req,res)=>res.json(store.quoteCommitment(req.params.code,commitmentQuoteSchema.parse(req.body))));
  router.post('/:code/commitments',(req,res)=>res.json(store.acceptCommitment(req.params.code,commitmentAcceptSchema.parse(req.body))));
  router.post('/:code/commitment-confirmations/quote',(req,res)=>res.json(store.quoteCommitmentForVoice(req.params.code,commitmentQuoteSchema.parse(req.body))));
  router.post('/:code/commitment-confirmations/confirm',(req,res)=>res.json(store.confirmPendingCommitment(req.params.code,commitmentConfirmSchema.parse(req.body))));
  router.get('/:code/commitment-receipts/:requestId',(req,res)=>{
    const auth=req.headers.authorization;
    if(!auth||!/^Bearer\s+\S+$/i.test(auth))throw new RoomError(401,'UNAUTHORIZED','Use your saved room participant credential.');
    res.json({commitment:store.getCommitmentReceipt(req.params.code,auth.replace(/^Bearer\s+/i,''),req.params.requestId)});
  });
  router.post('/:code/host',(req,res)=>res.json(store.host(req.params.code,hostSchema.parse(req.body))));
  router.post('/:code/assistant',(req,res)=>res.json(answerRoom(store,req.params.code,utteranceSchema.parse(req.body))));
  router.use((_req,res)=>res.status(404).json({error:'Room endpoint not found.',code:'NOT_FOUND'}));
  router.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(err instanceof RoomError||err instanceof PointsError){res.status(err.status).json({error:err.message,code:err.code});return;}
    if(err instanceof z.ZodError){res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')||'request'}: ${i.message}`).join('; '),code:'BAD_REQUEST'});return;}
    const httpError=err as {type?:string;status?:number};
    if(httpError.type==='entity.parse.failed' || httpError.type==='entity.too.large'){
      res.status(httpError.status??400).json({error:httpError.type==='entity.too.large'?'Request is too large.':'Send a valid JSON request.',code:'BAD_REQUEST'});return;
    }
    console.error('[room] request failed');res.status(500).json({error:'Could not complete the room request.',code:'INTERNAL'});
  });
  return router;
}
