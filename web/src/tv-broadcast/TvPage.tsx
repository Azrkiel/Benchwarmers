import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { SeasonResponse } from '@shared/types';
import { api } from '../lib/api';
import { seasonFixture } from '../lib/fixtures';
import { parseFixtureMode, usePartyState } from '../lib/usePartyState';
import { Stage } from './Stage';
import { DraftBoard } from './DraftBoard';
import { LiveView } from './LiveView';
import { RostersView } from './RostersView';
import { FinalView } from './FinalView';
import { useKiosk } from './kiosk';
import type { TvMode } from './modes';
import { ViewNav, type ViewChoice } from './ViewNav';
import './tv.css';
import { BrandLockup } from '../brand/Brand';

const FORCED: TvMode[] = ['draft', 'live', 'rosters', 'final', 'standings', 'picks'];

export function TvPage() {
  const { code: codeParam = 'latest' } = useParams();
  const [params] = useSearchParams();
  const fixture = parseFixtureMode(params.get('fixture'));
  const crew = params.get('crew') || undefined;
  const kioskParam = params.get('kiosk');
  const kiosk = !!kioskParam && kioskParam !== '0' && kioskParam !== 'false';
  const forced = FORCED.find((m) => m === params.get('mode'));
  const showControls = params.get('controls') !== '0';
  const overlay = params.get('overlay') === '1';
  useKiosk(kiosk);
  useEffect(() => {
    document.documentElement.classList.toggle('tv-overlay', overlay);
    return () => document.documentElement.classList.remove('tv-overlay');
  }, [overlay]);

  const { state, error, code, serverNow, retry } = usePartyState(codeParam, { fixture, crew });
  const [manualMode, setManualMode] = useState<TvMode | undefined>(forced);
  const status = state?.party.status;
  useEffect(() => { setManualMode(forced); }, [forced, state?.party.id]);
  const mode = manualMode ?? 'live';
  const contentRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (mode !== 'live' || !returnFocusRef.current) return;
    document.getElementById(returnFocusRef.current)?.focus();
    returnFocusRef.current = undefined;
  }, [mode]);
  const views: ViewChoice[] = [
    { mode: 'live', label: 'Game' },
    { mode: 'picks', label: 'Picks' },
    { mode: 'standings', label: 'Standings' },
    { mode: 'rosters', label: 'Rosters' },
    { mode: 'draft', label: 'Draft' },
    ...(status === 'final' ? [{ mode: 'final' as const, label: 'Results' }] : []),
  ];

  const [season, setSeason] = useState<SeasonResponse | undefined>(undefined);
  const [seasonError, setSeasonError] = useState(false);
  const [seasonAttempt, setSeasonAttempt] = useState(0);
  useEffect(() => {
    if (fixture || status !== 'final' || mode !== 'final') return;
    let cancelled = false;
    setSeason(undefined);
    setSeasonError(false);
    api.season(crew || 'sunday-crew').then(
      (s) => {
        if (!cancelled) setSeason(s);
      },
      () => { if (!cancelled) setSeasonError(true); },
    );
    return () => {
      cancelled = true;
    };
  }, [fixture, status, crew, state?.party.id, mode, seasonAttempt]);

  return (
    <Stage overlay={overlay}>
      {!state ? (
        <div className="tv-connecting" role="status">
          <BrandLockup size={96} />
          <div className="tv-connecting-text">Connecting to party {code.toUpperCase()}…</div>
          {error ? <><h1>Party unavailable</h1><p>Check party {code.toUpperCase()} and try again.</p><div className="tv-recovery"><button autoFocus className="tv-action" onClick={retry}>Retry</button><Link className="tv-action" to="/">Edit code</Link></div><details><summary>Connection details</summary>{error}</details></> : <Link className="tv-action" to="/">Home</Link>}
        </div>
      ) : (
        <>
          {showControls ? <header className="tv-header">
            <BrandLockup size={34} /><span className="tv-source-badge">{fixture || ['harbor-vs-summit', 'riverton-vs-ironwood'].includes(state.game.id) ? 'Demo' : 'Replay'}</span>
            <ViewNav views={views} mode={mode} manual={manualMode !== undefined} contentRef={contentRef}
              onSelect={(next) => { returnFocusRef.current = undefined; setManualMode((current) => next === 'live' || current === next ? undefined : next); }}
              onClose={() => setManualMode(undefined)} />
            <span className="tv-party-code"><span>Party code</span><b>{state.party.code}</b></span>
          </header> : null}
          <main ref={contentRef} className={`tv-body${showControls ? '' : ' is-clean'}`}><span className="tv-clean-source">{!showControls ? fixture || ['harbor-vs-summit', 'riverton-vs-ironwood'].includes(state.game.id) ? 'Demo' : 'Replay' : ''}</span>
            <LiveView state={state} serverNow={serverNow} overview={!overlay && mode === 'live'} showStandings={mode === 'standings'} showPick={mode === 'picks'}
              onNavigate={(next, originId) => { returnFocusRef.current = originId; setManualMode(next); }} />
            {mode !== 'live' ? <div className="tv-screen-meta"><span className="tv-kicker">{state.party.crewName}</span><span>{views.find((v) => v.mode === mode)?.label}</span></div> : null}
            {mode === 'draft' || mode === 'rosters' || mode === 'final' ? (
              <div className="tv-optional-panel" key={mode}>
                {mode === 'draft' ? <DraftBoard state={state} serverNow={serverNow} /> : null}
                {mode === 'rosters' ? <RostersView state={state} serverNow={serverNow} /> : null}
                {mode === 'final' ? <FinalView state={state} serverNow={serverNow} season={fixture ? seasonFixture : season} seasonError={seasonError} onRetrySeason={() => setSeasonAttempt(n => n + 1)} /> : null}
              </div>
            ) : null}
          </main>
          {showControls ? <footer className="tv-footer">
            <span className="tv-footer-crew"><span className="tv-status-dot" aria-hidden="true" />{state.party.crewName}<span className="tv-footer-note">{fixture || ['harbor-vs-summit', 'riverton-vs-ironwood'].includes(state.game.id) ? 'Demo' : 'Replay'}</span></span>
            <Link className="tv-home" to="/">Home</Link><span className="tv-remote-hint"><kbd>↑↓</kbd><kbd>←→</kbd> Navigate <kbd>OK</kbd> Open <kbd>↩</kbd> {manualMode ? 'Back to game' : 'Back'}</span>
          </footer> : null}
          {error ? <div className="tv-reconnecting" role="status">Connection interrupted · Showing the last update <button autoFocus className="tv-action" onClick={retry}>Retry</button><Link className="tv-action" to="/">Edit code</Link></div> : null}
        </>
      )}
    </Stage>
  );
}
