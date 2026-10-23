import { useEffect, useRef, useState } from 'react';
import type { RoomStanding } from '@shared/room';
import { gameClockLabel, type RoomPlayerCall } from './points/types';

const nameOf = (standings: Pick<RoomStanding, 'participantId' | 'name'>[], id: string) => standings.find((row) => row.participantId === id)?.name ?? 'Someone';
const accepted = (call: RoomPlayerCall) => Object.values(call.pickCounts).reduce((a, b) => a + b, 0);
/** At creation only the creator has committed, so the single side with support is theirs. */
function creatorSide(call: RoomPlayerCall): string | undefined {
  const sides = call.options.filter((o) => (call.pickCounts[o.id] ?? 0) > 0);
  return sides.length === 1 ? sides[0]!.label : undefined;
}
function status(call: RoomPlayerCall): string {
  if ((call.status as string) === 'void') return 'Void';
  if (call.status === 'resolved') return `Result: ${call.options.find((o) => o.id === call.result?.optionId)?.label ?? '—'}`;
  return call.status === 'open' ? 'Open' : 'Locked';
}

/** One short line per newly created call ("Maya called Harbor Hawks"); never a stack of cards. */
export function useCallNotices(calls: RoomPlayerCall[] | undefined, standings: Pick<RoomStanding, 'participantId' | 'name'>[] = []): string {
  const seen = useRef<Set<string> | null>(null);
  const [notice, setNotice] = useState('');
  const ids = (calls ?? []).map((c) => c.id).join('|');
  useEffect(() => {
    const list = calls ?? [];
    if (seen.current === null) { seen.current = new Set(list.map((c) => c.id)); return; }
    const fresh = list.filter((c) => !seen.current!.has(c.id));
    for (const c of fresh) seen.current.add(c.id);
    const latest = fresh.at(-1);
    if (latest) setNotice(`${nameOf(standings, latest.creatorId)} called ${creatorSide(latest) ?? latest.text}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);
  return notice;
}

/** Separate Calls view (P11.7): the featured question keeps the main screen. */
export function CallsList({ calls, standings = [], className = 'rd-calls' }: { calls: RoomPlayerCall[]; standings?: Pick<RoomStanding, 'participantId' | 'name'>[]; className?: string }) {
  return <section className={className} aria-label="Player calls">
    {calls.length ? <ul>{calls.map((c) => <li key={c.id} className={`is-${c.status}`}>
      <b>{nameOf(standings, c.creatorId)}</b> <span>{c.text}</span>
      <small>{c.target ? `By ${gameClockLabel(c.target.horizonGameElapsedMs)}` : ''} · {c.options.map((o) => `${o.label} ${c.pickCounts[o.id] ?? 0}`).join(' · ')} · {accepted(c)} committed</small>
      <em>{status(c)}</em>
    </li>)}</ul> : <p className="rd-empty">No player calls yet.</p>}
  </section>;
}
