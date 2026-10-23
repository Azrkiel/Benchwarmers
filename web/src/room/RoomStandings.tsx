import { useEffect, useState } from 'react';
import type { RoomStanding } from '@shared/room';
import { ScoreTick } from '../fx/fx';
import { Face, points } from './components';

/** Fixed-size pages so every participant is reachable without scrolling a list. */
export function paginate<T>(rows: T[], perPage: number): T[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages.length ? pages : [[]];
}

/** Top rows plus the highlighted participant when they are outside them. Ranks come from the server, ties included. */
export function leaders(rows: RoomStanding[], count: number, highlightId?: string): RoomStanding[] {
  const top = rows.slice(0, count);
  const extra = highlightId && !top.some((row) => row.participantId === highlightId) ? rows.find((row) => row.participantId === highlightId) : undefined;
  return extra ? [...top, extra] : top;
}

export function StandingRow({ row, highlight = false }: { row: RoomStanding; highlight?: boolean }) {
  return <li className={`rd-row${highlight ? ' is-me' : ''}${row.rank === 1 && row.total > 0 ? ' is-leader' : ''}`}>
    <span className="rd-row-rank">{row.rank}</span>
    <Face name={row.name} size={32} />
    <b className="rd-row-name" title={row.name}>{row.name}</b>
    <span className="rd-row-pts"><ScoreTick value={points(row.total)} /></span>
  </li>;
}

export function RoomStandings({ rows, perPage, highlightId, title = 'Standings' }: { rows: RoomStanding[]; perPage: number; highlightId?: string; title?: string }) {
  const pages = paginate(rows, perPage);
  const [page, setPage] = useState(0);
  useEffect(() => { if (page > pages.length - 1) setPage(pages.length - 1); }, [page, pages.length]);
  const current = Math.min(page, pages.length - 1);
  const first = current * Math.max(1, Math.floor(perPage)) + 1;
  return <section className="rd-standings" aria-labelledby="rd-standings-title">
    <header><h2 id="rd-standings-title">{title}</h2>{rows.length > 0 && <span aria-live="polite">{first}–{first + pages[current]!.length - 1} of {rows.length}</span>}</header>
    {rows.length ? <ol className="rd-rows">{pages[current]!.map((row) => <StandingRow key={row.participantId} row={row} highlight={row.participantId === highlightId} />)}</ol> : <p className="rd-empty">No players yet. Join on your phone.</p>}
    {pages.length > 1 && <nav className="rd-pager" aria-label="Standings pages">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
      <span>Page {current + 1} of {pages.length}</span>
      <button disabled={current === pages.length - 1} onClick={() => setPage(current + 1)}>Next</button>
    </nav>}
  </section>;
}
