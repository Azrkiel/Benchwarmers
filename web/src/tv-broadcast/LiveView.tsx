import type { PartyStateResponse } from '@shared/types';
import { Scoreboard } from './Scoreboard';
import { PlayByPlay } from './PlayByPlay';
import { Standings } from './Standings';
import { PickBar } from './PickBar';
import { Ticker } from './Ticker';
import { GameOverview } from './GameOverview';
import type { TvMode } from './modes';

export function LiveView({ state, serverNow, showStandings = false, showPick = false, overview = false, onNavigate }: {
  state: PartyStateResponse;
  serverNow: () => number;
  showStandings?: boolean;
  showPick?: boolean;
  overview?: boolean;
  onNavigate?: (mode: TvMode, originId: string) => void;
}) {
  return (
    <section className={`tv-view tv-live${showStandings ? ' is-standings-open' : ''}${showPick ? ' is-pick-open' : ''}${overview ? ' is-overview' : ''}`} aria-label={overview ? 'Game night overview' : 'Game overlay'}>
      <Scoreboard state={state} expanded={overview} />
      <PlayByPlay compact events={state.recentEvents} households={state.households}
        homeColor={state.game.home.color} awayColor={state.game.away.color} sport={state.game.sport} durationSec={state.game.durationSec} regulationSec={state.game.regulationSec} />
      {overview ? <GameOverview state={state} now={serverNow()} onNavigate={onNavigate} /> : null}
      {showPick ? <PickBar state={state} serverNow={serverNow} /> : null}
      {showStandings ? (
        <aside className="tv-live-right">
          
          <Standings rows={state.standings} households={state.households} />
          <Ticker lines={state.ticker} />
        </aside>
      ) : null}
    </section>
  );
}
