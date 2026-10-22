import type { PartyStateResponse, StandingRow } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { formatPoints } from './pops';

export function Leader({ row, state }: { row: StandingRow; state: PartyStateResponse }) {
  const city = state.households.find((h) => h.id === row.householdId)?.city;
  const color = householdColor(state.households, row.householdId);
  return (
    <section className="tv-leader" data-testid="leader">
      <div className="tv-leader-kicker">👑 Top of the bench</div>
      <div className="tv-leader-main">
        <Avatar avatar={row.avatar} name={row.name} color={color} size={96} />
        <div className="tv-leader-id">
          <div className="tv-leader-name">{row.name}</div>
          {city ? <div className="tv-muted">{city}</div> : null}
        </div>
        <div className="tv-leader-total">{row.total.toFixed(1)}</div>
      </div>
      <ul className="tv-leader-roster">
        {row.roster.map((r) => {
          const entry = state.draftBoard.find((e) => e.player.id === r.playerId);
          const name = entry?.player.nickname ?? entry?.player.name ?? r.playerId;
          return (
            <li key={r.playerId} className="tv-leader-player">
              <span className="tv-leader-pname">
                {entry ? <span className="tv-leader-position">{entry.player.position}</span> : null}
                {name}
              </span>
              <span className="tv-leader-pts">{formatPoints(r.points)}</span>
              <span className="tv-leader-stat">{r.statLine}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
