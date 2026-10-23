import { useState } from 'react';
import type { PregameView } from '@shared/room';
import { RoomRequestError } from './api';
import type { MarketReference, PregameReferenceResponse } from './points/types';

type Team = { id: string; name: string; short: string; color: string };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Upfront winner pick (P13.4) over Worker A's PregameView, with room support and the
 * market reference shown as two different things (P13.5). Room picks are counts from
 * this room; a market reference would be an outside, timestamped price. Fictional games
 * have none and say so. The server decides when picks close (here: when the host starts).
 */
export function PregamePick({ pregame, teams, myPick, reference, onPick }: {
  pregame: PregameView; teams: Team[]; myPick?: string;
  reference?: PregameReferenceResponse | { status: 'available'; reference: MarketReference };
  onPick?: (optionId: string) => Promise<void>;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const open = pregame.status === 'open' && pregame.acceptingPicks;
  const total = Object.values(pregame.pickCounts).reduce((a, b) => a + b, 0);
  const market = reference?.status === 'available' ? reference.reference : undefined;
  async function pick(optionId: string) {
    if (!onPick || !open || sending) return;
    setSending(optionId); setError('');
    try { await onPick(optionId); }
    catch (problem) { setError(problem instanceof RoomRequestError && problem.code === 'PICKS_LOCKED' ? 'Picks closed when the game started. Not accepted.' : 'Not confirmed. Check your pick before trying again.'); }
    finally { setSending(null); }
  }
  const status = pregame.status === 'void' ? `Void${pregame.voidReason ? ` · ${pregame.voidReason}` : ''} · no points`
    : pregame.status === 'resolved' ? 'Final'
    : open ? 'Open until the host starts the game' : 'Closed at tip-off';
  return <section className="rm-pregame" aria-label="Pick the winner">
    <div className="rm-section-heading"><h2>{pregame.text || 'Who wins tonight?'}</h2><span>{status}</span></div>
    <div className="rm-pregame-sides">{pregame.options.map((option) => {
      const team = teams.find((t) => t.id === option.id);
      const count = pregame.pickCounts[option.id] ?? 0;
      const won = pregame.result?.optionId === option.id;
      const marketShare = market ? market.prices[option.id] : undefined;
      return <div key={option.id} className={`rm-pregame-side${myPick === option.id ? ' is-mine' : ''}${won ? ' is-winner' : ''}`} style={{ borderColor: team?.color }}>
        <b>{option.label}</b>
        <dl>
          <div><dt>Room picks</dt><dd>{total ? `${count} (${pct(count / total)})` : '—'}</dd></div>
          <div><dt>Market reference</dt><dd>{marketShare !== undefined ? pct(marketShare) : 'None'}</dd></div>
        </dl>
        {onPick && <button aria-pressed={myPick === option.id} disabled={!open || !!sending} onClick={() => { void pick(option.id); }}>{sending === option.id ? 'Sending…' : myPick === option.id ? `✓ ${team?.short ?? option.label} picked` : `Pick ${team?.short ?? option.label}`}</button>}
        {won && <strong>✓ Won</strong>}
      </div>;
    })}</div>
    <p className="rm-muted">{market
      ? <>Market reference: {market.sourceUrl ? <a href={market.sourceUrl} target="_blank" rel="noreferrer">{market.source}</a> : market.source}, {market.method}, as of {new Date(market.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{market.stale ? ' (out of date)' : ''}. It is an outside price, not our prediction.</>
      : reference?.status === 'unavailable' && reference.reason === 'fictional_game' ? 'No market reference: these are fictional teams.' : 'No market reference for this game.'} Room picks show who in this room chose each side.</p>
    <p className="rm-muted">Correct pick: +{pregame.correctPoints} points. How it's decided: {pregame.resolutionRule}</p>
    {pregame.result && <p role="status">Result: {pregame.result.explanation}</p>}
    {error && <p className="rm-error" role="alert">{error}</p>}
  </section>;
}
