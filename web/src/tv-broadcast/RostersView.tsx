import { useState } from 'react';
import type { PartyStateResponse } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { formatPoints } from './pops';
import { playerInfo, worstPerformer } from './rosters';

export const MEMBERS_PER_PAGE = 4;

export function RostersView({ state }: { state: PartyStateResponse; serverNow: () => number }) {
  const { game, households } = state;
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const worst = worstPerformer(state);
  const pageCount = Math.max(1, Math.ceil(rows.length / MEMBERS_PER_PAGE));
  const [requested, setPage] = useState(0);
  const page = Math.min(requested, pageCount - 1);
  const visible = rows.slice(page * MEMBERS_PER_PAGE, (page + 1) * MEMBERS_PER_PAGE);
  return (
    <section className="tv-view tv-rosters">
      <header className="tv-rosters-head">
        <h2>Rosters</h2>
        <span className="tv-rosters-score">
          <span>{game.home.short} {game.home.score}</span>
          <span className="tv-muted"> – </span>
          <span>{game.away.score} {game.away.short}</span>
        </span>
        <span className="tv-rosters-clock">{game.clock}</span>
        {pageCount > 1 ? (
          <nav className="tv-roster-pager" aria-label="Roster pages">
            <button type="button" className="tv-action" data-tv-action onClick={() => setPage((page + pageCount - 1) % pageCount)}>Previous</button>
            <span role="status">Players {page * MEMBERS_PER_PAGE + 1}-{page * MEMBERS_PER_PAGE + visible.length} of {rows.length}</span>
            <button type="button" className="tv-action" data-tv-action onClick={() => setPage((page + 1) % pageCount)}>Next</button>
          </nav>
        ) : null}
      </header>
      <div className="tv-rosters-grid" role="region" aria-label="Party rosters" tabIndex={0} data-tv-scroll>
        {visible.map((row) => {
          const color = householdColor(households, row.householdId);
          const city = households.find((h) => h.id === row.householdId)?.city;
          return (
            <article
              key={row.memberId}
              className="tv-roster-col" tabIndex={0} role="region" aria-label={`${row.name} roster`} data-tv-scroll
              data-member={row.memberId}
              style={{ ['--hh' as string]: color }}
            >
              <header className="tv-roster-top">
                <Avatar avatar={row.avatar} name={row.name} color={color} size={56} />
                <div className="tv-roster-id">
                  <div className="tv-roster-name">{row.name}</div>
                  <div className="tv-roster-hh">
                    {city ?? row.household}
                  </div>
                </div>
                <div className="tv-roster-rank">
                  <span className="tv-roster-rank-n">#{row.rank}</span>
                  <span className="tv-roster-total">{row.total.toFixed(1)}</span>
                </div>
              </header>
              <ul className="tv-roster-players">
                {row.roster.map((r) => {
                  const info = playerInfo(state, r.playerId);
                  const team = info?.side === 'away' ? game.away : game.home;
                  const isWorst = state.party.status === 'final' && worst?.memberId === row.memberId && worst.playerId === r.playerId;
                  const nick = info?.player.nickname ?? info?.player.name ?? r.playerId;
                  return (
                    <li
                      key={r.playerId}
                      className={`tv-roster-player${isWorst ? ' is-cold' : ''}`}
                      data-player={r.playerId}
                      style={{ ['--team' as string]: team.color }}
                    >
                      <div className="tv-rp-main">
                        <div className="tv-rp-nick">{nick}</div>
                        <div className="tv-rp-meta">
                          {info ? `#${info.player.number} ${info.player.position} · ${info.teamShort}` : r.playerId}
                        </div>
                        <div className="tv-rp-stat">{r.statLine}</div>
                      </div>
                      <div className="tv-rp-score"><div className="tv-rp-pts">{formatPoints(r.points)}</div>{isWorst ? <span className="tv-benchwarmer-tag">Benchwarmer</span> : null}</div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
        {rows.length === 0 ? <p className="tv-muted">No players yet.</p> : null}
      </div>
    </section>
  );
}
