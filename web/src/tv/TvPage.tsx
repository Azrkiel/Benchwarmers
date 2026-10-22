import { useEffect, useState } from 'react';
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
import { useTvMode, type TvMode } from './modes';
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

  const { state, error, code, serverNow } = usePartyState(codeParam, { fixture, crew });
  const autoMode = useTvMode(state);
  const mode = forced ?? autoMode;

  const [season, setSeason] = useState<SeasonResponse | undefined>(undefined);
  const status = state?.party.status;
  useEffect(() => {
    if (fixture || status !== 'final') return;
    let cancelled = false;
    api.season(crew || 'sunday-crew').then(
      (s) => {
        if (!cancelled) setSeason(s);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [fixture, status, crew]);

  return (
    <Stage>
      {!state ? (
        <div className="tv-connecting">
          <BrandLockup size={96} />
          <div className="tv-connecting-text">Connecting to party {code.toUpperCase()}…</div>
          {error ? <div className="tv-connecting-err">{error}</div> : null}
        </div>
      ) : (
        <>
          <div className="tv-header">
            <BrandLockup size={30} />
            <span>Party {state.party.code}</span>
            <span className="tv-muted">{state.party.crewName}</span>
          </div>
          <div className="tv-body" key={mode}>
            {mode === 'draft' ? <DraftBoard state={state} serverNow={serverNow} /> : null}
            {mode === 'live' ? <LiveView state={state} serverNow={serverNow} demo={params.get('fxdemo') === '1'} /> : null}
            {mode === 'rosters' ? <RostersView state={state} serverNow={serverNow} /> : null}
            {mode === 'final' ? <FinalView state={state} serverNow={serverNow} season={fixture ? seasonFixture : season} /> : null}
          </div>
          {error ? <div className="tv-reconnecting">Reconnecting…</div> : null}
        </>
      )}
    </Stage>
  );
}
