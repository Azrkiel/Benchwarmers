import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { EventView, PartyStateResponse, TeamScore } from '@shared/types';
import { BurstLayer, CONFETTI, PlayBanner, ToastLayer, useBanners, useBursts, useNewIds, useToasts, type Banner, type Burst, type Toast } from '../fx/fx';
import { formatPoints } from './pops';

// Broadcast "moments" for the TV: play banners, side bursts and lower-third toasts.
// MomentsHost owns the layers; children fire through useMoments(). Nothing fires on the first render.

export type Moments = {
  banner: (b: Banner) => void;
  burst: (b: Burst) => void;
  toast: (t: Toast) => void;
};

const noop: Moments = { banner: () => undefined, burst: () => undefined, toast: () => undefined };
const MomentsContext = createContext<Moments>(noop);
export const useMoments = () => useContext(MomentsContext);

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "Maya", "Maya and Leo", "Maya, Leo and Sam". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------- Play banners ----------

type Call = Banner & { priority: number };

function callFor(e: EventView, game: { home: TeamScore; away: TeamScore }, nameOf: (playerId?: string) => string | undefined): Call | undefined {
  const team = e.team === 'home' ? game.home : e.team === 'away' ? game.away : undefined;
  const has = (tag: string) => e.tags.includes(tag);
  const teamColor = team?.color;
  if (e.type === 'score') {
    if (has('touchdown') || e.stat === 'rec_td' || e.stat === 'rush_td') {
      return { title: 'TOUCHDOWN', sub: team?.name, tone: 'score', color: teamColor, priority: 100 };
    }
    if (e.stat === 'fg' || has('field-goal')) {
      return { title: 'FIELD GOAL', sub: team?.name, tone: 'score', color: teamColor, priority: 55 };
    }
    if (e.points === 3 && (has('three') || e.stat === 'pts3')) {
      return { title: 'THREE!', sub: nameOf(e.playerId), tone: 'score', color: teamColor, priority: 70 };
    }
    if (has('dunk')) {
      return { title: 'DUNK!', sub: nameOf(e.playerId), tone: 'big', color: teamColor, priority: 60 };
    }
  }
  if (e.type === 'play' || e.type === 'drive') {
    if (e.stat === 'int' || has('interception')) {
      return { title: 'INTERCEPTED', sub: team?.name, tone: 'turnover', priority: 90 };
    }
    if (e.stat === 'fumble' || has('fumble')) {
      return { title: 'FUMBLE', sub: team?.name, tone: 'turnover', priority: 90 };
    }
    if (has('turnover') || e.driveResult === 'turnover') {
      return { title: 'TURNOVER', sub: team?.name, tone: 'turnover', priority: 75 };
    }
  }
  if (has('big') || has('explosive')) {
    return { title: 'BIG PLAY', sub: team?.name, tone: 'big', color: teamColor, priority: 65 };
  }
  if (e.type === 'period') {
    if (/halftime/i.test(e.text)) return { title: 'HALFTIME', tone: 'info', priority: 35 };
    const quarter = /end of (q\d)/i.exec(e.text);
    if (quarter) return { title: `END OF ${quarter[1]!.toUpperCase()}`, tone: 'info', priority: 30 };
    if (/\bfinal\b/i.test(e.text)) return { title: 'FINAL', tone: 'win', priority: 40 };
  }
  return undefined;
}

/** The single most important banner for a batch of new events, or undefined. Events may come in any order. */
export function pickPlayBanner(
  events: EventView[],
  game: { home: TeamScore; away: TeamScore },
  nameOf: (playerId?: string) => string | undefined = () => undefined,
): Banner | undefined {
  let best: Call | undefined;
  for (const e of events) {
    const call = callFor(e, game, nameOf);
    if (call && (!best || call.priority > best.priority)) best = call;
  }
  if (!best) return undefined;
  const { priority: _priority, ...banner } = best;
  void _priority;
  return banner;
}

// ---------- Pick results ----------

export type ResolvedPick = { memberName: string; correct?: boolean; score?: { correct: boolean; points: number } };

/** "Maya and Leo called it · +12", or a neutral line when nobody got it. */
export function resultToast(picks: ResolvedPick[]): Toast {
  const winners = picks.filter((p) => p.correct === true || p.score?.correct === true);
  if (winners.length === 0) return { text: 'Nobody saw that coming', tone: 'info' };
  const best = Math.max(0, ...winners.map((p) => p.score?.points ?? 0));
  const names = joinNames(winners.map((p) => p.memberName));
  const pts = best > 0 ? ` · +${formatPoints(best)}` : '';
  return { text: `${names} called it${pts}`, tone: 'score' };
}

// ---------- Host ----------

export function MomentsHost({ demo = false, children }: { demo?: boolean; children: ReactNode }) {
  const banners = useBanners();
  const bursts = useBursts();
  const toasts = useToasts();
  const moments = useMemo<Moments>(() => ({
    banner: banners.announce,
    burst: bursts.push,
    toast: toasts.push,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [banners.announce, bursts.push, toasts.push]);

  // ?fxdemo=1: fire a sample moment one second after load so the effects can be checked by eye.
  useEffect(() => {
    if (!demo) return;
    const timer = setTimeout(() => {
      moments.banner({ title: 'THREE!', sub: 'Demo play', tone: 'score', color: '#eda77b' });
      moments.burst({ side: 'left', top: 40, colors: CONFETTI });
      moments.burst({ side: 'right', top: 40, colors: CONFETTI });
      moments.toast({ text: 'Maya moves up to 1st', tone: 'win', color: '#8fb9d9' });
    }, 1000);
    return () => clearTimeout(timer);
  }, [demo, moments]);

  return (
    <MomentsContext.Provider value={moments}>
      {children}
      <PlayBanner banner={banners.current} />
      <BurstLayer bursts={bursts.items} />
      <ToastLayer toasts={toasts.items} placement="top" />
    </MomentsContext.Provider>
  );
}

// ---------- Triggers ----------

/** Announces the most important new play. Mount inside MomentsHost. */
export function PlayMoments({ state }: { state: PartyStateResponse }) {
  const moments = useMoments();
  const fresh = useNewIds(state.recentEvents.map((e) => e.id));
  useEffect(() => {
    if (fresh.length === 0) return;
    const byId = new Map(state.recentEvents.map((e) => [e.id, e] as const));
    const events = fresh.map((id) => byId.get(id)).filter((e): e is EventView => e !== undefined);
    const nameOf = (playerId?: string) => {
      if (!playerId) return undefined;
      const entry = state.draftBoard.find((d) => d.player.id === playerId);
      return entry?.player.nickname ?? entry?.player.name;
    };
    const banner = pickPlayBanner(events, state.game, nameOf);
    if (banner) moments.banner(banner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);
  return null;
}

/** Toasts who called a newly resolved prop right. Mount inside MomentsHost. */
export function PropMoments({ state }: { state: PartyStateResponse }) {
  const moments = useMoments();
  const resolved = state.props.filter((p) => p.status === 'resolved').map((p) => p.id);
  const fresh = useNewIds(resolved);
  useEffect(() => {
    for (const propId of fresh) {
      const picks = state.picks.filter((p) => p.propId === propId);
      moments.toast(resultToast(picks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);
  return null;
}

// ---------- Standings helpers ----------

/** Vertical centre of a row as a percent of the 1920x1080 stage (bursts are stage-relative). */
export function rowTopPercent(el: HTMLElement | null): number {
  const stage = el?.closest<HTMLElement>('.tv-stage');
  if (!el || !stage) return 50;
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (s.height === 0) return 50;
  return Math.min(96, Math.max(4, ((r.top + r.height / 2 - s.top) / s.height) * 100));
}
