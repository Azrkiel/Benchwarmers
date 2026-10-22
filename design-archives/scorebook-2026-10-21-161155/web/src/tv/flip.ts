import { useLayoutEffect, useRef, type RefObject } from 'react';

export const FLIP_MS = 600;

export type Movement = 'up' | 'down' | 'same';

/** Lower rank number is better: rank < prevRank means the row climbed. */
export function rankMovement(row: { rank: number; prevRank: number }): Movement {
  if (row.rank < row.prevRank) return 'up';
  if (row.rank > row.prevRank) return 'down';
  return 'same';
}

/** key -> before.top - after.top; only non-zero deltas and only keys present in both. */
export function computeFlipDeltas(before: Map<string, number>, after: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, top] of after) {
    const prev = before.get(key);
    if (prev === undefined) continue;
    const d = prev - top;
    if (d !== 0) out.set(key, d);
  }
  return out;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * FLIP for keyed children: after each keys change, measure `[data-flip-key]` children,
 * invert moved rows to their previous position, then animate back to 0.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, keys: string[]): void {
  const prevRef = useRef<Map<string, number>>(new Map());
  const sig = keys.join('\u0000');

  useLayoutEffect(() => {
    void sig;
    const root = containerRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-key]'));
    const after = new Map<string, number>();
    for (const el of els) after.set(el.dataset.flipKey ?? '', el.offsetTop);
    const before = prevRef.current;
    prevRef.current = after;
    if (prefersReducedMotion()) return;

    const deltas = computeFlipDeltas(before, after);
    for (const el of els) {
      const d = deltas.get(el.dataset.flipKey ?? '');
      if (d === undefined) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${d}px)`;
      void el.offsetHeight; // force reflow so the inverted position is committed
      el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`;
      el.style.transform = '';
    }
  }, [containerRef, sig]);
}
