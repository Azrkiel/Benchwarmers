import type { DriveResult, PartyStateResponse } from '@shared/types';

const RESULT: Record<DriveResult, string> = {
  td: 'Touchdown', fg: 'Field goal', missed_fg: 'Missed field goal', punt: 'Punt',
  turnover: 'Turnover', downs: 'Turnover on downs', end_of_half: 'End of half', safety: 'Safety',
};

function yardLabel(yards: number): string {
  if (yards === 50) return 'midfield';
  return yards > 50 ? `own ${100 - yards}` : `opponent’s ${yards}`;
}

export function FootballField({ state }: { state: PartyStateResponse }) {
  // The response is newest-first. End markers can also be play events (e.g. interceptions).
  const event = state.recentEvents.find((e) => e.drive);
  const drive = event?.drive;
  const complete = state.party.status === 'final';
  const active = !complete && drive && !event.driveResult ? drive : undefined;
  const team = active ? state.game[active.team] : undefined;
  // Fixed orientation: home attacks right, away attacks left. This is a drive-start marker, not live tracking.
  const x = active ? 100 + (active.team === 'home' ? 100 - active.yardline100 : active.yardline100) * 10 : 0;
  const context = complete ? 'Game complete' : event?.driveResult
    ? `Drive ended · ${RESULT[event.driveResult]}` : active
      ? `Drive start · ${yardLabel(active.yardline100)}` : 'Waiting for the next drive';
  return (
    <section className="tv-football">
      <div className="tv-drive-kicker">{team ? `${team.name} ball` : 'Drive tracker'}</div>
      <div className="tv-drive-context">{context}</div>
      <svg className="tv-field" viewBox="0 0 1200 600" role="img" aria-label={`Football field: ${context}`}>
        <rect width="1200" height="600" rx="14" fill="#102e29" />
        <rect width="100" height="600" fill={state.game.home.color} opacity="0.65" />
        <rect x="1100" width="100" height="600" fill={state.game.away.color} opacity="0.65" />
        <g stroke="#d9f1e5" strokeWidth="3" opacity="0.5">
          <rect x="100" y="12" width="1000" height="576" fill="none" />
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={200 + i * 100} y1="12" x2={200 + i * 100} y2="588" />
          ))}
          {Array.from({ length: 19 }, (_, i) => (
            <path key={i} d={`M${150 + i * 50} 205v18 M${150 + i * 50} 377v18`} />
          ))}
        </g>
        <g fill="#d9f1e5" fontSize="36" fontWeight="800" textAnchor="middle">
          {Array.from({ length: 9 }, (_, i) => (
            <text key={i} x={200 + i * 100} y="85">{Math.min(i + 1, 9 - i) * 10}</text>
          ))}
          <text transform="translate(60 300) rotate(-90)">{state.game.home.short}</text>
          <text transform="translate(1140 300) rotate(90)">{state.game.away.short}</text>
        </g>
        {active ? (
          <g data-testid="field-marker" data-yardline={active.yardline100}>
            <line x1={x} y1="120" x2={x} y2="540" stroke="#ffb938" strokeWidth="6" strokeDasharray="12 8" />
            <circle cx={x} cy="300" r="30" fill={team!.color} stroke="#fff" strokeWidth="4" />
            <path d={active.team === 'home' ? `M${x - 8} 287l16 13-16 13` : `M${x + 8} 287l-16 13 16 13`}
              fill="none" stroke="#fff" strokeWidth="6" />
          </g>
        ) : null}
      </svg>
      {active ? <div className="tv-drive-note">Drive start position · {active.team === 'home' ? 'attacking right →' : '← attacking left'}</div> : null}
    </section>
  );
}
