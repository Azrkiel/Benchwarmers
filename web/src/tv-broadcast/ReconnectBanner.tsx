import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCountdown } from '../lib/usePartyState';

/** Seconds since `state` last changed while the connection was healthy; ticks while `error` is set. */
export function useStaleAge(state: unknown, error: unknown, now: () => number = Date.now): number {
  const lastOk = useRef(now());
  const [, tick] = useState(0);
  useEffect(() => { if (!error) lastOk.current = now(); }, [state, error, now]);
  useEffect(() => {
    if (!error) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [error]);
  return Math.max(0, Math.floor((now() - lastOk.current) / 1000));
}

export function ReconnectBanner({ state, error, retry }: { state: unknown; error: unknown; retry: () => void }): ReactNode {
  const age = useStaleAge(state, error);
  if (!error) return null;
  return (
    <div className="tv-reconnecting" role="status">
      Connection interrupted · Showing update from {formatCountdown(age)} ago
      <button autoFocus className="tv-action" data-tv-action onClick={retry}>Retry</button>
      <Link className="tv-action" to="/">Edit code</Link>
    </div>
  );
}
