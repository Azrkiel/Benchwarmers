import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fitScale, STAGE_H, STAGE_W } from '../tv-broadcast/Stage';
import { parseFixtureMode, usePartyState } from '../lib/usePartyState';
import { BenchMark, LoungeIcon, Seats, type LoungeView } from './LoungeElements';
import { Draft, Picks, Results, RosterDialog, Tonight } from './LoungeViews';
import { useLoungeRemote } from './useLoungeRemote';
import './lounge.css';

const VIEWS: { id: LoungeView; label: string }[] = [{ id: 'tonight', label: 'Tonight' }, { id: 'picks', label: 'Picks' }, { id: 'crew', label: 'The crew' }, { id: 'draft', label: 'The draft' }, { id: 'final', label: 'Results' }];
const fit = () => fitScale(window.innerWidth || STAGE_W, window.innerHeight || STAGE_H);

export function LoungePage() {
  const { code = 'latest' } = useParams();
  const [params] = useSearchParams();
  const fixture = parseFixtureMode(params.get('fixture'));
  const { state, error, serverNow } = usePartyState(code, { fixture, crew: params.get('crew') || undefined });
  const forced = VIEWS.find((item) => item.id === params.get('view'))?.id ?? 'tonight';
  const [view, setView] = useState<LoungeView>(forced);
  const [memberId, setMemberId] = useState<string>();
  const [focusId, setFocusId] = useState(`lg-nav-${forced}`);
  const [scale, setScale] = useState(fit);
  const [, tick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const origin = useRef<string | undefined>(undefined);
  const lastFocus = useRef<string | undefined>(undefined);

  useEffect(() => {
    const resize = () => setScale(fit());
    window.addEventListener('resize', resize);
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => { window.removeEventListener('resize', resize); clearInterval(timer); };
  }, []);
  useEffect(() => { setView(forced); setMemberId(undefined); setFocusId(`lg-nav-${forced}`); }, [forced, code]);
  useEffect(() => {
    if (view === 'final' && state && state.party.status !== 'final') { setView('tonight'); setFocusId('lg-nav-tonight'); }
    if (memberId && state && !state.standings.some((member) => member.memberId === memberId)) { setMemberId(undefined); setFocusId(`lg-nav-${view}`); }
  }, [view, memberId, state]);
  useLayoutEffect(() => {
    const requested = document.getElementById(focusId);
    (requested ?? root.current?.querySelector<HTMLElement>('[aria-current="page"], [data-lg-row]'))?.focus();
  }, [focusId, view, memberId, !!state]);
  useLayoutEffect(() => {
    if (document.activeElement !== document.body || !state) return;
    const remembered = lastFocus.current ? document.getElementById(lastFocus.current) : null;
    (remembered ?? root.current?.querySelector<HTMLElement>('[aria-current="page"]'))?.focus();
  }, [state]);

  const navigate = (next: LoungeView, from?: string) => { origin.current = from; setView(next); setMemberId(undefined); setFocusId(`lg-nav-${next}`); };
  const closeRoster = () => { const target = memberId ? `lg-seat-${memberId}` : `lg-nav-${view}`; setMemberId(undefined); setFocusId(target); };
  const back = () => {
    if (memberId) { closeRoster(); return true; }
    if (view !== 'tonight') { const target = origin.current ?? 'lg-nav-tonight'; origin.current = undefined; setView('tonight'); setFocusId(target); return true; }
    if ((document.activeElement as HTMLElement | null)?.dataset.lgRow !== 'nav') { setFocusId('lg-nav-tonight'); root.current?.querySelector<HTMLElement>('#lg-nav-tonight')?.focus(); return true; }
    return false;
  };
  useLoungeRemote(root, back);
  const openMember = (id: string) => { setMemberId(id); setFocusId('lg-close-roster'); };
  const preserved = new URLSearchParams(params);
  preserved.delete('view');
  if (view !== 'tonight') preserved.set('mode', view === 'crew' ? 'rosters' : view);
  const scorebookUrl = `/tv2/${encodeURIComponent(code)}${preserved.size ? `?${preserved}` : ''}`;
  const available = VIEWS.filter((item) => item.id !== 'final' || state?.party.status === 'final');
  return <div ref={root} className="lg-viewport" onFocusCapture={(event) => { lastFocus.current = (event.target as HTMLElement).id; }}><div className="lg-stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(${scale.offsetX}px, ${scale.offsetY}px) scale(${scale.scale})` }}>
    {!state ? <section className="lg-connection" role="status"><BenchMark /><span className="lg-eyebrow">Benchwarmers · Lounge</span><h1>{error ? 'We can’t reach your game night.' : 'Pulling up a seat.'}</h1><p>{error ? 'Check your party code and connection. We’ll keep trying automatically.' : `Connecting to party ${code.toUpperCase()}…`}</p><Link className="lg-primary lg-focus" id="lg-connection-link" data-lg-row="nav" to={scorebookUrl}>Open the scorebook version</Link></section> : <>
      <div className="lg-shell" inert={!!memberId}>
        <aside className="lg-sidebar"><div className="lg-brand"><BenchMark /><span>bench<br />warmers<span className="lg-brand-period">.</span></span></div>
          <nav aria-label="Lounge views">{available.map((item) => <button className="lg-nav-item lg-focus" type="button" id={`lg-nav-${item.id}`} data-lg-row="nav" aria-current={view === item.id ? 'page' : undefined} key={item.id} onClick={() => navigate(item.id)}><LoungeIcon name={item.id} />{item.label}<i aria-hidden="true" /></button>)}</nav>
          <div className="lg-sidebar-bottom"><div className="lg-party"><span>Your party</span><b>{state.party.code}</b></div><Link className="lg-version-link lg-focus" id="lg-version-link" data-lg-row="nav" to={scorebookUrl} aria-label="Scorebook version">Scorebook version<LoungeIcon name="arrow" /></Link><span className="lg-version-label">Lounge · design B</span></div>
        </aside>
        <div className="lg-main"><header className="lg-header"><div><span>{state.party.crewName}</span><strong>{view === 'tonight' ? 'Game night' : VIEWS.find((item) => item.id === view)?.label}</strong></div><div className="lg-score-bug"><span className="lg-game-status"><i />{fixture ? 'Sample game' : state.party.status === 'live' ? 'Live game' : state.party.status === 'final' ? 'Final' : 'Pre-game'}</span>{view !== 'tonight' ? <b>{state.game.home.short} {state.game.home.score}<span> — </span>{state.game.away.score} {state.game.away.short}</b> : <b>{state.game.clock}</b>}</div></header>
          <main className={`lg-content is-${view}`}>{view !== 'tonight' ? <button className="lg-return lg-focus" id="lg-return" type="button" data-lg-row="0" onClick={() => back()}><LoungeIcon name="back" />Back to tonight</button> : null}
            {view === 'tonight' ? <Tonight state={state} now={serverNow()} onNavigate={navigate} onMember={openMember} /> : null}
            {view === 'picks' ? <Picks state={state} now={serverNow()} /> : null}
            {view === 'crew' ? <Seats state={state} full onMember={openMember} /> : null}
            {view === 'draft' ? <Draft state={state} /> : null}
            {view === 'final' ? <Results state={state} /> : null}
          </main>
          <footer className="lg-footer"><span>{state.households.length} homes, one game night.</span><span><kbd>↑↓←→</kbd> Move <kbd>OK</kbd> Open <kbd>↩</kbd> Back</span></footer>
        </div>
      </div>
      {memberId ? <RosterDialog memberId={memberId} state={state} onClose={closeRoster} /> : null}
      {error ? <div className="lg-network" role="status">Connection interrupted. Keeping the last update while we reconnect.</div> : null}
    </>}
  </div></div>;
}
