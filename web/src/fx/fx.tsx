import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './fx.css';

// Broadcast effects shared by the TV and phone views: play banners, side confetti,
// lower-third toasts and score bumps. Everything is CSS-driven and short-lived.

export type Tone = 'score' | 'turnover' | 'big' | 'info' | 'win';

let seq = 0;
const nextKey = () => ++seq;

/** Items that remove themselves `ttl` ms after being pushed. */
export function useTimedList<T>(ttl: number) {
  const [items, setItems] = useState<(T & { key: number })[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  const push = useCallback((item: T) => {
    const key = nextKey();
    setItems((list) => [...list, { ...item, key }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((list) => list.filter((x) => x.key !== key));
    }, ttl);
    timers.current.add(timer);
  }, [ttl]);
  return { items, push };
}

/** Ids present now that were not present last render. Empty until the first `ready` render, so nothing replays on load. */
export function useNewIds(ids: string[], ready = true): string[] {
  const seen = useRef<Set<string> | null>(null);
  const joined = ids.join('\u0000');
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) { seen.current = new Set(ids); return; }
    const added = ids.filter((id) => !seen.current!.has(id));
    for (const id of added) seen.current.add(id);
    if (added.length) setFresh(added);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, ready]);
  return fresh;
}

export type Climb = { id: string; from: number; to: number };

/** Rows whose rank improved since the last change. Never reports on the first render. */
export function useRankClimbs(rows: { id: string; rank: number }[], onClimb: (climbs: Climb[]) => void) {
  const prev = useRef<Map<string, number> | null>(null);
  const cb = useRef(onClimb);
  cb.current = onClimb;
  const key = rows.map((r) => `${r.id}:${r.rank}`).join('|');
  useEffect(() => {
    const now = new Map(rows.map((r) => [r.id, r.rank]));
    if (prev.current) {
      const climbs: Climb[] = [];
      for (const [id, rank] of now) {
        const before = prev.current.get(id);
        if (before !== undefined && rank < before) climbs.push({ id, from: before, to: rank });
      }
      if (climbs.length) cb.current(climbs.sort((a, b) => a.to - b.to));
    }
    prev.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ---------- Play banner ----------

export type Banner = { title: string; sub?: string; tone: Tone; color?: string };
const BANNER_MS = 2600;

/** One banner at a time; later ones wait their turn (max 2 queued so the screen never lags the game). */
export function useBanners() {
  const [current, setCurrent] = useState<(Banner & { key: number }) | null>(null);
  const queue = useRef<Banner[]>([]);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showNext = useCallback(() => {
    const next = queue.current.shift();
    if (!next) { busy.current = false; setCurrent(null); return; }
    busy.current = true;
    setCurrent({ ...next, key: nextKey() });
    timer.current = setTimeout(showNext, BANNER_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const announce = useCallback((banner: Banner) => {
    queue.current = [...queue.current, banner].slice(-2);
    if (!busy.current) showNext();
  }, [showNext]);
  return { current, announce };
}

/** True for colours dark enough that the banner needs light text. */
export function isDark(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
}

export function PlayBanner({ banner }: { banner: (Banner & { key: number }) | null }) {
  if (!banner) return null;
  return (
    <div className={`fx-banner is-${banner.tone}${banner.color && isDark(banner.color) ? ' is-dark' : ''}`} key={banner.key} style={banner.color ? { '--fx-accent': banner.color } as CSSProperties : undefined} role="status" aria-live="polite">
      <div className="fx-banner-sweep" aria-hidden="true" />
      <div className="fx-banner-body">
        <strong>{banner.title}</strong>
        {banner.sub ? <span>{banner.sub}</span> : null}
      </div>
    </div>
  );
}

// ---------- Side confetti ----------

export type Burst = { side: 'left' | 'right'; top: number; colors: string[] };
const PIECES = 16;

export function useBursts() {
  return useTimedList<Burst>(1800);
}

export function BurstLayer({ bursts }: { bursts: (Burst & { key: number })[] }) {
  return (
    <div className="fx-burst-layer" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.key} className={`fx-burst is-${b.side}`} style={{ top: `${b.top}%` }}>
          {Array.from({ length: PIECES }, (_, i) => {
            const angle = -70 + (i / (PIECES - 1)) * 140 + ((b.key * 37 + i * 53) % 13) - 6;
            const dist = 90 + ((b.key * 17 + i * 29) % 110);
            const rad = (angle * Math.PI) / 180;
            const dx = Math.cos(rad) * dist * (b.side === 'left' ? 1 : -1);
            const dy = Math.sin(rad) * dist;
            return <i key={i} style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--rot': `${(i * 67) % 360}deg`, background: b.colors[i % b.colors.length], animationDelay: `${(i % 4) * 25}ms` } as CSSProperties} />;
          })}
        </div>
      ))}
    </div>
  );
}

// ---------- Lower-third toasts ----------

export type Toast = { text: ReactNode; tone?: Tone; color?: string };

export function useToasts() {
  return useTimedList<Toast>(3200);
}

export function ToastLayer({ toasts, placement = 'bottom' }: { toasts: (Toast & { key: number })[]; placement?: 'bottom' | 'top' }) {
  return (
    <div className={`fx-toast-layer is-${placement}`} role="status" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div key={t.key} className={`fx-toast is-${t.tone ?? 'info'}`} style={t.color ? { '--fx-accent': t.color } as CSSProperties : undefined}>{t.text}</div>
      ))}
    </div>
  );
}

// ---------- Score bump ----------

/** A number that bumps and glows whenever it changes (not on first paint). */
export function ScoreTick({ value, className = '' }: { value: number | string; className?: string }) {
  const first = useRef(true);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBump((n) => n + 1);
  }, [value]);
  return <span key={bump} className={`fx-tick${bump ? ' is-bumped' : ''}${className ? ` ${className}` : ''}`}>{value}</span>;
}

export const CONFETTI = ['#eda77b', '#e4c6a7', '#a9d3b4', '#b9b3e3', '#f3ecdf'];
