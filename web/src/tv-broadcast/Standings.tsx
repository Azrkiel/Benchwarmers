import { useMemo, useRef } from 'react';
import type { Household, StandingRow } from '@shared/types';
import { ScoreTick } from '../fx/fx';
import { Avatar, householdColor } from './avatar';
import { rankMovement, useFlip, type Movement } from './flip';

const GLYPH: Record<Movement, string> = { up: '▲', down: '▼', same: '─' };

export function Standings({ rows, households }: { rows: StandingRow[]; households: Household[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank), [rows]);
  const max = Math.max(1, ...sorted.map((r) => r.total));
  const listRef = useRef<HTMLOListElement>(null);
  useFlip(listRef, sorted.map((r) => r.memberId));

  const pct = (n: number) => `${Math.max(0, (n / max) * 100)}%`;
  return (
    <section className="tv-standings">
      <header className="tv-standings-head">
        <h2>Standings</h2>
        <span className="tv-split-legend">
          <span><i className="tv-seg tv-seg-draft" />Draft</span>
          <span><i className="tv-seg tv-seg-pick" />Picks</span>
        </span>
      </header>
      <ol className="tv-standings-list" ref={listRef} tabIndex={0} aria-label="Party standings" data-tv-scroll>
        {sorted.map((r) => {
          const mv = rankMovement(r);
          return (
            <li key={r.memberId} data-flip-key={r.memberId} className="tv-stand-row">
              <span className="tv-stand-rank">{r.rank}</span>
              <span className={`tv-move tv-move-${mv}`} aria-label={`Rank ${mv === 'same' ? 'unchanged' : mv}`}>{GLYPH[mv]}</span>
              <Avatar avatar={r.avatar} name={r.name} color={householdColor(households, r.householdId)} size={48} />
              <span className="tv-stand-main">
                <span className="tv-stand-name">{r.name}</span>
                <span className="tv-split" title={`Draft ${r.draftPoints.toFixed(1)} · Picks ${r.pickPoints.toFixed(1)}`}>
                  <span className="tv-split-draft" style={{ width: pct(r.draftPoints) }} />
                  <span className="tv-split-pick" style={{ width: pct(r.pickPoints) }} />
                </span>
                <span className="tv-split-text">Draft {r.draftPoints.toFixed(1)} · Picks {r.pickPoints.toFixed(1)}</span>
              </span>
              <ScoreTick className="tv-stand-total" value={r.total.toFixed(1)} />
              <span className="tv-streak">{r.streak >= 2 ? `${r.streak} streak` : ''}</span>
            </li>
          );
        })}
      </ol>
      {sorted.length === 0 ? <p className="tv-muted">No players yet.</p> : null}
    </section>
  );
}
