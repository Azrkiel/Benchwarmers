import type { PartyStateResponse } from '@shared/types';

export function Scoreboard({ state }: { state: PartyStateResponse }) {
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
          <span className={`tv-sb-score${homeLead ? ' is-leading' : ''}`} style={{ color: home.color }}>{home.score}</span>
          <span className="tv-sb-dash">–</span>
          <span className={`tv-sb-score${awayLead ? ' is-leading' : ''}`} style={{ color: away.color }}>{away.score}</span>
        </div>
        <div className="tv-sb-meta">
          <span className="tv-live-pill">Live</span>
          <span className="tv-sb-clock">{clock}</span>
        </div>
      </div>
      <div className={`tv-sb-team tv-sb-away${awayLead ? ' is-leading' : ''}`} style={{ ['--team' as string]: away.color }}>
        <span className="tv-sb-name">{away.name}</span>
        <span className="tv-sb-short">{away.short}</span>
      </div>
    </header>
  );
}
