import type { PartyStateResponse } from '@shared/types';

export function Scoreboard({ state, expanded = false }: { state: PartyStateResponse; expanded?: boolean }) {
  const { home, away, clock } = state.game;
  const homeLead = home.score > away.score;
  const awayLead = away.score > home.score;
  return (
    <header className="tv-live-scoreboard">
      
      <div className={`tv-sb-team tv-sb-home${homeLead ? ' is-leading' : ''}`} style={{ ['--team' as string]: home.color }}>
        <span className="tv-sb-name">{home.name}</span>
        <span className="tv-sb-short">{home.short}</span>
      </div>
      <div className="tv-sb-mid">
        <div className="tv-sb-scores">
          <span className={`tv-sb-score${homeLead ? ' is-leading' : ''}`}>{home.score}</span>
          <span className="tv-sb-dash">–</span>
          <span className={`tv-sb-score${awayLead ? ' is-leading' : ''}`}>{away.score}</span>
        </div>
        <div className="tv-sb-meta">
          <span className="tv-live-pill">{state.party.status === 'live' ? 'Playing' : state.party.status === 'final' ? 'Final' : 'Pregame'}</span>
          {state.party.status !== 'final' ? <span className="tv-sb-clock">{clock}</span> : null}
        </div>
      </div>
      <div className={`tv-sb-team tv-sb-away${awayLead ? ' is-leading' : ''}`} style={{ ['--team' as string]: away.color }}>
        <span className="tv-sb-name">{away.name}</span>
        <span className="tv-sb-short">{away.short}</span>
      </div>
      {expanded ? <div className="tv-sb-latest"><span className="tv-kicker">Latest play</span><span>{state.recentEvents[0]?.text ?? (state.party.status === 'drafting' ? 'Build your roster. The night starts here.' : 'Waiting for the next play.')}</span></div> : null}
    </header>
  );
}
