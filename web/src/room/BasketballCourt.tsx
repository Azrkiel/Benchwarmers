import { useEffect, useRef, type CSSProperties } from 'react';
import { possessionTeamId, sourceStatus, type CourtPoint, type RoomGameNext, type RoomViewNext } from './sport';

/** Interpolate only between genuine observations this close together; jump otherwise. */
export const TRACK_GAP_MS = 1000;
export const TRACK_STALE_MS = 3000;
export const TRACK_HIDE_MS = 10000;

/** How to draw a tracked ball: glide time from the previous observation, and freshness. */
export function trackStyle(prev: { observedAt: number } | null, next: { observedAt: number }, serverNow: number) {
  const gap = prev ? next.observedAt - prev.observedAt : Infinity;
  const glideMs = gap > 0 && gap <= TRACK_GAP_MS ? gap : 0;
  const age = serverNow - next.observedAt;
  return { glideMs, freshness: age > TRACK_HIDE_MS ? 'hidden' as const : age > TRACK_STALE_MS ? 'stale' as const : 'fresh' as const };
}

/**
 * Full court, away basket left and home basket right (matching the scorebug).
 * Shows team possession only when the snapshot supplies it, a player only when one is
 * supplied, and an event marker labeled as an event location. No invented ball path.
 */
export function BasketballCourt({ view, eventPoint, compact = false }: { view: RoomViewNext; eventPoint?: CourtPoint | null; compact?: boolean }) {
  const game = view.game as RoomGameNext;
  const teamId = possessionTeamId(view);
  const team = teamId === game.home.id ? game.home : teamId === game.away.id ? game.away : undefined;
  const context = game.context?.sport === 'basketball' ? game.context : undefined;
  const player = context?.possessionPlayerId ? view.players.find((p) => p.id === context.possessionPlayerId) : undefined;
  const ball = context?.tracking === 'ball' ? context.ball : null;
  const live = game.sourceMode === 'live';
  const stale = sourceStatus(view) === 'stale';
  const lastBall = useRef<{ observedAt: number } | null>(null);
  const track = ball ? trackStyle(lastBall.current, ball, view.serverNow ?? ball.observedAt) : null;
  useEffect(() => { if (ball) lastBall.current = { observedAt: ball.observedAt }; }, [ball?.observedAt]);
  const label = team ? `${team.name} ball${player ? `, ${player.name}` : ''}` : view.room.phase === 'final' ? 'Game over' : 'Possession unknown';
  return <section className={`rd-court${compact ? ' is-compact' : ''}`} aria-label="Basketball court" style={{ '--team': team?.color ?? 'var(--lg-line)' } as CSSProperties}>
    <svg viewBox="0 0 940 500" role="img" aria-label={label}>
      <rect className="rd-court-floor" x="10" y="10" width="920" height="480" rx="6" />
      <g className="rd-court-lines">
        <rect x="10" y="10" width="920" height="480" rx="6" />
        <path d="M470 10V490" /><circle cx="470" cy="250" r="60" />
        <path d="M10 170H200V330H10M930 170H740V330H930" />
        <path d="M200 250m-60 0a60 60 0 1 0 120 0a60 60 0 1 0 -120 0M740 250m-60 0a60 60 0 1 0 120 0a60 60 0 1 0 -120 0" />
        <path d="M10 30H150A237 237 0 0 1 150 470H10M930 30H790A237 237 0 0 0 790 470H930" />
      </g>
      <g className="rd-court-hoops"><path d="M50 220V280M890 220V280" /><circle cx="63" cy="250" r="9" /><circle cx="877" cy="250" r="9" /></g>
      {/* Which basket a team attacks is not in the data, so possession tints the centre circle only. */}
      {team && <circle className="rd-court-possession" cx="470" cy="250" r="60" />}
      {eventPoint && <g className="rd-court-event"><circle cx={10 + eventPoint.x * 920} cy={10 + eventPoint.y * 480} r="16" /><text x={10 + eventPoint.x * 920} y={10 + eventPoint.y * 480 - 26} textAnchor="middle">Event location</text></g>}
      {ball && track && track.freshness !== 'hidden' && !stale && <circle className={`rd-court-ball is-${track.freshness}`} cx={10 + ball.point.x * 920} cy={10 + ball.point.y * 480} r="12" style={{ transition: track.glideMs ? `cx ${track.glideMs}ms linear, cy ${track.glideMs}ms linear` : 'none' }} />}
    </svg>
    <p className="rd-court-label"><b>{label}</b>{!compact && <small>{ball ? (track?.freshness === 'fresh' ? (live ? 'Tracked ball position' : 'Scripted ball position') : 'Ball position out of date') : team ? (live ? 'Live team possession' : 'Scripted possession') : 'No possession data'}</small>}</p>
  </section>;
}
