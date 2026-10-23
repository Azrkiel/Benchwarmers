import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import './watch.css';
import { parseFixtureMode, usePartyState } from '../lib/usePartyState';
import { BrandLockup } from '../brand/Brand';

const DEMO_VIDEO = 'lsZDzZbO_aY';
const PANELS = ['picks', 'standings', 'rosters', 'draft'] as const;
const LABELS = ['Picks', 'Standings', 'Rosters', 'Draft'];
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/')[1]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
        ? url.pathname === '/watch' ? url.searchParams.get('v')
          : /^\/(live|embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
        : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Video and replay data remain independent; companion content is read-only. */
export function WatchPage() {
  const { code = 'DEMO' } = useParams();
  const [params] = useSearchParams();
  const fixture = parseFixtureMode(params.get('fixture'));
  const party = usePartyState(code, { fixture, crew: params.get('crew') ?? undefined });
  const state = party.state;
  const [video, setVideo] = useState(youtubeId(params.get('video') || '') || DEMO_VIDEO);
  const [source, setSource] = useState(`https://www.youtube.com/watch?v=${video}`);
  const [mode, setMode] = useState<(typeof PANELS)[number] | null>(null);
  const [menu, setMenu] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [loading, setLoading] = useState(true);
  const player = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if(mode) player.current?.querySelector<HTMLButtonElement>('.watch-panel header button')?.focus(); }, [mode]);
  const closePanel = () => {setMode(null);panelTrigger.current?.focus();};
  const controls = `/control/${encodeURIComponent(state?.party.code ?? party.code)}`;
  const question = state?.activeProp ?? state?.lastResolvedProp;
  return <main className="watch-page">
    <header className="watch-header"><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={26} /></Link><span>Watch preview</span><Link to={controls}>Open controls</Link></header>
    <div className="watch-player" ref={player} onKeyDown={event => {
      if (event.key !== 'Escape' && event.key !== 'BrowserBack') return;
      if (mode) {event.preventDefault();event.stopPropagation();closePanel();}
      else if (menu) {event.preventDefault();setMenu(false);launcher.current?.focus();}
      else if (document.fullscreenElement) {void document.exitFullscreen();}
    }}>
      <div className="watch-screen">
        <iframe key={video} className="watch-video" title="YouTube video" src={`https://www.youtube.com/embed/${video}?playsinline=1&rel=0&fs=0`} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setLoading(false)} onError={() => {setLoading(false);setPlayerError('Video unavailable. Open on YouTube or change the video below.');}} />
        <span className="watch-sample">{fixture ? 'Demo replay' : 'Replay data'} · Not synced to video</span>
        <button ref={launcher} type="button" className="watch-launcher" aria-expanded={menu} aria-controls="watch-dock" onClick={() => {if(menu) setMode(null);setMenu(current => !current);}}>Crew panels</button>
        {mode ? <section className="watch-panel" aria-label="Companion panel" tabIndex={-1}>
          <header><h2>{LABELS[PANELS.indexOf(mode)]}</h2><button type="button" aria-label="Close panel" onClick={closePanel}>×</button></header>
          <div className="watch-panel-content">
          {party.error ? <p role="status">{state ? 'Reconnecting · Showing last update' : 'Game unavailable'} <button type="button" onClick={party.retry}>Retry</button></p> : null}
          {!state && !party.error ? <p role="status">Connecting to game…</p> : null}
          {state && mode === 'picks' ? question ? <><h3>{question.question}</h3><p>{question.status === 'open' ? 'Open pick' : question.status === 'resolved' ? 'Result' : 'Picks locked'}</p>{question.options.map(option => <div className="watch-data-row" key={option.id}><span>{option.label}{question.correctOptionId === option.id ? ' ✓ Correct' : ''}</span><span>{question.pickCounts[option.id] ?? 0} picks</span></div>)}</> : <p>{state.party.status === 'final' ? 'Final' : 'No open pick'}</p> : null}
          {state && mode === 'standings' ? <><p className="watch-data-label">Player / Total pts</p>{state.standings.map(row => <div className="watch-data-row" key={row.memberId}><span>{row.rank}. {row.name}</span><strong>{row.total.toFixed(1)}</strong></div>)}</> : null}
          {state && mode === 'rosters' ? state.standings.map(row => <section key={row.memberId}><h3>{row.name}</h3>{row.roster.length ? row.roster.map(item => <div className="watch-data-row" key={item.playerId}><span>{state.draftBoard.find(entry => entry.player.id === item.playerId)?.player.name ?? item.playerId}</span><strong>{item.points.toFixed(1)} pts</strong></div>) : <p>No players drafted</p>}</section>) : null}
          {state && mode === 'draft' ? <>{state.party.status !== 'drafting' ? <p>Draft closed</p> : null}{state.draftBoard.map(entry => <div className="watch-data-row" key={entry.player.id}><span>{entry.player.nickname ?? entry.player.name}<small>{entry.player.position} · {entry.teamShort}</small></span><span>{entry.ownerName ? `Drafted by ${entry.ownerName}` : 'Available'}</span></div>)}</> : null}
          </div><footer><Link to={controls}>{mode === 'picks' ? 'Make a pick' : 'Open controls'}</Link></footer>
        </section> : null}
      </div>
      <nav id="watch-dock" className="watch-dock" aria-label="Overlay controls" hidden={!menu}>
        {PANELS.map((panel, i) => <button key={panel} type="button" aria-pressed={mode === panel} onClick={event => {panelTrigger.current=event.currentTarget;setMode(current => current === panel ? null : panel);}}>{LABELS[i]}</button>)}
        <button type="button" onClick={() => {
          setPlayerError('');
          if (!document.fullscreenElement && !player.current?.requestFullscreen) {setPlayerError('Fullscreen isn’t available here.');return;}
          const action = document.fullscreenElement ? document.exitFullscreen() : player.current?.requestFullscreen();
          action?.catch(() => setPlayerError('Fullscreen isn’t available here.'));
        }}>Fullscreen</button><Link to={controls}>Open controls</Link>
      </nav>
      {playerError ? <p role="alert" className="watch-player-error">{playerError} <button type="button" onClick={() => {if(document.fullscreenElement) void document.exitFullscreen();setPlayerError('');}}>Watch in window</button></p> : null}
    </div>
    <section className="watch-setup" aria-label="Video source">
      <div><h1>Watch with your crew</h1><p>Replay data does not synchronize video playback. Use controls to draft and make picks.</p>{loading ? <p role="status">Loading video…</p> : null}<p>If playback is unavailable, <a href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noreferrer">Open on YouTube</a> or change the video.</p></div>
      <form onSubmit={event => {event.preventDefault();const next=youtubeId(source);if(!next){setFieldError('Paste a supported YouTube link.');return;}setFieldError('');setPlayerError('');setLoading(true);setVideo(next);}}>
        <label htmlFor="watch-source">YouTube link</label><div className="watch-source-row"><input id="watch-source" value={source} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'watch-field-error' : undefined} onChange={event => setSource(event.target.value)} /><button type="submit">Load video</button></div>
        {fieldError ? <p id="watch-field-error" role="alert">{fieldError}</p> : null}
      </form>
    </section>
  </main>;
}
