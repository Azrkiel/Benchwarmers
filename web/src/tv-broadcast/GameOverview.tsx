import { ROSTER_SIZE, type PartyStateResponse } from '@shared/types';
import { questionStatus } from '../lounge/LoungeViews';
import { Avatar, householdColor } from './avatar';
import type { TvMode } from './modes';

/** Shared scorebook with phase-specific shortcuts; personal answers remain on devices. */
export function GameOverview({ state, onNavigate, now = state.serverNow }: { state: PartyStateResponse; now?: number; onNavigate?: (mode: TvMode, originId: string) => void }) {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const prop = state.activeProp ?? state.props.find((p) => p.status === 'locked') ?? state.lastResolvedProp;
  const resolved = prop?.status === 'resolved';
  let guidance = 'The next question will appear here.';
  if (state.party.status === 'drafting') guidance = `${state.draftBoard.filter(p => p.ownerMemberId).length} players drafted · ${state.households.reduce((n, h) => n + h.members.length * ROSTER_SIZE, 0)} roster spots`;
  else if (state.party.status === 'final') guidance = rows.length ? `${rows.filter(r => r.rank === rows[0]!.rank).map(r => r.name).join(' and ')} · ${rows[0]!.total.toFixed(1)} points` : 'Results are not available yet.';
  else if (prop) guidance = resolved ? (prop.explanation ?? 'The result is marked below.') : `${questionStatus(state, now)} · Make a pick on your device.`;
  const primaryMode = state.party.status === 'drafting' ? 'draft' : state.party.status === 'final' ? 'final' : 'picks';
  const primaryLabel = primaryMode === 'draft' ? 'Open draft' : primaryMode === 'final' ? 'See results' : 'View picks';
  return (
    <>
      <section className={`tv-game-pulse${onNavigate ? ' has-actions' : ''}`} aria-labelledby="tv-next-call">
        <div className="tv-pulse-top"><span className="tv-kicker">{state.party.status === 'drafting' ? 'Draft progress' : state.party.status === 'final' ? 'Final standings' : resolved ? 'Result' : 'Current pick'}</span></div>
        <h1 id="tv-next-call">{state.party.status === 'drafting' ? 'Build your roster' : state.party.status === 'final' ? (rows.length ? rows.filter(r => r.rank === rows[0]!.rank).map(r => r.name).join(' and ') : 'Final') : prop?.question ?? 'No open pick'}</h1>
        {prop && state.party.status !== 'drafting' && state.party.status !== 'final' ? <div className="tv-pulse-options">{prop.options.map((option) => (
          <div key={option.id}><span>{option.label}</span><span>{resolved ? (option.id === prop.correctOptionId ? '✓ Correct' : '—') : `${prop.pickCounts[option.id] ?? 0} ${prop.pickCounts[option.id] === 1 ? 'pick' : 'picks'}`}</span></div>
        ))}</div> : null}
        <p>{guidance}</p>
        {onNavigate ? <div className="tv-game-actions">
          <button id="tv-primary-action" data-tv-action className="tv-action tv-action-primary" type="button" onClick={() => onNavigate(primaryMode, 'tv-primary-action')}>{primaryLabel}<span aria-hidden="true">→</span></button>
          <button id="tv-rosters-action" data-tv-action className="tv-action" type="button" onClick={() => onNavigate('rosters', 'tv-rosters-action')}>View rosters<span aria-hidden="true">↗</span></button>
        </div> : null}
      </section>
      <section className="tv-room-overview" aria-labelledby="tv-room-title">
        <header><h2 id="tv-room-title">Standings</h2><span>{rows.length} {rows.length === 1 ? 'player' : 'players'} · Points</span></header>
        <div className="tv-room-grid" tabIndex={0} role="region" aria-label="Party standings" data-tv-scroll>
          {rows.map((row) => (
            <article className={`tv-room-card${row.rank === 1 ? ' is-leader' : ''}`} key={row.memberId}>
              <span className="tv-room-rank">{String(row.rank).padStart(2, '0')}</span>
              <Avatar avatar={row.avatar} name={row.name} color={householdColor(state.households, row.householdId)} size={60} />
              <div className="tv-room-identity"><h3>{row.name}</h3><span>{state.households.find((h) => h.id === row.householdId)?.city ?? row.household}</span></div>
              <div className="tv-room-points"><b>{row.total.toFixed(1)}</b><span>{row.rank === 1 ? 'Leader' : ''}</span></div>
            </article>
          ))}
        </div>
        {rows.length === 0 ? <p className="tv-muted">Your crew will appear here when they join the party.</p> : null}
        
      </section>
    </>
  );
}
