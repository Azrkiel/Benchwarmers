import { useEffect, useRef, useState } from 'react';
import type { PartyStateResponse } from '@shared/types';

export function resultText(state: PartyStateResponse): string {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const winners = rows.filter((r) => r.rank === rows[0]?.rank);
  const { home, away } = state.game;
  const score = `Final: ${home.short} ${home.score}, ${away.short} ${away.score}.`;
  if (!winners.length) return score;
  return `${score} ${winners.map((r) => r.name).join(' and ')} ${winners.length > 1 ? 'tie' : 'wins'} with ${winners[0]!.total.toFixed(1)} points.`;
}

/** Announces the result once, when the party status changes to final. */
export function ResultAnnouncement({ state }: { state?: PartyStateResponse }) {
  const status = state?.party.status;
  const prev = useRef(status);
  const [text, setText] = useState('');
  useEffect(() => {
    if (state && status === 'final' && prev.current !== undefined && prev.current !== 'final') setText(resultText(state));
    prev.current = status;
  }, [status, state]);
  return <div className="tv-sr-only" role="status" aria-live="polite" data-testid="result-announcement">{text}</div>;
}
