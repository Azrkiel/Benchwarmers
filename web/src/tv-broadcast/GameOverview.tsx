import type { PartyStateResponse } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import type { TvMode } from './modes';

/** Shared scorebook with phase-specific shortcuts; personal answers remain on devices. */
export function GameOverview({ state, onNavigate }: { state: PartyStateResponse; onNavigate?: (mode: TvMode, originId: string) => void }) {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const prop = state.activeProp ?? state.props.find((p) => p.status === 'locked') ?? state.lastResolvedProp;
  const resolved = prop?.status === 'resolved';
  let guidance = 'The next question will appear here. Open Picks for updates.';
  if (prop) guidance = 'Open Picks for the question, timing, and results.';
  else if (state.party.status === 'drafting') guidance = 'Open Draft to see the players and your crew’s rosters.';
  else if (state.party.status === 'final') guidance = 'Tonight’s winner and the season.';
  const primaryMode = state.party.status === 'drafting' ? 'draft' : state.party.status === 'final' ? 'final' : 'picks';
  const primaryLabel = primaryMode === 'draft' ? 'Open draft' : primaryMode === 'final' ? 'See results' : 'View live pick';
  return (
    <>
      <section className={`tv-game-pulse${onNavigate ? ' has-actions' : ''}`} aria-labelledby="tv-next-call">
        <div className="tv-pulse-top"><span className="tv-kicker">{resolved ? 'Last call' : 'The next call'}</span><span className="tv-pulse-category">Pick’em</span></div>
        <h1 id="tv-next-call">{prop?.question ?? (state.party.status === 'drafting' ? 'Your team. Your bragging rights.' : 'Good company. Great game.')}</h1>
        {prop && !onNavigate ? <div className="tv-pulse-options">{prop.options.map((option) => (
          <div key={option.id}><span>{option.label}</span><span>{resolved ? (option.id === prop.correctOptionId ? '✓ Correct' : '—') : `${prop.pickCounts[option.id] ?? 0} ${prop.pickCounts[option.id] === 1 ? 'pick' : 'picks'}`}</span></div>
        ))}</div> : null}
        <p>{guidance}</p>
        {onNavigate ? <div className="tv-game-actions">
          <button id="tv-primary-action" data-tv-action className="tv-action tv-action-primary" type="button" onClick={() => onNavigate(primaryMode, 'tv-primary-action')}>{primaryLabel}<span aria-hidden="true">→</span></button>
          <button id="tv-rosters-action" data-tv-action className="tv-action" type="button" onClick={() => onNavigate('rosters', 'tv-rosters-action')}>View rosters<span aria-hidden="true">↗</span></button>
        </div> : null}
      </section>
      <section className="tv-room-overview" aria-labelledby="tv-room-title">
        <header><span className="tv-kicker">The friendly rivalry</span><h2 id="tv-room-title">Around the room</h2><span>{rows.length} friends<span className="tv-dot-divider">·</span>{state.households.length} homes</span></header>
        <div className="tv-room-grid">
          {rows.map((row) => (
            <article className={`tv-room-card${row.rank === 1 ? ' is-leader' : ''}`} key={row.memberId}>
              <span className="tv-room-rank">{String(row.rank).padStart(2, '0')}</span>
              <Avatar avatar={row.avatar} name={row.name} color={householdColor(state.households, row.householdId)} size={60} />
              <div className="tv-room-identity"><h3>{row.name}</h3><span>{state.households.find((h) => h.id === row.householdId)?.city ?? row.household}</span></div>
              <div className="tv-room-points"><b>{row.total.toFixed(1)}</b><span>{row.rank === 1 ? 'Leading' : 'Points'}</span></div>
            </article>
          ))}
        </div>
        {rows.length === 0 ? <p className="tv-muted">Your crew will appear here when they join the party.</p> : null}
        <footer className="tv-room-note"><span>Draft + picks = total points</span></footer>
      </section>
    </>
  );
}
