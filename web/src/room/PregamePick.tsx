import { useEffect, useState } from 'react';
import { RoomRequestError } from './api';
import type { PregamePickState } from './points/types';

type Team = { id: string; name: string; short: string; color: string };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Upfront winner pick (P13.4) with room support and market reference shown as two
 * different things (P13.5): the crowd is who in this room picked each side; the market
 * reference is an external, timestamped price. Neither is a probability we computed,
 * and the server clock decides when picks close.
 */
export function PregamePick({ state, home, away, serverOffsetMs = 0, onPick }: {
  state: PregamePickState; home: Team; away: Team; serverOffsetMs?: number;
  onPick?: (side: 'home' | 'away') => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);
  const [sending, setSending] = useState<'home' | 'away' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (state.status !== 'open') return; const t = setInterval(() => setNow(Date.now() + serverOffsetMs), 1000); return () => clearInterval(t); }, [state.status, serverOffsetMs]);
  const open = state.status === 'open' && now < state.closesAt;
  const crowdTotal = state.crowd.home + state.crowd.away;
  const ref = state.reference;
  async function pick(side: 'home' | 'away') {
    if (!onPick || !open || sending) return;
    setSending(side); setError('');
    try { await onPick(side); }
    catch (problem) { setError(problem instanceof RoomRequestError && problem.code === 'PICKS_LOCKED' ? 'Picks closed before tip-off. Not accepted.' : 'Not confirmed. Check your pick before trying again.'); }
    finally { setSending(null); }
  }
  const side = (key: 'home' | 'away', team: Team) => {
    const crowd = crowdTotal ? state.crowd[key] / crowdTotal : 0;
    const won = state.result === key;
    return <div className={`rm-pregame-side${state.myPick === key ? ' is-mine' : ''}${won ? ' is-winner' : ''}`} style={{ borderColor: team.color }}>
      <b>{team.name}</b>
      <dl>
        <div><dt>Room picks</dt><dd>{crowdTotal ? `${state.crowd[key]} (${pct(crowd)})` : '—'}</dd></div>
        <div><dt>Market reference</dt><dd>{ref ? pct(ref[key]) : 'None'}</dd></div>
      </dl>
      {onPick && <button aria-pressed={state.myPick === key} disabled={!open || !!sending} onClick={() => { void pick(key); }}>{sending === key ? 'Sending…' : state.myPick === key ? `✓ ${team.short} picked` : `Pick ${team.short}`}</button>}
      {won && <strong>✓ Won</strong>}
    </div>;
  };
  const left = Math.max(0, Math.ceil((state.closesAt - now) / 1000));
  return <section className="rm-pregame" aria-label="Pick the winner">
    <div className="rm-section-heading"><h2>Who wins tonight?</h2><span>{state.status === 'void' ? 'Void · no points' : state.status === 'resolved' ? 'Final' : open ? `Closes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Closed at tip-off'}</span></div>
    <div className="rm-pregame-sides">{side('away', away)}{side('home', home)}</div>
    <p className="rm-muted">{ref ? <>Market reference: {ref.sourceUrl ? <a href={ref.sourceUrl} target="_blank" rel="noreferrer">{ref.source}</a> : ref.source}, {ref.method}, as of {new Date(ref.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{ref.stale ? ' (out of date)' : ''}. It is an outside price, not our prediction.</> : 'No market reference for this game (fictional teams have no real market).'} Room picks show who in this room chose each side.</p>
    <p className="rm-muted">How it's decided: {state.resolutionRule}</p>
    {error && <p className="rm-error" role="alert">{error}</p>}
  </section>;
}
