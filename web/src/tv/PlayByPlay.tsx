import type { EventView, Household, Sport } from '@shared/types';
import { useRef } from 'react';
import { useNewIds } from '../fx/fx';
import { useFlip } from './flip';
import { formatPop, memberColor } from './pops';

const NEUTRAL = '#8892a6';

/** Game-time tag from tip-off seconds: 308 -> "Q3 0:52". */
export function gameTag(t: number, sport?: Sport, durationSec = 480, regulationSec?: number): string {
  if (regulationSec !== undefined && t >= regulationSec) {
    // Overtime (imported real games): 60 game-second windows after regulation, no clock.
    const otCount = Math.max(1, Math.round((durationSec - regulationSec) / 60));
    const n = Math.min(otCount, Math.floor((t - regulationSec) / 60) + 1);
    return n === 1 ? 'OT' : `${n}OT`;
  }
  const periodSec = (regulationSec ?? durationSec) / 4;
  const period = Math.min(4, Math.floor(t / periodSec) + 1);
  const remaining = Math.max(0, Math.ceil((period * periodSec - t) * (sport === 'football' ? 7.5 : 1) - 1e-9));
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return `Q${period} ${m}:${String(s).padStart(2, '0')}`;
}

export function PlayByPlay({
  events,
  households,
  homeColor,
  awayColor,
  sport,
  durationSec,
  regulationSec,
  compact = false,
}: {
  events: EventView[];
  households: Household[];
  homeColor: string;
  awayColor: string;
  sport?: Sport;
  durationSec?: number;
  regulationSec?: number;
  compact?: boolean;
}) {
  const latest = events.slice(0, compact ? 1 : 3);
  const fresh = useNewIds(events.map(event => event.id));
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, latest.map(event => event.id));
  return (
    <div className={`tv-pbp${compact ? ' is-compact' : ''}`} aria-label="Recent plays">
      <ol className="tv-pbp-list" ref={list}>
        {latest.map((e) => {
          const color = e.team === 'home' ? homeColor : e.team === 'away' ? awayColor : NEUTRAL;
          return (
            <li key={e.id} data-flip-key={e.id} className={`tv-pbp-row${fresh.includes(e.id) ? ' is-new' : ''}`} data-type={e.type} style={{ ['--team' as string]: color }}>
              <span className="tv-pbp-time">{gameTag(e.t, sport, durationSec, regulationSec)}</span>
              <span className="tv-pbp-text">{e.text}</span>
              {e.fantasy.map((f, i) => (
                <span key={i} className="tv-chip" style={{ borderColor: memberColor(households, f.memberId) }}>
                  {formatPop(f)}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
