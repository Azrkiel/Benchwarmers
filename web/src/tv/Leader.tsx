import type { PartyStateResponse, StandingRow } from '@shared/types';
import { Avatar, householdColor } from './avatar';

export function Leader({ row, state }: { row: StandingRow; state: PartyStateResponse }) {
  const city = state.households.find((h) => h.id === row.householdId)?.city;
  const color = householdColor(state.households, row.householdId);
  const runnerUp = [...state.standings].sort((a, b) => a.rank - b.rank).find((r) => r.memberId !== row.memberId);
  const margin = runnerUp ? row.total - runnerUp.total : undefined;
  return (
    <section className="tv-leader" data-testid="leader">
      <div className="tv-leader-kicker">Top of the bench <span>01</span></div>
      <div className="tv-leader-main">
        <Avatar avatar={row.avatar} name={row.name} color={color} size={64} />
        <div className="tv-leader-id">
          <div className="tv-leader-name">{row.name}</div>
        </div>
        <div className="tv-leader-total">{row.total.toFixed(1)}</div>
      </div>
      <div className="tv-leader-gap">
        <span>{margin === undefined ? 'Tonight’s leader' : margin === 0 ? 'Level on points' : `${margin.toFixed(1)} points clear`}</span>
        {city ? <span className="tv-leader-city">{city}</span> : null}
      </div>
    </section>
  );
}
