import { RoomError, type RoomStore } from './store.js';
import type { RoomView } from './types.js';

export type RoomUtterance = { text: string; participantToken?: string; hostToken?: string };

/** Offline room commands use the exact same server validation as screen and MCP actions. */
export function answerRoom(store: RoomStore, code: string, request: RoomUtterance): {reply: string; view: RoomView} {
  const text = request.text.toLowerCase().replace(/^\s*(hey\s+)?alexa[,!.\s]*/, '').trim();
  const participantToken = request.participantToken ?? '';
  let view = store.view(code, request.participantToken);
  const result = (reply: string) => ({reply, view});
  const host = (action: 'start'|'pause'|'resume'|'set_speed', speed?:number) => {
    view=store.host(code,{hostToken:request.hostToken??'',action,speed});
    if(request.participantToken) view=store.view(code,request.participantToken);
  };
  if (/\b(kick ?off|start (the )?(game|replay)|let'?s go)\b/.test(text)) { host('start');return result('Kickoff! Lineups are locked. Call the drive before the snap.'); }
  if (/\b(resume|unpause|keep going)\b/.test(text)) { host('resume');return result('The replay is running again.'); }
  if (/\bpause\b/.test(text)) { host('pause');return result('Replay paused. Your prediction window is paused too.'); }
  const speed=text.match(/\b(?:speed|replay)\b.*?\b([1-4])\s*x?\b/);
  if(speed){host('set_speed',Number(speed[1]));return result(`Replay speed is ${speed[1]} times.`);}
  if (/\b(sleepers?|auto ?lineup|make my|build my|pick my|choose.*for me|stars|balanced)\b/.test(text)) {
    const style=/sleeper|value|cheap/.test(text)?'value':/star/.test(text)?'stars':'balanced';
    view=store.autoLineup(code,{participantToken,style});return result('Your lineup is saved: one captain and four flex players, within the salary cap.');
  }
  const captain=text.match(/(?:make|set)\s+(.+?)\s+(?:my|the)\s+captain|^captain\s+(.+)/);
  if(captain){
    const name=(captain[1]??captain[2]).replace(/[.!?]+$/,'').trim();
    const players=view.players.filter(p=>p.name.toLowerCase()===name || p.id===name);
    if(players.length!==1) return result('Say the full player name for your captain.');
    const lineup=view.me?.lineup;
    if(!lineup) return result('Build your lineup first. Say pick sleepers for me.');
    const ids=[lineup.captainId,...lineup.flexIds];
    const flexIds=ids.includes(players[0].id)?ids.filter(id=>id!==players[0].id):lineup.flexIds;
    view=store.setLineup(code,{participantToken,captainId:players[0].id,flexIds});return result(`${players[0].name} is your captain.`);
  }
  if(/\b(season|all time|all-time)\b/.test(text)){
    const leader=view.season.standings[0];return result(leader?`${leader.name} leads the season with ${leader.points} points.`:'This season has no completed nights yet.');
  }
  if(/\b(leaderboard|standings|who'?s leading|who is leading|who'?s winning|who is winning)\b/.test(text)){
    const leader=view.standings[0];return result(leader?`${leader.name} leads with ${leader.total} points.`:'Nobody has joined this room yet.');
  }
  if(/\b(my rank|my points|my captain|my lineup|my status|how am i|how'?s my|how is my)\b/.test(text)){
    if(!view.me)throw new RoomError(401,'UNAUTHORIZED','Join this room before asking for your status.');
    const own=view.standings.find(p=>p.participantId===view.me!.participantId)!;
    return result(`${own.name}, you are number ${own.rank} of ${view.room.participantCount} with ${own.total} points.`);
  }
  const q=view.question;
  let choice: string|undefined;
  if(q && !/^(how|what|who|when|is|are|did|does)\b/.test(text)){
    const words:Record<string,RegExp>={TD:/\b(touchdown|td|touch down)\b/,FG:/\b(field goal|fg|three points)\b/,PUNT:/\bpunt\b/,TURNOVER:/\b(turnover|fumble|interception|picked off|downs)\b/,yes:/\b(yes|they will|will score)\b/,no:/\b(no|they won'?t|will not|won'?t score)\b/,over:/\bover\b/,under:/\bunder\b/};
    choice=q.options.some(o=>o.id==='no') && words.no.test(text) ? 'no' : q.options.find(o=>words[o.id]?.test(text) || text===o.label.toLowerCase())?.id;
  }
  if(q && choice){
    view=store.pick(code,{participantToken,questionId:q.id,optionId:choice});
    return result(`Locked in ${q.options.find(o=>o.id===choice)!.label}. Good call!`);
  }
  if(/\b(score|quarter|clock|what happened|what'?s happening)\b/.test(text)){
    return result(`${view.game.home.name} ${view.game.home.score}, ${view.game.away.name} ${view.game.away.score}. ${view.game.clock}. ${view.game.situation}`);
  }
  return result(q ? `Try ${q.options.map(o=>`“${o.label}”`).join(', ')}, “pick sleepers for me”, or “what's my rank?”` : 'Try “pick sleepers for me”, “what’s my rank?”, or “what’s the score?”');
}
