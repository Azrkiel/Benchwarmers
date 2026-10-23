import { useEffect, useRef, useState } from 'react';
import type { VoluntaryCall } from './points/types';

const STATE: Record<VoluntaryCall['state'], string> = { pending: 'Open', won: 'Won', lost: 'Missed', void: 'Void' };

/** One short line per newly created call ("Maya called Hawks score next"); never a stack of cards. */
export function useCallNotices(calls: VoluntaryCall[] | undefined): string {
  const seen = useRef<Set<string> | null>(null);
  const [notice, setNotice] = useState('');
  const ids = (calls ?? []).map((c) => c.id).join('|');
  useEffect(() => {
    const list = calls ?? [];
    if (seen.current === null) { seen.current = new Set(list.map((c) => c.id)); return; }
    const fresh = list.filter((c) => !seen.current!.has(c.id));
    for (const c of fresh) seen.current.add(c.id);
    const latest = fresh.at(-1);
    if (latest) setNotice(`${latest.creatorName} called ${latest.optionLabel}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);
  return notice;
}

/** Separate Calls view (P11.7): the featured question keeps the main screen. */
export function CallsList({ calls, className = 'rd-calls' }: { calls: VoluntaryCall[]; className?: string }) {
  return <section className={className} aria-label="Player calls">
    {calls.length ? <ul>{calls.map((c) => <li key={c.id} className={`is-${c.state}`}><b>{c.creatorName}</b> <span>{c.optionLabel}</span> <small>{c.horizonLabel} · {c.followers} {c.followers === 1 ? 'follower' : 'followers'}</small> <em>{STATE[c.state]}</em></li>)}</ul> : <p className="rd-empty">No player calls yet.</p>}
  </section>;
}
