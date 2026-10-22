import type { PartyStateResponse } from '@shared/types';
import { Scoreboard } from './Scoreboard';
import { Court } from './Court';
import { FootballField } from './FootballField';
import { PlayByPlay } from './PlayByPlay';
import { Leader } from './Leader';
import { Standings } from './Standings';
import { PickBar } from './PickBar';
import { Ticker } from './Ticker';

export function LiveView({ state, serverNow }: { state: PartyStateResponse; serverNow: () => number }) {
  const leader = [...state.standings].sort((a, b) => a.rank - b.rank)[0];
  // Newest scoring event drives the court pulse.
  const lastScore = state.recentEvents.find((e) => e.type === 'score' && e.team);
  return (
    <section className={`tv-view tv-live${state.game.sport === 'football' ? ' tv-live-football' : ''}`}>
      <div className="tv-live-left">
        <Scoreboard state={state} />
        <div className="tv-live-court">
          {state.game.sport === 'football' ? <FootballField state={state} /> : <Court
            homeColor={state.game.home.color}
            awayColor={state.game.away.color}
            scoring={lastScore?.team}
            pulseKey={lastScore?.id}
          />}
          <PlayByPlay
            events={state.recentEvents}
            households={state.households}
            homeColor={state.game.home.color}
            awayColor={state.game.away.color}
            sport={state.game.sport}
            durationSec={state.game.durationSec}
            regulationSec={state.game.regulationSec}
          />
        </div>
        <PickBar state={state} serverNow={serverNow} />
      </div>
      <aside className="tv-live-right">
        {leader ? <Leader row={leader} state={state} /> : null}
        <Standings rows={state.standings} households={state.households} />
        <Ticker lines={state.ticker} />
      </aside>
    </section>
  );
}
