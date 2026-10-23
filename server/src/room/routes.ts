import express from 'express';
import { z } from 'zod';
import { RoomError, type RoomStore } from './store.js';
import { answerRoom } from './assistant.js';

const token=z.string().min(1).max(200);
export const createRoomSchema=z.object({name:z.string().trim().min(1).max(80).optional(),seasonId:z.string().trim().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),speed:z.number().int().min(1).max(4).optional(),gameId:z.string().min(1).max(100).optional()});
export const joinRoomSchema=z.object({name:z.string().trim().min(1).max(24),participantToken:token.optional()});
export const lineupSchema=z.object({participantToken:token,captainId:z.string().min(1).max(100),flexIds:z.array(z.string().min(1).max(100)).length(4)});
export const autoLineupSchema=z.object({participantToken:token,style:z.enum(['balanced','stars','value']).optional()});
export const pickSchema=z.object({participantToken:token,questionId:z.string().min(1).max(100),optionId:z.string().min(1).max(50)});
export const hostSchema=z.object({hostToken:token,action:z.enum(['start','pause','resume','set_speed']),speed:z.number().int().min(1).max(4).optional()});
export const utteranceSchema=z.object({text:z.string().trim().min(1).max(500),participantToken:token.optional(),hostToken:token.optional()});

export function createRoomRouter(store:RoomStore):express.Router {
  const router=express.Router();
  router.use(express.json({limit:'16kb'}));
  router.get('/',(_req,res)=>res.json({rooms:store.list()}));
  router.post('/',(req,res)=>res.status(201).json(store.create(createRoomSchema.parse(req.body??{}))));
  router.get('/:code',(req,res)=>{
    const auth=req.headers.authorization;
    if(auth && !/^Bearer\s+\S+$/i.test(auth))throw new RoomError(401,'UNAUTHORIZED','Use your saved room participant credential.');
    res.json(store.view(req.params.code,auth?.replace(/^Bearer\s+/i,'')));
  });
  router.post('/:code/join',(req,res)=>res.status(201).json(store.join(req.params.code,joinRoomSchema.parse(req.body))));
  router.post('/:code/lineup',(req,res)=>res.json(store.setLineup(req.params.code,lineupSchema.parse(req.body))));
  router.post('/:code/auto-lineup',(req,res)=>res.json(store.autoLineup(req.params.code,autoLineupSchema.parse(req.body))));
  router.post('/:code/picks',(req,res)=>res.json(store.pick(req.params.code,pickSchema.parse(req.body))));
  router.post('/:code/host',(req,res)=>res.json(store.host(req.params.code,hostSchema.parse(req.body))));
  router.post('/:code/assistant',(req,res)=>res.json(answerRoom(store,req.params.code,utteranceSchema.parse(req.body))));
  router.use((_req,res)=>res.status(404).json({error:'Room endpoint not found.',code:'NOT_FOUND'}));
  router.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(err instanceof RoomError){res.status(err.status).json({error:err.message,code:err.code});return;}
    if(err instanceof z.ZodError){res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')||'request'}: ${i.message}`).join('; '),code:'BAD_REQUEST'});return;}
    const httpError=err as {type?:string;status?:number};
    if(httpError.type==='entity.parse.failed' || httpError.type==='entity.too.large'){
      res.status(httpError.status??400).json({error:httpError.type==='entity.too.large'?'Request is too large.':'Send a valid JSON request.',code:'BAD_REQUEST'});return;
    }
    console.error('[room] request failed');res.status(500).json({error:'Could not complete the room request.',code:'INTERNAL'});
  });
  return router;
}
