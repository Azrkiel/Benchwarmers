import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartyStateResponse } from '@shared/types';
import { panelBounds, type OverlaySide } from './placement';
import type { PartyReader } from './liveSource';
import { overlayStyles } from './styles';

export function CrewOverlay({read,width,height,hostBusy=false,onHide}: {
  read:PartyReader; width:number; height:number; hostBusy?:boolean; onHide?:()=>void;
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
    setState(undefined);setError('');void tick();
    const timer=setInterval(()=>void tick(),1000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[read,retry]);
  useEffect(()=>{if(hostBusy) setOpen(false);},[hostBusy]);
  useEffect(()=>{
    if(open) closeButton.current?.focus();
    else if(restoreLauncher.current){launcher.current?.focus();restoreLauncher.current=false;}
  },[open]);
  const bounds=panelBounds(width,height,side);
  if (hostBusy || !bounds) return null;
  const selected=state?.standings.find(row=>row.memberId===member) ?? state?.standings[0];
  const question=state?.activeProp ?? state?.lastResolvedProp;
  const style={left:bounds.x,top:bounds.y,width:bounds.width,maxHeight:bounds.height};
  return <><style>{overlayStyles}</style><div className="bw-layer">
    {!open ? <button ref={launcher} className={`bw-launcher${error?' is-offline':''}`} style={{left:side==='right'?bounds.x+bounds.width-100:bounds.x,top:bounds.y}} aria-label="Open crew" onClick={()=>setOpen(true)}><span aria-hidden="true"/>Crew</button> :
      <section ref={panel} className="bw-panel" style={style} aria-label="Crew panel" onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
        const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current=buttons.indexOf(event.target as HTMLButtonElement);
        if(current<0)return;
        event.preventDefault();event.stopPropagation();
        buttons[Math.max(0,Math.min(buttons.length-1,current+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)))]?.focus();
      }}>
        <header className="bw-head"><h2>{state?.party.crewName ?? 'Your crew'}</h2><button ref={closeButton} onClick={close} aria-label="Close crew">×</button></header>
        <nav className="bw-nav" aria-label="Crew views">{(['standings','picks','roster'] as const).map(next=><button key={next} aria-pressed={view===next} onClick={()=>setView(next)}>{next==='standings'?'Standings':next==='picks'?'Picks':'Roster'}</button>)}</nav>
        <div className="bw-content">
          {error?<p className="bw-error" role="status">{state?'Updates interrupted. Showing the last data. ':''}{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:null}
          {!state&&!error?<p className="bw-small" role="status">Connecting to backend…</p>:null}
          {state&&view==='standings'?state.standings.map(row=><div className="bw-standing" key={row.memberId}><span className="bw-rank">{row.rank}</span><span className="bw-name">{row.name}</span><span className="bw-total">{row.total.toFixed(1)}</span></div>):null}
          {state&&view==='picks'?question?<><h3 className="bw-question">{question.question}</h3><p className="bw-small">{question.status==='open'?'Open for picks':question.status==='resolved'?'Resolved':'Picks locked'} · Submit from the control page</p>{question.options.map(option=><div className="bw-option" key={option.id}><span>{option.label}{question.correctOptionId===option.id?' ✓':''}</span><span>{question.pickCounts[option.id]??0} picks</span></div>)}</>:<p className="bw-small">No question open yet. Start the party from the control page.</p>:null}
          {state&&view==='roster'?<><div className="bw-roster-select">{state.standings.map(row=><button key={row.memberId} aria-pressed={row.memberId===selected?.memberId} onClick={()=>setMember(row.memberId)}>{row.name}</button>)}</div>{selected?.roster.length?selected.roster.map(row=>{const entry=state.draftBoard.find(item=>item.player.id===row.playerId);return <div key={row.playerId} className="bw-roster-row">{entry?.player.nickname??entry?.player.name??row.playerId}<strong>{row.points.toFixed(1)}</strong><div className="bw-small">{row.statLine}</div></div>;}):<p className="bw-small">No players drafted. Draft from the control page or start to fill the bench.</p>}</>:null}
        </div>
        <p className="bw-status">{state&&!error?'Backend connected · Fictional game':error?'Backend unavailable':'Connecting'}{state?` · ${state.party.code} · v${state.version}`:''}</p>
        <footer className="bw-foot"><button onClick={()=>setSide(current=>current==='right'?'left':'right')}>Move {side==='right'?'left':'right'}</button>{onHide?<button onClick={onHide}>Hide overlay</button>:null}</footer>
      </section>}
  </div></>;
}
