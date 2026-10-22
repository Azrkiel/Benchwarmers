import { expect, it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { answerRoom } from '../../src/room/assistant.js';

it('understands natural yes/no scoring calls without treating them as score inquiries',()=>{
 let now=1_000_000;const rooms=new RoomStore({persist:false,now:()=>now,speed:4});
 const c=rooms.create();const code=c.view.room.code;const p=rooms.join(code,{name:'Sam'});
 rooms.host(code,{hostToken:c.hostToken,action:'start'});
 for(let i=0;i<1000;i++){
  const view=rooms.view(code);
  if(view.question?.status==='open'&&view.question.options.some(o=>o.id==='yes'))break;
  now+=1000;rooms.tick();
 }
 expect(rooms.view(code).question!.options.map(o=>o.id)).toContain('yes');
 let a=answerRoom(rooms,code,{participantToken:p.participantToken,text:'they will score'});
 expect(a.view.me!.currentPick!.optionId).toBe('yes');
 a=answerRoom(rooms,code,{participantToken:p.participantToken,text:'they will not score'});
 expect(a.view.me!.currentPick!.optionId).toBe('no');
 const status=answerRoom(rooms,code,{participantToken:p.participantToken,text:"what's the score?"});
 expect(status.reply).toContain('Morning Wood');
 expect(status.view.me!.currentPick!.optionId).toBe('no');
});
