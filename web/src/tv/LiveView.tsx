import type { PartyStateResponse } from '@shared/types';
import { Scoreboard } from './Scoreboard';
import { Court } from './Court';
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
    <section className="tv-view tv-live">
      <div className="tv-live-left">
        <Scoreboard state={state} />
        <div className="tv-live-court">
          <Court
            homeColor={state.game.home.color}
            awayColor={state.game.away.color}
            scoring={lastScore?.team}
            pulseKey={lastScore?.id}
          />
          <PlayByPlay
            events={state.recentEvents}
            households={state.households}
            homeColor={state.game.home.color}
            awayColor={state.game.away.color}
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
