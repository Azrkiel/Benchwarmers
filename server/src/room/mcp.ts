import type { McpServer, CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RoomError, type RoomStore } from './store.js';
import { autoLineupSchema, createRoomSchema, hostSchema, joinRoomSchema, lineupSchema, pickSchema, utteranceSchema } from './routes.js';
import { answerRoom } from './assistant.js';

const codeSchema=z.object({code:z.string().trim().min(1).max(16)});
export function registerRoomTools(server:McpServer,store:RoomStore):void {
  function register<S extends Record<string,z.ZodType>>(name:string,description:string,schema:z.ZodObject<S>,readOnly:boolean,fn:(a:z.infer<z.ZodObject<S>>)=>unknown){
    const inputSchema: z.ZodObject<Record<string,z.ZodType>> = schema;
    server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly}},async(args)=>{
      try{
        const data=fn(schema.parse(args));
        const text=name==='room_create'?'Your room is ready. Share the room code and keep the host credential private.':name==='room_join'?'You joined the room. Keep your participant credential for your lineup and picks.':name==='room_ask'?(data as {reply:string}).reply:readOnly?'Room state read.':'Room updated.';
        return {content:[{type:'text',text}],structuredContent:data as Record<string,unknown>} as CallToolResult;
      }catch(err){
        const known=err instanceof RoomError;
        return {isError:true,content:[{type:'text',text:known?err.message:'Could not complete that room action.'}],structuredContent:{errorCode:known?err.code:'INTERNAL'}};
      }
    });
  }
  register('room_create','Create a watch-party room for a fictional scripted replay. Optional gameId selects the game; omitting it keeps the football replay. Unsupported games return GAME_NOT_SUPPORTED. Returns a private host credential.',createRoomSchema,false,a=>store.create(a));
  register('room_list','List saved rooms and their participant counts.',z.object({}),true,()=>({rooms:store.list()}));
  register('room_join','Join a room by code and display name. Returns a private participant credential. Supply it to rejoin this or another room in the same season.',codeSchema.extend(joinRoomSchema.shape),false,({code,...a})=>store.join(code,a));
  register('room_status','Read the room snapshot: sport, score, clock, possession when known (null means unknown), the current question, player stats and standings. Optional participant credential adds your private lineup and pick.',codeSchema.extend({participantToken:z.string().optional()}),true,a=>store.view(a.code,a.participantToken));
  register('room_player_pool','List every athlete, salary, position weight, and visible stat line. All participants can select the same athletes.',codeSchema,true,a=>{const v=store.view(a.code);return{players:v.players,rules:v.rules};});
  register('room_set_lineup','Save one captain and four different flex athletes within the salary cap shown in room_status rules. The captain costs and scores the captain multiplier. Lineups lock when the host starts the game.',codeSchema.extend(lineupSchema.shape),false,({code,...a})=>store.setLineup(code,a));
  register('room_auto_lineup','Build a legal shared-player lineup: balanced, stars, or value/sleepers.',codeSchema.extend(autoLineupSchema.shape),false,({code,...a})=>store.autoLineup(code,a));
  register('room_predict','Answer the current room question before it locks (the server clock decides). Choose an option id from room_status. A response with me.currentPick equal to your answer is the acceptance; correct answers earn base points plus streak, timing and minority bonuses.',codeSchema.extend(pickSchema.shape),false,({code,...a})=>store.pick(code,a));
  register('room_leaderboard','Get the whole room leaderboard with shared ranks for ties. Night total is lineup points plus prediction points.',codeSchema,true,a=>({standings:store.view(a.code).standings}));
  register('room_season','Get persisted season standings across completed rooms.',codeSchema,true,a=>store.view(a.code).season);
  register('room_ask','Send one spoken or typed room request ("I choose three", "make Big Mo my captain", "what is my rank?", "pause the replay"). It becomes a typed command checked by the same rules as room_predict, room_set_lineup and room_host. Picks and lineups need the participant credential; host actions need the host credential. The reply states whether anything was accepted.',codeSchema.extend(utteranceSchema.shape),false,({code,...a})=>answerRoom(store,code,a));
  register('room_host','Start, pause, resume, or change replay speed1–4. Requires the host credential returned by room_create.',codeSchema.extend(hostSchema.shape),false,({code,...a})=>store.host(code,a));
  server.registerResource('room_rules','benchwarmers://room-rules',{mimeType:'text/plain'},async()=>({contents:[{uri:'benchwarmers://room-rules',mimeType:'text/plain',text:'Benchwarmers rooms: people join by room code, no household needed. Each room plays one fictional scripted replay chosen at creation (football by default; room_status reports sport and rulesVersion). One captain plus four flex within the salary cap; the captain costs and scores the captain multiplier. Athletes may be shared across participants. Position weights apply before the captain bonus and are shown in room_status. Lineups lock when the host starts. One featured question at a time; the server clock decides when it locks. Correct answers earn base points times streak, timing and minority-choice bonuses, combined multiplier capped at 5x. Wrong answers break the streak; void questions score zero and keep it. Unknown possession is reported as null, never guessed. Saved room results count once toward the season.'}]}));
}
