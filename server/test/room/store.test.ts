import { describe,it,expect } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RoomStore } from '../../src/room/store.js';
import { getOdds } from '../../src/game/odds.js';
const lineup={captainId:'will-power',flexIds:['max-yardage','robin-banks','hugh-jass','ben-dover']};
function setup(persist=false,dataFile?:string) {let now=100000;const store=new RoomStore({persist,dataFile,now:()=>now});return {store,advance:(n:number)=>{now+=n;store.tick();},time:()=>now};}
function finish(s:ReturnType<typeof setup>,code:string) {for(let i=0;i<500 && s.store.view(code).room.phase!=='final';i++)s.advance(8000);return s.store.view(code);}
describe('big football rooms',()=>{
 it('supports 35 real seats, shared athletes and private credentials',()=>{
  const {store}=setup();const {view,hostToken}=store.create();const code=view.room.code;
  const seats=Array.from({length:35},(_,i)=>store.join(code,{name:`Guest ${i}`}));
  for(const seat of seats)store.setLineup(code,{participantToken:seat.participantToken,...lineup});
  expect(store.view(code).room.participantCount).toBe(35);
  expect(()=>store.join(code,{name:'Guest 0'})).toThrow(/name/i);
  expect(store.join(code,{name:'Guest 0',participantToken:seats[0].participantToken}).participantId).toBe(seats[0].participantId);
  const publicJson=JSON.stringify(store.view(code));expect(publicJson).not.toContain(hostToken);expect(publicJson).not.toContain(seats[0].participantToken);
  expect(store.view(code).me).toBeUndefined();expect(()=>store.view(code,'invalid')).toThrow(/credential/i);
 });
 it('validates the cap, duplicates, captain premium and locks at start',()=>{
  const {store}=setup();const room=store.create();const code=room.view.room.code;const seat=store.join(code,{name:'A'});
  expect(store.setLineup(code,{participantToken:seat.participantToken,...lineup}).me?.lineup?.salaryUsed).toBe(38600);
  expect(()=>store.setLineup(code,{participantToken:seat.participantToken,captainId:'will-power',flexIds:['will-power','hugh-jass','ben-dover','phil-mccracken']})).toThrow(/once|duplicate/i);
  expect(()=>store.setLineup(code,{participantToken:seat.participantToken,captainId:'will-power',flexIds:['al-beback','max-yardage','hank-off','robin-banks']})).toThrow(/cap/i);
  expect(()=>store.setLineup(code,{participantToken:seat.participantToken,captainId:'__proto__',flexIds:lineup.flexIds})).toThrow(/valid captain/i);
  expect(()=>store.setLineup(code,{participantToken:seat.participantToken,captainId:'will-power',flexIds:['constructor','hugh-jass','ben-dover','phil-mccracken']})).toThrow(/valid flex/i);
  store.host(code,{hostToken:room.hostToken,action:'start'});
  expect(()=>store.autoLineup(code,{participantToken:seat.participantToken})).toThrow(/locked/i);
 });
 it('opens before action, pauses deadlines and preserves the minimum real window at 4x',()=>{
  const s=setup();const {view,hostToken}=s.store.create({speed:4});const code=view.room.code;
  let v=s.store.host(code,{hostToken,action:'start'});expect(v.game.recentPlays.filter(p=>p.kind!=='drive')).toHaveLength(0);expect(v.question?.remainingMs).toBeGreaterThanOrEqual(5000);expect(v.question?.result).toBeUndefined();
  s.advance(1000);const before=s.store.host(code,{hostToken,action:'pause'}).question!.remainingMs;
  s.advance(100000);expect(s.store.view(code).question?.remainingMs).toBe(before);
  s.store.host(code,{hostToken,action:'set_speed',speed:1});s.store.host(code,{hostToken,action:'resume'});s.advance(3999);
  expect(s.store.view(code).question?.status).toBe('open');s.advance(10000);expect(s.store.view(code).question?.status).toBe('locked');
 });
 it('restores live and paused progress, tokens and records a completed season exactly once',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'bw-room-'));const dataFile=path.join(dir,'rooms.json');
  try {const s=setup(true,dataFile);const room=s.store.create({seasonId:'demo'});const code=room.view.room.code;const seat=s.store.join(code,{name:'A'});s.store.setLineup(code,{participantToken:seat.participantToken,...lineup});s.store.host(code,{hostToken:room.hostToken,action:'start'});s.advance(2000);
   let restored=new RoomStore({dataFile,now:s.time});expect(restored.view(code,seat.participantToken).question?.remainingMs).toBe(6000);
   restored.host(code,{hostToken:room.hostToken,action:'pause'});restored=new RoomStore({dataFile,now:s.time});expect(restored.view(code).room.phase).toBe('paused');
   restored.host(code,{hostToken:room.hostToken,action:'resume'});const end=finish({...s,store:restored,advance:(n)=>{s.advance(n);restored.tick();}},code);
   expect(end.game.home.score).toBe(27);expect(end.game.away.score).toBe(24);expect(end.players.every(p=>p.statLine!=='No stats yet')).toBe(true);
   expect(end.season.standings[0].nightsPlayed).toBe(1);restored.tick();expect(restored.view(code).season.standings[0].nightsPlayed).toBe(1);
   restored=new RoomStore({dataFile,now:s.time});restored.tick();expect(restored.view(code).season.standings[0].nightsPlayed).toBe(1);expect(restored.view(code).season.standings[0].points).toBe(end.season.standings[0].points);
   const next=restored.create({seasonId:'demo'});expect(restored.join(next.view.room.code,{name:'A',participantToken:seat.participantToken}).participantId).toBe(seat.participantId);
  } finally {rmSync(dir,{recursive:true,force:true});}
 });
 it('late joins accrue only later stats and rejoining cannot reset their boundary',()=>{
  const s=setup();const room=s.store.create();const code=room.view.room.code;s.store.host(code,{hostToken:room.hostToken,action:'start'});s.advance(30000);
  const seat=s.store.join(code,{name:'Late'});expect(seat.view.standings[0].fantasyPoints).toBe(0);s.advance(10000);
  const points=s.store.view(code).standings[0].fantasyPoints;s.store.join(code,{name:'Late',participantToken:seat.participantToken});expect(s.store.view(code).standings[0].fantasyPoints).toBe(points);
 });
 it('retains duplicate timing, resets changed timing, applies minority bonus and breaks missed streaks',()=>{
  const s=setup();const room=s.store.create();const code=room.view.room.code;
  const seats=['Early','Duplicate','Changed','Wrong'].map(name=>s.store.join(code,{name}));
  let view=s.store.host(code,{hostToken:room.hostToken,action:'start'});const id=view.question!.id;
  for(const seat of seats.slice(0,3))s.store.pick(code,{participantToken:seat.participantToken,questionId:id,optionId:'TD'});
  s.store.pick(code,{participantToken:seats[3].participantToken,questionId:id,optionId:'PUNT'});
  s.advance(6000);
  s.store.pick(code,{participantToken:seats[1].participantToken,questionId:id,optionId:'TD'});
  s.store.pick(code,{participantToken:seats[2].participantToken,questionId:id,optionId:'PUNT'});
  s.store.pick(code,{participantToken:seats[2].participantToken,questionId:id,optionId:'TD'});
  for(let i=0;i<50&&!s.store.view(code).lastQuestion;i++)s.advance(3000);
  view=s.store.view(code);const early=view.standings.find(r=>r.name==='Early')!;const duplicate=view.standings.find(r=>r.name==='Duplicate')!;const changed=view.standings.find(r=>r.name==='Changed')!;
  expect(early.predictionPoints).toBe(duplicate.predictionPoints);expect(early.predictionPoints).toBeGreaterThan(changed.predictionPoints);
  expect(early.lastPickScore?.bonuses).toContain('early_call');expect(changed.lastPickScore?.bonuses).not.toContain('early_call');expect(early.streak).toBe(1);expect(view.standings.find(r=>r.name==='Wrong')?.streak).toBe(0);
  for(let i=0;i<50&&s.store.view(code).lastQuestion?.id===id;i++)s.advance(3000);
  expect(s.store.view(code).standings.find(r=>r.name==='Early')?.streak).toBe(0);
 });
 it('scores weighted stat deltas before the captain bonus and hides all future plays',()=>{
  const s=setup();const room=s.store.create();const code=room.view.room.code;const seat=s.store.join(code,{name:'A'});s.store.setLineup(code,{participantToken:seat.participantToken,...lineup});
  const lobby=JSON.stringify(s.store.view(code));expect(lobby).not.toContain('walk-off');expect(lobby).not.toContain('outcome');
  s.store.host(code,{hostToken:room.hostToken,action:'start'});s.advance(8000);
  const v=s.store.view(code);expect(v.players.find(p=>p.id==='hugh-jass')?.stats.teamRushYds).toBe(6);expect(v.standings[0].roster.find(p=>p.playerId==='hugh-jass')?.points).toBe(1.5);
  const final=finish(s,code);const captain=final.standings[0].roster.find(p=>p.captain)!;expect(captain.points).toBeCloseTo(final.players.find(p=>p.id===captain.playerId)!.points*1.5,1);
 });
 it('does not consume a newly opened prediction window after a stalled tick',()=>{
  const s=setup();const r=s.store.create({speed:4});const code=r.view.room.code;s.store.host(code,{hostToken:r.hostToken,action:'start'});
  s.advance(1e7);const v=s.store.view(code);expect(v.question?.id).toBe('drive-2');expect(v.question?.status).toBe('open');expect(v.question?.remainingMs).toBe(5000);
  const historical=getOdds(75,900+10*60+38,'score');expect(v.question?.options.find(o=>o.id==='yes')?.probability).toBe(historical.p);
  s.advance(1000);s.store.host(code,{hostToken:r.hostToken,action:'set_speed',speed:1});s.advance(1000);const before=s.store.view(code).question!.remainingMs;
  s.store.host(code,{hostToken:r.hostToken,action:'set_speed',speed:4});expect(s.store.view(code).question!.remainingMs).toBeGreaterThanOrEqual(3000);expect(before).toBeGreaterThan(3000);
 });
 it('rejects cross-season credentials and unauthorized host actions without mutating state',()=>{
  const s=setup();const a=s.store.create({seasonId:'a'});const seat=s.store.join(a.view.room.code,{name:'A'});const b=s.store.create({seasonId:'b'});
  expect(()=>s.store.join(b.view.room.code,{name:'A',participantToken:seat.participantToken})).toThrow(/credential/i);
  expect(()=>s.store.host(a.view.room.code,{hostToken:seat.participantToken,action:'start'})).toThrow(/host credential/i);
  expect(s.store.view(a.view.room.code).room.phase).toBe('lobby');expect(()=>s.store.create({speed:5})).toThrow(/speed/i);
 });
});
