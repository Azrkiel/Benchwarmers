import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
  const overlay = !showControls || params.get('overlay') === '1';
  useKiosk(kiosk);
  useEffect(() => {
    document.documentElement.classList.toggle('tv-overlay', overlay);
    return () => document.documentElement.classList.remove('tv-overlay');
  }, [overlay]);

  const { state, error, code, serverNow } = usePartyState(codeParam, { fixture, crew });
  const [manualMode, setManualMode] = useState<TvMode | undefined>(forced);
  const status = state?.party.status;
  useEffect(() => { setManualMode(forced); }, [forced, state?.party.id, status]);
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
  }, [fixture, status, crew, state?.party.id, mode]);

  return (
    <Stage overlay={overlay}>
      {!state ? (
        <div className="tv-connecting" role="status">
          <div className="tv-brand">Benchwarmers</div>
          <div className="tv-connecting-text">Connecting to party {code.toUpperCase()}…</div>
          {error ? <><div className="tv-connecting-err">{error}</div><div className="tv-sub">Trying again automatically. Check the party code and connection.</div></> : null}
        </div>
      ) : (
        <>
          {showControls ? <header className="tv-header">
            <span className="tv-brand-sm"><span className="tv-brand-mark" aria-hidden="true">bw</span>Benchwarmers</span>
            <ViewNav views={views} mode={mode} manual={manualMode !== undefined} contentRef={contentRef}
              onSelect={(next) => { returnFocusRef.current = undefined; setManualMode((current) => next === 'live' || current === next ? undefined : next); }}
              onClose={() => setManualMode(undefined)} />
            <span className="tv-party-code"><span>Party code</span><b>{state.party.code}</b></span>
          </header> : null}
          <main ref={contentRef} className={`tv-body${showControls ? '' : ' is-clean'}`}>
            <LiveView state={state} serverNow={serverNow} overview={!overlay && mode === 'live'} showStandings={mode === 'standings'} showPick={mode === 'picks'}
              onNavigate={(next, originId) => { returnFocusRef.current = originId; setManualMode(next); }} />
            {mode !== 'live' ? <div className="tv-screen-meta"><span className="tv-kicker">{state.party.crewName}</span><span>{views.find((v) => v.mode === mode)?.label}</span></div> : null}
            {mode === 'draft' || mode === 'rosters' || mode === 'final' ? (
              <div className="tv-optional-panel" key={mode}>
                {mode === 'draft' ? <DraftBoard state={state} serverNow={serverNow} /> : null}
                {mode === 'rosters' ? <RostersView state={state} serverNow={serverNow} /> : null}
                {mode === 'final' ? <FinalView state={state} serverNow={serverNow} season={fixture ? seasonFixture : season} seasonError={seasonError} /> : null}
              </div>
            ) : null}
          </main>
          {showControls ? <footer className="tv-footer">
            <span className="tv-footer-crew"><span className="tv-status-dot" aria-hidden="true" />{state.party.crewName}<span className="tv-footer-note">{fixture ? 'Demo game' : 'Game night'}</span></span>
            <span className="tv-remote-hint"><kbd>↑↓</kbd><kbd>←→</kbd> Navigate <kbd>OK</kbd> Open <kbd>↩</kbd> {manualMode ? 'Back to game' : 'Back'}</span>
          </footer> : null}
          {error ? <div className="tv-reconnecting" role="status">Reconnecting… Showing the last update.</div> : null}
        </>
      )}
    </Stage>
  );
}
