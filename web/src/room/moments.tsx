import { useEffect, useRef } from 'react';
import type { RoomView } from '@shared/room';
import { CONFETTI, useBanners, useBursts, useNewIds, useRankClimbs, useToasts } from '../fx/fx';

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const PLAY_LABEL: Record<string, string> = { drive: 'New drive', drive_end: 'Drive over', td: 'Touchdown', fg: 'Field goal', int: 'Turnover', sack: 'Sack', pen: 'Flag', big: 'Big play', punt: 'Punt', halftime: 'Halftime', final: 'Final', pat: 'Extra point' };
export const playLabel = (kind: string) => PLAY_LABEL[kind];

type Options = { personal?: boolean };

/**
 * Watches successive room snapshots and turns changes into broadcast moments:
 * banners for scores and turnovers, toasts for flags/sacks/results, and confetti
 * when someone climbs the standings. Nothing fires for the first snapshot.
 */
export function useRoomMoments(view: RoomView | undefined, { personal = false }: Options = {}) {
  const banners = useBanners();
  const toasts = useToasts();
  const bursts = useBursts();
  const prevScore = useRef<{ home: number; away: number } | null>(null);
  const lastScorer = useRef<RoomView['game']['home'] | undefined>(undefined);
  const prevResult = useRef<string | null | undefined>(undefined);
  const prevMyPick = useRef<string | null | undefined>(undefined);

  const plays = view?.game.recentPlays ?? [];
  const fresh = useNewIds(plays.map((p) => p.id), !!view);

  useEffect(() => {
    if (!view || !fresh.length) return;
    const latest = plays.filter((p) => fresh.includes(p.id));
    const scorer = lastScorer.current;
    // One headline per batch: the most important new play wins.
    const order = ['final', 'td', 'int', 'fg', 'halftime', 'sack', 'big', 'pen'];
    const top = latest.filter((p) => order.includes(p.kind)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
    if (!top) return;
    if (top.kind === 'td') banners.announce({ title: 'Touchdown', sub: scorer?.name, tone: 'score', color: scorer?.color });
    else if (top.kind === 'fg') banners.announce({ title: 'Field goal', sub: scorer?.name, tone: 'score', color: scorer?.color });
    else if (top.kind === 'int') banners.announce({ title: 'Turnover', tone: 'turnover' });
    else if (top.kind === 'halftime') banners.announce({ title: 'Halftime', sub: `${view.game.away.short} ${view.game.away.score} · ${view.game.home.short} ${view.game.home.score}`, tone: 'info' });
    else if (top.kind === 'final') banners.announce({ title: 'Final', sub: `${view.game.away.short} ${view.game.away.score} · ${view.game.home.short} ${view.game.home.score}`, tone: 'win' });
    else toasts.push({ text: <>{playLabel(top.kind)}</>, tone: top.kind === 'sack' ? 'turnover' : 'info' });
    if (top.kind === 'td' || top.kind === 'final') {
      bursts.push({ side: 'left', top: 40, colors: scorer ? [scorer.color, ...CONFETTI] : CONFETTI });
      bursts.push({ side: 'right', top: 40, colors: scorer ? [scorer.color, ...CONFETTI] : CONFETTI });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  // Runs before the new-play effect re-renders, so the banner knows who scored.
  useEffect(() => {
    if (!view) return;
    const before = prevScore.current;
    if (before) {
      if (view.game.home.score > before.home) lastScorer.current = view.game.home;
      else if (view.game.away.score > before.away) lastScorer.current = view.game.away;
    }
    prevScore.current = { home: view.game.home.score, away: view.game.away.score };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.game.home.score, view?.game.away.score]);

  // Drive call resolved: who called it?
  const result = view?.lastQuestion?.result ? view.lastQuestion : undefined;
  const resultKey = result ? `${result.id}:${result.result!.optionId}` : null;
  useEffect(() => {
    if (!view) return;
    if (prevResult.current !== undefined && resultKey && resultKey !== prevResult.current && result && !personal) {
      const option = result.options.find((o) => o.id === result.result!.optionId);
      const count = result.pickCounts[result.result!.optionId] ?? 0;
      toasts.push({ text: <span><b>{option?.label ?? 'Result'}</b> · {count ? `${count} called it` : 'Nobody had it'}</span>, tone: count ? 'score' : 'info' });
    }
    prevResult.current = resultKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  // Personal: my last pick scored or missed.
  const meRow = view?.me ? view.standings.find((r) => r.participantId === view.me!.participantId) : undefined;
  const myPick = meRow?.lastPickScore ? `${resultKey}:${meRow.lastPickScore.correct}:${meRow.lastPickScore.points}` : null;
  useEffect(() => {
    if (!personal || !view) return;
    if (prevMyPick.current !== undefined && myPick && myPick !== prevMyPick.current && meRow?.lastPickScore) {
      const s = meRow.lastPickScore;
      if (s.correct) {
        toasts.push({ text: <span>Nice call! <b>+{s.points.toFixed(1)}</b>{s.bonuses.length ? <small> · {s.bonuses[0]}</small> : null}</span>, tone: 'score' });
        bursts.push({ side: 'left', top: 30, colors: CONFETTI });
        bursts.push({ side: 'right', top: 30, colors: CONFETTI });
      } else toasts.push({ text: 'Missed that one', tone: 'info' });
    }
    prevMyPick.current = myPick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPick]);

  // Standings climbs.
  useRankClimbs((view?.standings ?? []).map((r) => ({ id: r.participantId, rank: r.rank })), (climbs) => {
    if (!view) return;
    for (const climb of climbs.slice(0, 2)) {
      const row = view.standings.find((r) => r.participantId === climb.id);
      if (!row) continue;
      const mine = personal && climb.id === view.me?.participantId;
      if (personal && !mine) continue;
      const top = personal ? 22 : Math.min(85, 22 + (climb.to - 1) * 9);
      bursts.push({ side: 'right', top, colors: CONFETTI });
      if (climb.to === 1) {
        bursts.push({ side: 'left', top, colors: CONFETTI });
        toasts.push({ text: mine ? 'You take the lead' : <span><b>{row.name}</b> takes the lead</span>, tone: 'win' });
      } else toasts.push({ text: mine ? `You move up to ${ordinal(climb.to)}` : <span><b>{row.name}</b> moves up to {ordinal(climb.to)}</span>, tone: 'info' });
    }
  });

  return { banner: banners.current, toasts: toasts.items, bursts: bursts.items };
}
