import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCountdown, lockDeadline, secondsLeft, usePartyState } from '../lib/usePartyState';
import { CrewOverlay } from '../overlay/CrewOverlay';
import { readParty } from '../overlay/liveSource';
import './control.css';
import { BrandLockup } from '../brand/Brand';

export function ControlPage(){
  const {code='latest'}=useParams();
  const navigate=useNavigate();
  const {state,error,code:resolved,retry,serverNow}=usePartyState(code);
  const [clockTick,setClockTick]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setClockTick(t=>t+1),250);return()=>clearInterval(timer);},[]);
  void clockTick;
  const [member,setMember]=useState('maya');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [failure,setFailure]=useState('');
  const canvas=useRef<HTMLDivElement>(null);
  const [canvasSize,setCanvasSize]=useState({width:960,height:540});
  const members=state?.households.flatMap(household=>household.members)??[];
  useEffect(()=>{if(members.length&&!members.some(item=>item.id===member))setMember(members[0].id);},[state?.party.id,members,member]);
  const read=useCallback(()=>readParty(resolved),[resolved]);
  useEffect(()=>{
    const element=canvas.current;
    if(!element)return;
    const update=()=>{const bounds=element.getBoundingClientRect();if(bounds.width&&bounds.height)setCanvasSize({width:bounds.width,height:bounds.height});};
    update();
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);
    observer?.observe(element);window.addEventListener('resize',update);
    return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[state?.party.id]);
  async function mutate(action:string,body:unknown,message:string){
    if(busy)return;
    setBusy(true);setFailure('');setNotice('');
    try{await api.post(`/parties/${encodeURIComponent(resolved)}/${action}`,body);setNotice(message);}
    catch(e){setFailure(e instanceof Error?e.message:'Request failed.');}
    finally{setBusy(false);}
  }
  const question=state?.activeProp;
  const picked=state?.picks.find(pick=>pick.memberId===member&&pick.propId===question?.id);
  const drafting=state?.party.status==='drafting';
  const left=state?secondsLeft(lockDeadline(state),serverNow()):0;
  const selectedName=members.find(person=>person.id===member)?.name;
  const incomplete=members.filter(person=>(state?.draftBoard.filter(entry=>entry.ownerMemberId===person.id).length??0)<3).length;
  const rosterCount=state?.draftBoard.filter(entry=>entry.ownerMemberId===member).length??0;
  return <main className="ctrl-page">
    <header><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={26} /></Link><span>Overlay controls</span><Link to={`/tv/${encodeURIComponent(resolved)}`}>TV view</Link></header>
    <div className="ctrl-heading"><div><p className="ctrl-eyebrow">Fictional game replay · Not synchronized to YouTube</p><h1>Overlay controls</h1></div><button disabled={busy} onClick={async()=>{
      setBusy(true);setFailure('');
      try{const result=await api.post<{code:string}>('/parties',{crewId:'sunday-crew'});setNotice('New party ready.');navigate(`/control/${result.code}`);}
      catch(e){setFailure(e instanceof Error?e.message:'Could not create party.');}finally{setBusy(false);}
    }}>New party</button></div>
    {(error||failure)?<p role="alert" className="ctrl-error">{failure?'Could not save that action. Try again.':state?'Reconnecting · Showing last update':'Can’t connect to the game.'} <button type="button" onClick={retry}>Retry connection</button> <Link to="/">Home / Edit code</Link></p>:null}
    {notice?<p role="status" className="ctrl-notice">{notice}</p>:null}
    {!state?<p role="status">Connecting to game…</p>:<>
      <section className="ctrl-session"><div><span>Party code</span><strong>{state.party.code}</strong></div><div><span>Game status</span><strong>{drafting?'Pregame':state.party.status==='final'?'Final':'Replay playing'}</strong></div><div><span>Game clock</span><strong>{state.game.clock}</strong></div>{drafting?<div className="ctrl-start"><p>Starting fills incomplete rosters automatically ({incomplete} players). Replay lasts about {Math.ceil(state.game.durationSec/state.speed/60)} minutes.</p><button disabled={busy} onClick={()=>void mutate('start',{},'Replay started.')}>Start game replay</button></div>:<p>{state.party.status==='final'?'Replay finished. Create a new party to play again.':'Replay playing'} · {state.speed}× speed</p>}</section>
      <section className="ctrl-player"><label htmlFor="ctrl-member">Player</label><select id="ctrl-member" value={member} onChange={event=>{setMember(event.target.value);setNotice('');}}>{members.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select><p>Actions apply to {selectedName??'the selected player'}</p></section>
      <div className="ctrl-columns"><section className="ctrl-card">
        {state.party.status!=='final'&&!drafting?<>
        <h2>Make a pick</h2>{question?<><h3>{question.question}</h3><p>{question.status==='open'&&left>0?`Closes in ${formatCountdown(left)}`:'Picks locked · Result pending'}</p><div className="ctrl-options">{question.options.map(option=><button key={option.id} aria-label={`Choose ${option.label}`} aria-pressed={picked?.optionId===option.id} disabled={busy||question.status!=='open'||left<=0||!member} onClick={()=>void mutate('picks',{memberId:member,propId:question.id,optionId:option.id,source:'screen'},`Pick saved for ${selectedName??member}: ${option.label}`)}>{option.label}<span>{question.pickCounts[option.id]??0} picks</span></button>)}</div>{picked?<p>Your pick: {picked.optionLabel}</p>:null}</>:<p>No open pick · Waiting for next pick</p>}</>:null}
        <h2>{state.party.status==='final'?'Results':'Standings'}</h2>{state.standings.map(row=><div className="ctrl-ranking" key={row.memberId}><span>{row.rank}. {row.name}</span><strong>{row.total.toFixed(1)} pts</strong></div>)}
      </section>{drafting?<section className="ctrl-card"><h2>Draft for {members.find(person=>person.id===member)?.name}</h2><p>{rosterCount}/3 players · {drafting?'Choose three players before starting.':'Roster set for this replay.'}</p><div className="ctrl-draft">{state.draftBoard.map(entry=><button key={entry.player.id} disabled={busy||!drafting||!!entry.ownerMemberId||rosterCount>=3} onClick={()=>void mutate('draft',{memberId:member,playerId:entry.player.id},`Drafted ${entry.player.nickname??entry.player.name}.`)}><strong>{entry.player.nickname??entry.player.name}</strong><span>{entry.player.position} · {entry.teamShort}</span><small>{entry.ownerName?`Drafted by ${entry.ownerName}`:'Available'}</small></button>)}</div></section>:null}</div>
      <section className="ctrl-preview"><h2>Overlay preview</h2><p>Preview of the crew panel</p><div ref={canvas} className="ctrl-canvas"><CrewOverlay read={read} width={canvasSize.width} height={canvasSize.height}/></div></section>
    </>}
    <footer><details><summary>Setup and diagnostics</summary><p>Install the unpacked extension from <code>Benchwarmers/extension/dist</code>, open a video on youtube.com, then enable it from its toolbar popup.</p><p>Version {state?.version ?? '—'}</p>{error||failure?<p>{failure||error}</p>:null}<p>Development server: <code>npm run dev:overlay -w server</code></p></details></footer>
  </main>;
}
