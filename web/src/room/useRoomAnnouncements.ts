import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { possessionTeamId } from './sport';

export type Announcement = { key: string; text: string; priority: number };

const SCORING = new Set(['score', 'td', 'fg']);
const BASKET: Record<number, string> = { 1: 'Free throw', 2: 'Two', 3: 'Three' };

/**
 * Short spoken cues for what changed between two public snapshots. It never reads
 * every stat, never hints at an answer before resolution, and returns nothing for
 * the first snapshot so a reload does not replay old moments.
 */
export function announcementsFor(prev: RoomView | undefined, next: RoomView): Announcement[] {
  if (!prev || prev.room.code !== next.room.code) return [];
  const out: Announcement[] = [];
  const q = next.question;
  if (q && q.status === 'open' && (prev.question?.id !== q.id || prev.question.status !== 'open')) {
    const holder = possessionTeamId(next);
    const team = holder === next.game.home.id ? next.game.home : holder === next.game.away.id ? next.game.away : undefined;
    out.push({ key: `open:${q.id}`, text: `${team ? `${team.name.split(' ').at(-1)} ball. ` : ''}${q.text}`, priority: 2 });
  }
  const resolved = next.lastQuestion?.result ? next.lastQuestion : q?.result ? q : undefined;
  const before = prev.lastQuestion?.result ? prev.lastQuestion : prev.question?.result ? prev.question : undefined;
  if (resolved?.result && (before?.id !== resolved.id || !before.result)) {
    const option = resolved.options.find((o) => o.id === resolved.result!.optionId);
    const count = resolved.pickCounts[resolved.result.optionId] ?? 0;
    out.push({ key: `result:${resolved.id}`, text: `${option?.label ?? 'Result'}. ${count ? `${count} called it.` : 'Nobody had it.'}`, priority: 1 });
  }
  const seen = new Set(prev.game.recentPlays.map((p) => p.id));
  const scored = next.game.recentPlays.filter((p) => !seen.has(p.id) && SCORING.has(p.kind));
  const homeDelta = next.game.home.score - prev.game.home.score;
  const awayDelta = next.game.away.score - prev.game.away.score;
  if (scored.length && (homeDelta > 0 || awayDelta > 0)) {
    const team = homeDelta > 0 ? next.game.home : next.game.away;
    const delta = homeDelta > 0 ? homeDelta : awayDelta;
    const short = team.name.split(' ').at(-1);
    const what = next.game.sport === 'basketball' && scored.length === 1 ? BASKET[delta] ?? `${delta} points` : scored.at(-1)!.kind === 'td' ? 'Touchdown' : scored.at(-1)!.kind === 'fg' ? 'Field goal' : `${delta} points`;
    const leaderBefore = prev.standings.filter((r) => r.rank === 1).map((r) => r.participantId).join();
    const leaders = next.standings.filter((r) => r.rank === 1);
    const lead = leaders.length === 1 && leaders[0]!.participantId !== leaderBefore && leaders[0]!.total > 0 ? ` ${leaders[0]!.name} takes the lead.` : '';
    out.push({ key: `score:${scored.at(-1)!.id}`, text: `${what} for the ${short}.${lead}`, priority: 3 });
  }
  if (next.room.phase === 'final' && prev.room.phase !== 'final') {
    const winners = next.standings.filter((r) => r.rank === 1);
    out.push({ key: 'final', text: `Final. ${winners.length > 1 ? `${winners.map((w) => w.name).join(' and ')} tie for the win.` : winners[0] ? `${winners[0].name} wins the night.` : ''}`.trim(), priority: 4 });
  }
  return out;
}

/**
 * Speaks the most important new cue (if this screen may speak) and always shows it
 * as a caption. Announcements never touch focus or game state.
 */
export function useRoomAnnouncements(view: RoomView | undefined, speak: ((text: string) => void) | undefined) {
  const prev = useRef<RoomView | undefined>(undefined);
  const said = useRef(new Set<string>());
  const [caption, setCaption] = useState('');
  const version = view ? `${view.room.code}:${view.version ?? ''}:${view.game.recentPlays.at(-1)?.id ?? ''}:${view.question?.id ?? ''}:${view.question?.status ?? ''}:${view.room.phase}` : '';
  useEffect(() => {
    if (!view) return;
    const fresh = announcementsFor(prev.current, view).filter((a) => !said.current.has(a.key));
    prev.current = view;
    if (!fresh.length) return;
    for (const a of fresh) said.current.add(a.key);
    const top = fresh.sort((a, b) => b.priority - a.priority)[0]!;
    setCaption(top.text);
    speak?.(top.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useEffect(() => { if (!caption) return; const timer = setTimeout(() => setCaption(''), 6000); return () => clearTimeout(timer); }, [caption]);
  return { caption };
}
