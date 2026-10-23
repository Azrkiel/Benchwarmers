import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { Face, points } from './components';
import { ordinal } from './moments';
import { ScrollRows } from './RoomStandings';

export const SEASON_REVEAL_MS = 6000;

/**
 * Final sequence: the winner (or tied winners) first, then the season on request.
 * The Season button unlocks after a readable pause; a host can advance sooner.
 * Nothing here plays sound, so restoring Results after a reload stays quiet.
 */
export function RoomResults({ view, host = false, revealMs = SEASON_REVEAL_MS, initialStage = 'winner' }: { view: RoomView; host?: boolean; revealMs?: number; initialStage?: 'winner' | 'season' }) {
  const [stage, setStage] = useState<'winner' | 'season'>(initialStage);
  const [ready, setReady] = useState(revealMs <= 0);
  const seasonHeading = useRef<HTMLHeadingElement>(null);
  const winnerButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (revealMs <= 0) return; const timer = setTimeout(() => setReady(true), revealMs); return () => clearTimeout(timer); }, [revealMs]);
  useEffect(() => { if (stage === 'season') seasonHeading.current?.focus(); }, [stage]);
  const { game } = view;
  const winners = view.standings.filter((row) => row.rank === 1);
  const me = view.me ? view.standings.find((row) => row.participantId === view.me?.participantId) : undefined;
  if (stage === 'season') {
    const rows = view.season.standings;
    return <section className="rd-results is-season" aria-labelledby="rd-season-title">
      <h2 id="rd-season-title" tabIndex={-1} ref={seasonHeading}>{view.season.name}</h2>
      {rows.length ? <ScrollRows label={`${view.season.name}, ${rows.length} players`} count={rows.length}>{rows.map((row) => <li key={row.participantId} className="rd-row"><span className="rd-row-rank">{1 + rows.filter((other) => other.points > row.points).length}</span><Face name={row.name} size={32} /><b className="rd-row-name" title={row.name}>{row.name}</b><small>{row.nightsWon}W · {row.nightsPlayed} {row.nightsPlayed === 1 ? 'night' : 'nights'}</small><span className="rd-row-pts">{points(row.points)}</span></li>)}</ScrollRows> : <p className="rd-empty">Season totals are saving.</p>}
      <button ref={winnerButton} className="rd-secondary" onClick={() => setStage('winner')}>Back to tonight</button>
    </section>;
  }
  return <section className="rd-results" aria-labelledby="rd-winner-title">
    <p className="rd-final-score"><span>Final</span> {game.away.short} {game.away.score} · {game.home.short} {game.home.score}</p>
    <span className="rd-eyebrow">Tonight</span>
    <h2 id="rd-winner-title">{winners.length > 1 ? 'Tied winners' : winners.length === 1 ? 'Winner' : 'No results yet'}</h2>
    <div className="rd-winners">{winners.map((row) => <div className="rd-winner" key={row.participantId}><Face name={row.name} size={56} /><b title={row.name}>{row.name}</b><strong>{points(row.total)} <small>pts</small></strong></div>)}</div>
    {me && <p className="rd-mine">You finished {ordinal(me.rank)} · {points(me.fantasyPoints)} lineup + {points(me.predictionPoints)} picks = <b>{points(me.total)}</b></p>}
    <div className="rd-results-actions">
      <button className="rd-primary" disabled={!ready && !host} onClick={() => setStage('season')}>{ready || !host ? 'Season standings' : 'Show season now'}</button>
      {!ready && !host && <span className="rd-muted" role="status">Season opens in a moment</span>}
    </div>
  </section>;
}
