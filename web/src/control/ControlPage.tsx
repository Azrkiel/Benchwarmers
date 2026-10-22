import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { usePartyState } from '../lib/usePartyState';
import { CrewOverlay } from '../overlay/CrewOverlay';
import { readParty } from '../overlay/liveSource';
import './control.css';

export function ControlPage(){
  const {code='latest'}=useParams();
  const navigate=useNavigate();
  const {state,error,code:resolved}=usePartyState(code);
  const [member,setMember]=useState('maya');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [failure,setFailure]=useState('');
  const canvas=useRef<HTMLDivElement>(null);
  const [canvasSize,setCanvasSize]=useState({width:960,height:540});
  const members=state?.households.flatMap(household=>household.members)??[];
  useEffect(()=>{if(members.length&&!members.some(item=>item.id===member))setMember(members[0].id);},[state?.party.id]);
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
  const rosterCount=state?.draftBoard.filter(entry=>entry.ownerMemberId===member).length??0;
  return <main className="ctrl-page">
    <header><Link to="/">Benchwarmers</Link><span>Live backend control</span><Link to={`/lounge/${encodeURIComponent(resolved)}`}>Open Lounge ↗</Link></header>
    <div className="ctrl-heading"><div><p className="ctrl-eyebrow">Fictional game replay · Not synchronized to YouTube</p><h1>Your game-night controls.</h1><p>These actions go to the running server. The YouTube extension reads the same party.</p></div><button disabled={busy} onClick={async()=>{
      setBusy(true);setFailure('');
      try{const result=await api.post<{code:string}>('/parties',{crewId:'sunday-crew'});setNotice('New party created. Set the extension to latest or use the code below.');navigate(`/control/${result.code}`);}
      catch(e){setFailure(e instanceof Error?e.message:'Could not create party.');}finally{setBusy(false);}
    }}>New party</button></div>
    {(error||failure)?<p role="alert" className="ctrl-error">{failure||error} {!state?'Start the backend with npm run dev:overlay -w server.':''}</p>:null}
    {notice?<p role="status" className="ctrl-notice">{notice}</p>:null}
    {!state?<p role="status">Connecting to backend…</p>:<>
      <section className="ctrl-session"><div><span>Party code</span><strong>{state.party.code}</strong></div><div><span>Backend state</span><strong>{state.party.status}</strong></div><div><span>Game clock</span><strong>{state.game.clock}</strong></div><div><span>Version</span><strong>{state.version}</strong></div>{drafting?<button disabled={busy} onClick={()=>void mutate('start',{},'Game replay started. Backend scoring now advances automatically.')}>Start game replay</button>:<p>{state.party.status==='final'?'Replay finished. Create a new party to play again.':'Game engine running'} · {state.speed}× speed</p>}</section>
      <p className="ctrl-help">Starting fills any empty roster slots. Each replay lasts {Math.ceil(state.game.durationSec/state.speed/60)} minutes. The extension defaults to your crew’s latest party.</p>
      <div className="ctrl-columns"><section className="ctrl-card"><label htmlFor="ctrl-member">Act as</label><select id="ctrl-member" value={member} onChange={event=>setMember(event.target.value)}>{members.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select>
        <h2>Call the next play</h2>{question?<><h3>{question.question}</h3><p>{question.status==='open'?`Open · about ${Math.ceil(question.realSecondsToLock??0)} seconds left`:'Picks locked'}</p><div className="ctrl-options">{question.options.map(option=><button key={option.id} aria-label={`Choose ${option.label}`} aria-pressed={picked?.optionId===option.id} disabled={busy||question.status!=='open'} onClick={()=>void mutate('picks',{memberId:member,propId:question.id,optionId:option.id,source:'screen'},`${members.find(person=>person.id===member)?.name??member} chose ${option.label}. Watch the YouTube panel update.`)}>{option.label}<span>{question.pickCounts[option.id]??0} picks</span></button>)}</div>{picked?<p>Recorded choice: {picked.optionLabel}</p>:null}</>:<p>No question open. {drafting?'Start the game replay when ready.':'The next question will appear here automatically.'}</p>}
        <h2>Your crew</h2>{state.standings.map(row=><div className="ctrl-ranking" key={row.memberId}><span>{row.rank}. {row.name}</span><strong>{row.total.toFixed(1)} pts</strong></div>)}
      </section><section className="ctrl-card"><h2>Draft for {members.find(person=>person.id===member)?.name}</h2><p>{rosterCount}/3 players · {drafting?'Choose players, or let Start fill the bench.':'Roster set for this replay.'}</p><div className="ctrl-draft">{state.draftBoard.map(entry=><button key={entry.player.id} disabled={busy||!drafting||!!entry.ownerMemberId||rosterCount>=3} onClick={()=>void mutate('draft',{memberId:member,playerId:entry.player.id},`Drafted ${entry.player.nickname??entry.player.name}.`)}><strong>{entry.player.nickname??entry.player.name}</strong><span>{entry.player.position} · {entry.teamShort}</span><small>{entry.ownerName?`Drafted by ${entry.ownerName}`:'Available'}</small></button>)}</div></section></div>
      <section className="ctrl-preview"><h2>Same feed as the extension</h2><p>Open Crew below to confirm the API data. This is a test canvas, not video.</p><div ref={canvas} className="ctrl-canvas"><CrewOverlay read={read} width={canvasSize.width} height={canvasSize.height}/></div></section>
    </>}
    <footer>Install the unpacked extension from <code>Benchwarmers/extension/dist</code>, open a video on youtube.com, then enable it from its toolbar popup.</footer>
  </main>;
}
