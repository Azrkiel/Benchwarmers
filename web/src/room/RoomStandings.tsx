import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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

export const AUTO_SCROLL_MS = 2500;
const HOLD_AFTER_TOUCH_MS = 8000;

/**
 * Slowly steps a list down one row at a time when it is taller than its box, holds at the
 * bottom, then returns to the top. Stops while someone scrolls by hand and under reduced motion.
 */
export function useAutoScroll(ref: RefObject<HTMLElement | null>, rowCount: number) {
  const holdUntil = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let reduced = false;
    try { reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { /* no matchMedia */ }
    if (reduced) return;
    let atBottomTicks = 0;
    const id = window.setInterval(() => {
      if (Date.now() < holdUntil.current || el.scrollHeight <= el.clientHeight + 1) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        if (++atBottomTicks < 2) return;
        atBottomTicks = 0;
        el.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }
      const row = el.querySelector('li')?.getBoundingClientRect().height || 40;
      el.scrollBy?.({ top: row + 4, behavior: 'smooth' });
    }, AUTO_SCROLL_MS);
    return () => window.clearInterval(id);
  }, [ref, rowCount]);
  return () => { holdUntil.current = Date.now() + HOLD_AFTER_TOUCH_MS; };
}

/** A row list that shows as many rows as fit and auto-scrolls through the rest. */
export function ScrollRows({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  const hold = useAutoScroll(list, count);
  return <ol ref={list} className="rd-rows rd-scroll" tabIndex={0} aria-label={label}
    onPointerDown={hold} onWheel={hold} onTouchStart={hold} onKeyDown={hold}>{children}</ol>;
}

/** Every participant in one list: as many rows as fit are shown, and the list auto-scrolls when there are more. */
export function RoomStandings({ rows, highlightId, title = 'Standings' }: { rows: RoomStanding[]; highlightId?: string; title?: string }) {
  return <section className="rd-standings" aria-labelledby="rd-standings-title">
    <header><h2 id="rd-standings-title">{title}</h2>{rows.length > 0 && <span>{rows.length} {rows.length === 1 ? 'player' : 'players'}</span>}</header>
    {rows.length ? <ScrollRows label={`${title}, ${rows.length} players`} count={rows.length}>
      {rows.map((row) => <StandingRow key={row.participantId} row={row} highlight={row.participantId === highlightId} />)}
    </ScrollRows> : <p className="rd-empty">No players yet. Scan the code to join.</p>}
  </section>;
}
