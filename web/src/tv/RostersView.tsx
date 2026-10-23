import type { PartyStateResponse } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { formatPoints } from './pops';
import { playerInfo, worstPerformer } from './rosters';

export function RostersView({ state }: { state: PartyStateResponse; serverNow: () => number }) {
  const { game, households } = state;
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const worst = worstPerformer(state);
  return (
    <section className="tv-view tv-rosters">
      <header className="tv-rosters-head">
        <h2>Rosters</h2>
        <span className="tv-rosters-score">
          <span style={{ color: game.home.color }}>{game.home.short} {game.home.score}</span>
          <span className="tv-muted"> – </span>
          <span style={{ color: game.away.color }}>{game.away.score} {game.away.short}</span>
        </span>
        <span className="tv-rosters-clock">{game.clock}</span>
      </header>
      <div className="tv-rosters-grid" role="region" aria-label="Party rosters" tabIndex={0} data-tv-scroll>
        {rows.map((row) => {
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
                <Avatar avatar={row.avatar} name={row.name} color={color} size={88} />
                <div className="tv-roster-id">
                  <div className="tv-roster-name">{row.name}</div>
                  <div className="tv-roster-hh" style={{ color }}>
                    {row.household}{city ? ` · ${city}` : ''}
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
                        {isWorst ? <span className="tv-benchwarmer-tag">Postgame note: Benchwarmer</span> : null}
                      </div>
                      <div className="tv-rp-pts">{formatPoints(r.points)}</div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
