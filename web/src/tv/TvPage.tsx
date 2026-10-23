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
import { ROTATE_MS, useTvMode, type TvMode } from './modes';
import { ViewNav } from '../tv-broadcast/ViewNav';
import './tv.css';
import { BrandLockup } from '../brand/Brand';

const FORCED: TvMode[] = ['draft', 'live', 'rosters', 'final'];

export function TvPage() {
  const { code: codeParam = 'latest' } = useParams();
  const [params] = useSearchParams();
  const fixture = parseFixtureMode(params.get('fixture'));
  const crew = params.get('crew') || undefined;
  const kioskParam = params.get('kiosk');
  const kiosk = !!kioskParam && kioskParam !== '0' && kioskParam !== 'false';
  const forced = FORCED.find((m) => m === params.get('mode'));
  useKiosk(kiosk);

  const { state, error, code, serverNow, retry } = usePartyState(codeParam, { fixture, crew });
  const [rotating, setRotating] = useState(params.get('rotate') === '1');
  const autoMode = useTvMode(state, rotating ? ROTATE_MS : Number.POSITIVE_INFINITY);
  const [manualMode, setManualMode] = useState<TvMode | undefined>(forced);
  useEffect(() => { setManualMode(forced); }, [forced, state?.party.id]);
  const mode = manualMode ?? autoMode;
  const contentRef = useRef<HTMLDivElement>(null);
  const views = [{ mode: 'live' as const, label: 'Game' }, { mode: 'draft' as const, label: 'Draft' }, { mode: 'rosters' as const, label: 'Rosters' }, ...(state?.party.status === 'final' ? [{ mode: 'final' as const, label: 'Results' }] : [])];

  const [season, setSeason] = useState<SeasonResponse | undefined>(undefined);
  const [seasonError, setSeasonError] = useState(false);
  const [seasonAttempt, setSeasonAttempt] = useState(0);
  const status = state?.party.status;
  useEffect(() => {
    if (fixture || status !== 'final') return;
    let cancelled = false;
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
  }, [fixture, status, crew, seasonAttempt]);

  return (
    <Stage>
      {!state ? (
        <div className="tv-connecting" role="status">
          <BrandLockup size={96} />
          <div className="tv-connecting-text">Connecting to party {code.toUpperCase()}…</div>
          {error ? <><h1>Party unavailable</h1><p>Check party {code.toUpperCase()} and try again.</p><div className="tv-recovery"><button autoFocus className="tv-action" onClick={retry}>Retry</button><Link className="tv-action" to="/">Edit code</Link></div><details><summary>Connection details</summary>{error}</details></> : <Link className="tv-action" to="/">Home</Link>}
        </div>
      ) : (
        <>
          <div className="tv-header">
            <BrandLockup size={30} />
            <span>Party {state.party.code}</span>
            <span className="tv-source-badge">{fixture || ['harbor-vs-summit', 'riverton-vs-ironwood'].includes(state.game.id) ? 'Demo' : 'Replay'}</span>
            <ViewNav views={views} mode={mode} manual={manualMode !== undefined} contentRef={contentRef} onSelect={next => setManualMode(next as TvMode)} onClose={() => setManualMode(undefined)} />
            <label className="tv-rotation"><input type="checkbox" checked={rotating} onChange={e => { setRotating(e.target.checked); setManualMode(undefined); }} />Auto rotate</label>
            <Link className="tv-home" to="/">Home</Link>
          </div>
          <div ref={contentRef} className="tv-body" key={mode}>
            {mode === 'draft' ? <DraftBoard state={state} serverNow={serverNow} /> : null}
            {mode === 'live' ? <LiveView state={state} serverNow={serverNow} demo={params.get('fxdemo') === '1'} /> : null}
            {mode === 'rosters' ? <RostersView state={state} serverNow={serverNow} /> : null}
            {mode === 'final' ? <FinalView state={state} serverNow={serverNow} season={fixture ? seasonFixture : season} seasonError={seasonError} onRetrySeason={() => setSeasonAttempt(n => n + 1)} /> : null}
          </div>
          {error ? <div className="tv-reconnecting" role="status">Connection interrupted · Showing the last update <button autoFocus className="tv-action" onClick={retry}>Retry</button><Link className="tv-action" to="/">Edit code</Link></div> : null}
        </>
      )}
    </Stage>
  );
}
