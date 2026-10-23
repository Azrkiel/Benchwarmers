import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartyStateResponse } from '@shared/types';
import { panelBounds, type OverlaySide } from './placement';
import type { PartyReader } from './liveSource';
import { overlayStyles } from './styles';

export function CrewOverlay({read,width,height,hostBusy=false,onHide,controlsBase=''}: {
  read:PartyReader; width:number; height:number; hostBusy?:boolean; onHide?:()=>void; controlsBase?:string;
}) {
  const [state,setState]=useState<PartyStateResponse>();
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const [side,setSide]=useState<OverlaySide>('right');
  const [view,setView]=useState<'standings'|'picks'|'roster'>('standings');
  const [member,setMember]=useState('');
  const [retry,setRetry]=useState(0);
  const launcher=useRef<HTMLButtonElement>(null);
  const restoreLauncher=useRef(false);
  const closeButton=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLElement>(null);
  const close=useCallback(()=>{restoreLauncher.current=true;setOpen(false);},[]);
  useEffect(()=>{
    let cancelled=false, busy=false;
    const tick=async()=>{
      if (busy) return;
      busy=true;
      try { const next=await read(); if (!cancelled) {setState(next);setError('');} }
      catch (e) {if(!cancelled) setError(e instanceof Error ? e.message : 'Backend unavailable.');}
      finally {busy=false;}
    };
    setError('');void tick();
    const timer=setInterval(()=>void tick(),1000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[read,retry]);
  useEffect(()=>{setState(undefined);},[read]);
  useEffect(()=>{if(state&&!state.standings.some(row=>row.memberId===member))setMember(state.standings[0]?.memberId??'');},[state,member]);
  useEffect(()=>{if(hostBusy) setOpen(false);},[hostBusy]);
  useEffect(()=>{
    if(open) closeButton.current?.focus();
    else if(restoreLauncher.current){launcher.current?.focus();restoreLauncher.current=false;}
  },[open]);
  const bounds=panelBounds(width,height,side);
  if (hostBusy) return null;
  const controls=`${controlsBase}/control/${encodeURIComponent(state?.party.code??'latest')}`;
  const compact=!bounds || bounds.height < 300;
  const area=bounds??{x:Math.max(8,width*.05),y:Math.max(8,height*.12),width:Math.min(width*.9,320),height:Math.max(100,height*.65)};
  const selected=state?.standings.find(row=>row.memberId===member) ?? state?.standings[0];
  const question=state?.activeProp ?? state?.lastResolvedProp;
  const style={left:area.x,top:area.y,width:area.width,maxHeight:area.height};
  return <><style>{overlayStyles}</style><div className="bw-layer">
    {!open ? <button ref={launcher} className={`bw-launcher${error?' is-offline':''}`} style={{left:side==='right'?Math.max(8,width-width*.05-132):area.x,top:area.y}} aria-label="Open crew standings" onClick={()=>setOpen(true)}><span aria-hidden="true"/>Crew{error?<small>Unavailable</small>:null}</button> : compact ? <section className="bw-panel bw-compact" style={style} aria-label="Crew panel" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}><header className="bw-head"><h2>Small player</h2><button ref={closeButton} type="button" onClick={close} aria-label="Close crew">×</button></header><a className="bw-control-link" href={controls} target="_blank" rel="noreferrer">Open controls</a></section> :
      <section ref={panel} className="bw-panel" style={style} aria-label="Crew panel" onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
        if(!['ArrowLeft','ArrowRight'].includes(event.key)||!(event.target instanceof HTMLButtonElement)||!event.target.closest('.bw-nav')) return;
        const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('.bw-nav button')];
        const current=buttons.indexOf(event.target as HTMLButtonElement);
        if(current<0)return;
        event.preventDefault();event.stopPropagation();
        buttons[(current+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length]?.focus();
      }}>
        <header className="bw-head"><div><span className="bw-brand">Benchwarmers</span><h2>{state?.party.crewName ?? 'Crew standings'}</h2></div><button ref={closeButton} onClick={close} aria-label="Close crew">×</button></header>
        {!compact?<nav className="bw-nav" aria-label="Crew views">{(['standings','picks','roster'] as const).map(next=><button key={next} aria-pressed={view===next} onClick={()=>setView(next)}>{next==='standings'?'Standings':next==='picks'?'Picks':'Roster'}</button>)}</nav>:null}
        <div className="bw-content">
          {error?<p className="bw-error" role="status">{state?'Updates paused · Showing the last data.':'Game unavailable.'} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:null}
          {!state&&!error?<p className="bw-small" role="status">Connecting to game…</p>:null}
          {compact?<p className="bw-small">Open controls to view standings and make picks in this small player.</p>:null}
          {!compact&&state&&view==='standings'?<><p className="bw-small bw-columns"><span>Player</span><span>Total pts</span></p>{state.standings.map(row=><div className="bw-standing" key={row.memberId}><span className="bw-rank">{row.rank}</span><span className="bw-name">{row.name}</span><span className="bw-total">{row.total.toFixed(1)}</span></div>)}</>:null}
          {!compact&&state&&view==='picks'?question?<><h3 className="bw-question">{question.question}</h3><p className="bw-small">{question.status==='open'?'Open for picks':question.status==='resolved'?'Resolved':'Picks locked'}</p>{question.options.map(option=><div className="bw-option" key={option.id}><span>{option.label}{question.correctOptionId===option.id?' ✓':''}</span><span>{question.pickCounts[option.id]??0} picks</span></div>)}</>:<p className="bw-small">No open pick</p>:null}
          {!compact&&state&&view==='roster'?<><h3 className="bw-question">{selected?.name?`${selected.name}’s roster`:'Roster'}</h3><div className="bw-roster-select">{state.standings.map(row=><button key={row.memberId} aria-pressed={row.memberId===selected?.memberId} onClick={()=>setMember(row.memberId)}>{row.name}</button>)}</div>{selected?.roster.length?selected.roster.map(row=>{const entry=state.draftBoard.find(item=>item.player.id===row.playerId);return <div key={row.playerId} className="bw-roster-row">{entry?.player.nickname??entry?.player.name??row.playerId}<strong>{row.points.toFixed(1)}</strong><div className="bw-small">{row.statLine}</div></div>;}):<p className="bw-small">No players drafted</p>}</>:null}
        </div>
        <p className="bw-status">{state?`Replay · Party ${state.party.code}`:error?'Updates unavailable':'Connecting'}</p>
        {error?<details className="bw-diagnostics"><summary>Connection details</summary>{error}</details>:null}
        <footer className="bw-foot"><a className="bw-control-link" href={controls} target="_blank" rel="noreferrer">{view==='picks'?'Open picks':'Open controls'}</a><button onClick={()=>setSide(current=>current==='right'?'left':'right')}>Move {side==='right'?'left':'right'}</button>{onHide?<button onClick={onHide}>Hide</button>:null}</footer>
      </section>}
  </div></>;
}
