// Room board: pure render of the public room snapshot. No DOM, no App import.
import type { RoomView } from '../../../shared/room.js';
import { escapeHtml as e, readableText, safeColor } from './render.ts';

/** Accepts room tool results (room_status, room_ask) and keeps only public room state. */
export function roomViewOf(sc: Record<string, unknown> | undefined): RoomView | undefined {
  const candidate = (sc && typeof sc === 'object' && 'view' in sc && sc.view && typeof sc.view === 'object' ? sc.view : sc) as Partial<RoomView> | undefined;
  if (!candidate?.room?.code || !candidate.game?.home || !Array.isArray(candidate.standings)) return undefined;
  const { me: _private, ...publicView } = candidate as RoomView;
  return publicView as RoomView;
}

const pts = (n: number) => Number(n || 0).toFixed(1);

export function renderRoomBoard(view: RoomView, opts: { pending?: boolean; error?: string } = {}): string {
  const { game, room } = view;
  const holder = game.context ? game.context.possessionTeamId : game.possession;
  const team = (side: 'home' | 'away') => {
    const t = game[side];
    const color = safeColor(t.color);
    return `<div class="rb-team" style="--team:${color}"><span class="rb-short">${e(t.short)}${holder === t.id ? ' <span class="rb-ball" aria-label="has the ball">●</span>' : ''}</span><b class="rb-score">${Number(t.score) || 0}</b></div>`;
  };
  const clock = room.phase === 'final' ? 'Final' : room.phase === 'lobby' ? 'Pregame' : `Q${Number(game.quarter) || 1} ${e(game.clock)}`;
  const source = game.sourceMode === 'live' ? 'Live' : `Fictional ${game.sport === 'basketball' ? 'basketball' : 'football'} replay`;
  const q = view.question;
  const total = q ? Object.values(q.pickCounts).reduce((a, b) => a + b, 0) : 0;
  const question = q ? `<section class="card rb-call" aria-label="Current call"><div class="rb-row"><h2>${e(q.text)}</h2><span class="countdown">${q.status === 'open' ? 'Open' : q.status === 'locked' ? 'Locked' : 'Resolved'}</span></div>
    <ul class="rb-options">${q.options.map((o) => { const n = q.pickCounts[o.id] ?? 0; const win = q.result?.optionId === o.id; return `<li class="${win ? 'win' : ''}"><b>${e(o.label)}</b>${win ? ' <span aria-label="Correct">✓</span>' : ''}<span class="n">${n} ${n === 1 ? 'pick' : 'picks'}</span></li>`; }).join('')}</ul>
    <p class="meta">${total} of ${Number(room.participantCount) || 0} answered · answer on your phone</p></section>` : `<section class="card rb-call"><h2>${room.phase === 'final' ? 'Game complete' : room.phase === 'lobby' ? `Join with code ${e(room.code)}` : 'Next call coming up'}</h2></section>`;
  const rows = view.standings.slice(0, 6).map((row) => `<li class="standing"><span class="rank">${Number(row.rank) || 0}</span><span class="name">${e(row.name)}</span><span class="total">${pts(row.total)}</span></li>`).join('');
  const winners = room.phase === 'final' ? view.standings.filter((row) => row.rank === 1) : [];
  const accent = safeColor(game.home.color);
  return `<header class="head"><div><div class="brand">Benchwarmers <span class="phase">${e(source)}</span></div><h1>${e(room.name)}</h1><div class="code" aria-label="Room code">Room ${e(room.code)}</div></div>
    <div class="rb-scorebug">${team('away')}<span class="clock">${clock}</span>${team('home')}</div></header>
    ${winners.length ? `<p class="rb-winner" style="background:${accent};color:${readableText(accent)}">${winners.length > 1 ? 'Tied winners' : 'Winner'}: ${winners.map((w) => e(w.name)).join(' & ')}</p>` : ''}
    ${question}
    <section class="card"><h2>Standings</h2>${rows ? `<ol class="standings">${rows}</ol>` : '<p class="meta">No players yet.</p>'}${view.standings.length > 6 ? `<p class="meta">+${view.standings.length - 6} more</p>` : ''}</section>
    ${opts.error ? `<p class="error" role="alert">${e(opts.error)} <button data-action="room-refresh">Retry</button></p>` : ''}
    <p class="foot"><button class="tab" data-action="room-refresh"${opts.pending ? ' disabled' : ''}>${opts.pending ? 'Refreshing…' : 'Refresh'}</button></p>`;
}
