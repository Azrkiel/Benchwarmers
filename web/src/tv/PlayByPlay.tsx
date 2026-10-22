import { useEffect, useRef, useState } from 'react';
import type { EventView, Household, Sport } from '@shared/types';
import { POP_MS, formatPop, memberColor, newEventIds } from './pops';

const NEUTRAL = '#8892a6';

/** Game-time tag from tip-off seconds: 308 -> "Q3 0:52". */
export function gameTag(t: number, sport?: Sport, durationSec = 480): string {
  const periodSec = durationSec / 4;
  const period = Math.min(4, Math.floor(t / periodSec) + 1);
  const remaining = Math.max(0, Math.ceil((period * periodSec - t) * (sport === 'football' ? 7.5 : 1) - 1e-9));
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return `Q${period} ${m}:${String(s).padStart(2, '0')}`;
}

type Pop = { key: number; text: string; color: string };

export function PlayByPlay({
  events,
  households,
  homeColor,
  awayColor,
  sport,
  durationSec,
}: {
  events: EventView[];
  households: Household[];
  homeColor: string;
  awayColor: string;
  sport?: Sport;
  durationSec?: number;
}) {
  const latest = events.slice(0, 3);
  const prevRef = useRef<Set<string> | undefined>(undefined);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const seqRef = useRef(0);
  const [pops, setPops] = useState<Pop[]>([]);

  // Only events new since the last poll float up; the first render seeds the ids silently.
  useEffect(() => {
    const ids = newEventIds(prevRef.current, events);
    prevRef.current = new Set(events.map((e) => e.id));
    if (ids.length === 0) return;
    const fresh: Pop[] = [];
    for (const e of events) {
      if (!ids.includes(e.id)) continue;
      for (const f of e.fantasy) {
        seqRef.current += 1;
        fresh.push({ key: seqRef.current, text: formatPop(f), color: memberColor(households, f.memberId) });
      }
    }
    if (fresh.length === 0) return;
    setPops((p) => [...p, ...fresh]);
    for (const pop of fresh) {
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        setPops((p) => p.filter((x) => x.key !== pop.key));
      }, POP_MS);
      timersRef.current.add(t);
    }
  }, [events, households]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <div className="tv-pbp">
      <div className="tv-pop-layer" aria-hidden="true">
        {pops.map((p) => (
          <div key={p.key} className="tv-pop-float" style={{ left: `${10 + ((p.key * 23) % 70)}%`, color: p.color }}>
            {p.text}
          </div>
        ))}
      </div>
      <ol className="tv-pbp-list">
        {latest.map((e) => {
          const color = e.team === 'home' ? homeColor : e.team === 'away' ? awayColor : NEUTRAL;
          return (
            <li key={e.id} className="tv-pbp-row" data-type={e.type} style={{ ['--team' as string]: color }}>
              <span className="tv-pbp-time">{gameTag(e.t, sport, durationSec)}</span>
              <span className="tv-pbp-text">{e.text}</span>
              {e.fantasy.map((f, i) => (
                <span key={i} className="tv-chip" style={{ background: memberColor(households, f.memberId) }}>
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
