import type { PartyStateResponse, SeasonResponse, StandingRow } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { findMember, formatPoints } from './pops';
import { playerInfo, worstPerformer } from './rosters';

function PodiumBlock({ row, place, state }: { row: StandingRow; place: 1 | 2 | 3; state: PartyStateResponse }) {
  const color = householdColor(state.households, row.householdId);
  return (
    <div className={`tv-podium-block tv-podium-${place}`} data-place={place} style={{ ['--hh' as string]: color }}>
      <div className="tv-podium-label">{place === 1 ? 'Winner' : `${place === 2 ? 'Second' : 'Third'} place`}</div>
      <Avatar avatar={row.avatar} name={row.name} color={color} size={place === 1 ? 96 : 72} />
      <div className="tv-podium-name">{row.name}</div>
      <div className="tv-podium-hh">{row.household}</div>
      <div className="tv-podium-total">{row.total.toFixed(1)}</div>
      <div className="tv-podium-step"><span>{place}</span></div>
    </div>
  );
}

export function FinalView({ state, season, seasonError = false }: { state: PartyStateResponse; serverNow: () => number; season?: SeasonResponse; seasonError?: boolean }) {
  const { game } = state;
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const [first, second, third] = rows;
  const rest = rows.slice(3);
  const homeWin = game.home.score > game.away.score;
  const awayWin = game.away.score > game.home.score;

  const recap = state.recap ?? (first ? `${first.name} wins the night with ${formatPoints(first.total)} points.` : '');

  let bench: { playerName: string; ownerName: string; points: number } | undefined = state.benchwarmerOfTheNight;
  if (!bench) {
    const w = worstPerformer(state);
    if (w) {
      const info = playerInfo(state, w.playerId);
      bench = {
        playerName: info?.player.nickname ?? info?.player.name ?? w.playerId,
        ownerName:
          findMember(state.households, w.memberId)?.member.name ??
          state.standings.find((s) => s.memberId === w.memberId)?.name ??
          '',
        points: w.points,
      };
    }
  }

  const seasonRows = season ? [...season.rows].sort((a, b) => a.rank - b.rank) : [];

  return (
    <section className="tv-view tv-final">
      <div className="tv-final-left">
        <header className="tv-final-head">
          <h2>Final</h2>
          <div className="tv-final-score">
            <span className={`tv-final-team${homeWin ? ' is-winner' : ''}`}>
              {game.home.name} <b>{game.home.score}</b>
            </span>
            <span className="tv-muted">–</span>
            <span className={`tv-final-team${awayWin ? ' is-winner' : ''}`}>
              <b>{game.away.score}</b> {game.away.name}
            </span>
          </div>
        </header>
        <div className="tv-podium">
          {second ? <PodiumBlock row={second} place={2} state={state} /> : null}
          {first ? <PodiumBlock row={first} place={1} state={state} /> : null}
          {third ? <PodiumBlock row={third} place={3} state={state} /> : null}
        </div>
        {rest.length > 0 ? (
          <ul className="tv-final-rest">
            {rest.map((r) => (
              <li key={r.memberId}>
                <span className="tv-final-rest-rank">{r.rank}</span>
                <Avatar avatar={r.avatar} name={r.name} color={householdColor(state.households, r.householdId)} size={48} />
                <span className="tv-final-rest-name">{r.name}</span>
                <span className="tv-final-rest-pts">{r.total.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="tv-final-right">
        <section className="tv-recap">
          <h3>Recap</h3>
          <blockquote>{recap}</blockquote>
        </section>
        {bench ? (
          <section className="tv-bench-night">
            <div className="tv-bench-body">
              <h3>Benchwarmer of the night</h3>
              <div className="tv-bench-line">
                <b>{bench.playerName}</b>
                <span className="tv-muted"> · drafted by {bench.ownerName}</span>
              </div>
            </div>
            <div className="tv-bench-pts">{formatPoints(bench.points)}</div>
          </section>
        ) : null}
        <section className="tv-season">
          <h3>
            Season standings{season ? <span className="tv-muted"> · {season.crew.name}</span> : null}
          </h3>
          {season ? (
            <table className="tv-season-table">
              <thead>
                <tr>
                  <th scope="col">#</th><th scope="col">Player</th><th scope="col">Wins</th><th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map((r) => {
                  const color = householdColor(season.households, r.householdId);
                  return (
                    <tr key={r.memberId} data-member={r.memberId}>
                      <td>{r.rank}</td>
                      <td className="tv-season-who">
                        <Avatar avatar={r.avatar} name={r.name} color={color} size={40} />
                        <span>{r.name}</span>
                      </td>
                      <td>{r.nightsWon}</td>
                      <td>{formatPoints(r.points)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="tv-season-loading" role="status">{seasonError ? 'Season standings unavailable. Reopen Results to try again.' : 'Season standings loading…'}</div>
          )}
        </section>
      </div>
    </section>
  );
}
