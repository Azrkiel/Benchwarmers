import { useEffect, useRef, useState } from 'react';

/** One bounded scoring celebration. Purely presentational; scores are already on screen. */
export type Celebration = { id: string; kind: 'basket' | 'score' | 'final'; title: string; sub?: string; color: string; points?: number };
export type CelebrationQueue = { current: Celebration | null; pending: Celebration | null; coalesced: number };
export const EMPTY_QUEUE: CelebrationQueue = { current: null, pending: null, coalesced: 0 };
export const CELEBRATION_MS = 2200;
export const REDUCED_MS = 1400;

/**
 * One main celebration at a time. Ordinary scores that arrive meanwhile are only
 * counted (the play feed already lists them); a final waits as the single pending
 * high-priority effect. Nothing queues long enough to lag behind the game.
 */
export function enqueue(queue: CelebrationQueue, next: Celebration): CelebrationQueue {
  if (!queue.current) return { current: next, pending: null, coalesced: 0 };
  if (next.kind === 'final') return { ...queue, pending: next };
  return { ...queue, coalesced: queue.coalesced + 1 };
}
export function advance(queue: CelebrationQueue): CelebrationQueue {
  return { current: queue.pending, pending: null, coalesced: 0 };
}

type Team = { id: string; name: string; short: string; color: string; score: number };
type Play = { id: string; kind: string; teamId?: string; points?: number };
export type CelebrationInput = { sport: 'basketball' | 'football'; home: Team; away: Team; plays: Play[] };

const SCORING = new Set(['score', 'td', 'fg']);
const BASKET: Record<number, string> = { 1: 'Free throw', 2: 'Bucket', 3: 'Three' };

/**
 * Turns new accepted score events into celebrations. The trigger is an unseen scoring
 * play id, never a bare total change: a total that moves without a new scoring play is
 * reported as a correction instead. The first snapshot is quiet, so reloads replay nothing.
 */
export function useCelebrations(input: CelebrationInput | undefined, { reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  const [queue, setQueue] = useState<CelebrationQueue>(EMPTY_QUEUE);
  const [corrected, setCorrected] = useState(0);
  const prevScore = useRef<{ home: number; away: number } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const ids = (input?.plays ?? []).map((play) => play.id).join('\u0000');

  // New ids and the score delta are read in the same pass so a snapshot that adds a
  // scoring play and its points is attributed as one event.
  useEffect(() => {
    if (!input) return;
    const before = prevScore.current;
    prevScore.current = { home: input.home.score, away: input.away.score };
    const newPlays = input.plays.filter((play) => !seen.current.has(play.id));
    for (const play of newPlays) seen.current.add(play.id);
    if (!before) return;
    const homeDelta = input.home.score - before.home;
    const awayDelta = input.away.score - before.away;
    const final = newPlays.find((play) => play.kind === 'final');
    const scoring = newPlays.filter((play) => SCORING.has(play.kind));
    if (final) {
      setQueue((q) => enqueue(q, { id: final.id, kind: 'final', title: 'Final', sub: `${input.away.short} ${input.away.score} · ${input.home.short} ${input.home.score}`, color: '#f51825' }));
      return;
    }
    if (!scoring.length) {
      if (homeDelta !== 0 || awayDelta !== 0) setCorrected((n) => n + 1);
      return;
    }
    if (homeDelta <= 0 && awayDelta <= 0) return; // A scoring play with no score movement cannot be attributed; stay quiet.
    const latest = scoring.at(-1)!;
    // When one snapshot carries several baskets (a fast replay), celebrate the latest one at
    // its own value and count the rest, rather than summing them into one impossible shot.
    const own = latest.points && latest.teamId ? [input.home, input.away].find((t) => t.id === latest.teamId) : undefined;
    const team = own ?? (homeDelta > 0 ? input.home : input.away);
    const delta = own ? latest.points! : team === input.home ? homeDelta : awayDelta;
    const title = input.sport === 'basketball' ? (own || scoring.length === 1 ? BASKET[delta] ?? `${delta} points` : `${delta} points`)
      : latest.kind === 'td' ? 'Touchdown' : latest.kind === 'fg' ? 'Field goal' : `${delta} points`;
    const extra = own ? scoring.length - 1 : 0;
    setQueue((q) => { const next = enqueue(q, { id: latest.id, kind: input.sport === 'basketball' ? 'basket' : 'score', title, sub: team.name, color: team.color, points: delta }); return { ...next, coalesced: next.coalesced + extra }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, input?.home.score, input?.away.score]);

  const currentId = queue.current?.id;
  useEffect(() => {
    if (!currentId) return;
    const timer = setTimeout(() => setQueue(advance), reducedMotion ? REDUCED_MS : CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [currentId, reducedMotion]);

  return { celebration: queue.current, coalesced: queue.coalesced, pending: queue.pending, corrected };
}

export function prefersReducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
}
