import type { McpServer, CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RoomError, type RoomStore } from './store.js';
import { autoLineupSchema, createRoomSchema, hostSchema, joinRoomSchema, lineupSchema, pickSchema } from './routes.js';

const codeSchema=z.object({code:z.string().trim().min(1).max(16)});
export function registerRoomTools(server:McpServer,store:RoomStore):void {
  function register<S extends Record<string,z.ZodType>>(name:string,description:string,schema:z.ZodObject<S>,readOnly:boolean,fn:(a:z.infer<z.ZodObject<S>>)=>unknown){
    const inputSchema: z.ZodObject<Record<string,z.ZodType>> = schema;
    server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly}},async(args)=>{
      try{
        const data=fn(schema.parse(args));
        return {content:[{type:'text',text:name==='room_create'?'Your football room is ready. Share the room code and keep the host credential private.':name==='room_join'?'You joined the football room. Keep your participant credential for your lineup and picks.':'Football room updated.'}],structuredContent:data as Record<string,unknown>} as CallToolResult;
      }catch(err){
        const known=err instanceof RoomError;
        return {isError:true,content:[{type:'text',text:known?err.message:'Could not complete that room action.'}],structuredContent:{errorCode:known?err.code:'INTERNAL'}};
      }
    });
  }
  register('room_create','Create a large football watch-party room using the fictional Morning Wood vs Swiss Cheese script. No household needed. Returns a private host credential.',createRoomSchema,false,a=>store.create(a));
  register('room_list','List saved football rooms and their participant counts.',z.object({}),true,()=>({rooms:store.list()}));
  register('room_join','Join a football room by code and display name. Returns a private participant credential. Supply it to rejoin this or another room in the same season.',codeSchema.extend(joinRoomSchema.shape),false,({code,...a})=>store.join(code,a));
  register('room_status','Read the score, clock, prediction, player stats, and room standings. Optional participant credential includes your private lineup and pick.',codeSchema.extend({participantToken:z.string().optional()}),true,a=>store.view(a.code,a.participantToken));
  register('room_player_pool','List every athlete, salary, position weight, and visible stat line. All participants can select the same athletes.',codeSchema,true,a=>{const v=store.view(a.code);return{players:v.players,rules:v.rules};});
  register('room_set_lineup','Save one captain and four different flex athletes under $50,000. Captain costs and scores 1.5x. Lineups lock at kickoff.',codeSchema.extend(lineupSchema.shape),false,({code,...a})=>store.setLineup(code,a));
  register('room_auto_lineup','Build a legal shared-player lineup: balanced, stars, or value/sleepers.',codeSchema.extend(autoLineupSchema.shape),false,({code,...a})=>store.autoLineup(code,a));
  register('room_predict','Answer the current room question before the snap. Choose an option id from room_status. Correct answers earn base points and streak/speed/minority/historical bonuses.',codeSchema.extend(pickSchema.shape),false,({code,...a})=>store.pick(code,a));
  register('room_leaderboard','Get the whole room leaderboard. Night total is weighted lineup points plus prediction points.',codeSchema,true,a=>({standings:store.view(a.code).standings}));
  register('room_season','Get persisted season standings across completed football rooms.',codeSchema,true,a=>store.view(a.code).season);
  register('room_host','Start, pause, resume, or change replay speed1–4. Requires the host credential returned by room_create.',codeSchema.extend(hostSchema.shape),false,({code,...a})=>store.host(code,a));
  server.registerResource('room_rules','benchwarmers://room-rules',{mimeType:'text/plain'},async()=>({contents:[{uri:'benchwarmers://room-rules',mimeType:'text/plain',text:'Benchwarmers football rooms: real people join by room code, no household needed. One captain plus four flex under $50,000; captain costs and scores1.5x. Athletes may be shared across participants. Position weights apply before captain bonus and are shown in room_status. Lineups lock at kickoff. One prediction per drive mixes outcome calls and yes/no questions. Correct call base points multiply streak, speed, minority-choice, and historical reference; combined multiplier capped5x, rounded to0.5. Wrong or missed predictions break the streak. The match is a fictional scripted27–24 replay. Saved room results count once toward the season.'}]}));
}
