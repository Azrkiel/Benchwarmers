import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { RoomQuestion, RoomView } from '@shared/room';
import { renderSVG } from 'uqr';
import { BrandLockup } from '../brand/Brand';
import { ScoreTick } from '../fx/fx';
import { BasketballCourt } from './BasketballCourt';
import { Face, FootballField, points } from './components';
import { playLabel } from './moments';
import { ROOM_VIEWS, RoomNav, type RoomViewId } from './RoomNav';
import { CallsList } from './Calls';
import type { PointsSnapshotFields } from './points/types';
import { RoomResults } from './RoomResults';
import { leaders, paginate, RoomStandings, StandingRow } from './RoomStandings';
import { possessionTeamId, roomSport, sourceStatus, type RoomViewNext } from './sport';

export type DisplayLayout = 'compact' | 'medium' | 'tv';
/** How much each layout shows. Type scale lives in CSS; these are content amounts, not a shrunken canvas. */
export const LAYOUT = {
  compact: { leaders: 3, standingsPage: 6, lineupsPage: 4, court: false, plays: 1 },
  medium: { leaders: 5, standingsPage: 8, lineupsPage: 6, court: true, plays: 1 },
  tv: { leaders: 6, standingsPage: 10, lineupsPage: 8, court: true, plays: 3 },
} as const;

/** Picks the layout for a viewport when no explicit ?layout= override is given. */
export function layoutFor(width: number, height: number): DisplayLayout {
  if (width <= 1100 || height <= 600) return 'compact';
  if (width < 1600 || height < 1000) return 'medium';
  return 'tv';
}

/**
 * Public render model for shared screens. The display never shows `me`, credentials or
 * anything outside the public snapshot, even if a caller hands it a private view.
 */
export function toDisplayModel(view: RoomViewNext): RoomViewNext {
  const { me: _me, ...rest } = view as RoomViewNext & { me?: unknown };
  const game = { ...rest.game } as RoomViewNext['game'] & Record<string, unknown>;
  for (const key of Object.keys(game)) if (/token|secret|answer|future/i.test(key)) delete game[key];
  return { ...rest, game } as RoomViewNext;
}

function useCountdown(question: RoomQuestion | undefined, paused: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const received = useRef({ key: '', at: Date.now() });
  const key = question ? `${question.id}:${question.remainingMs}` : '';
  if (received.current.key !== key) received.current = { key, at: Date.now() };
  useEffect(() => {
    if (!question || question.status !== 'open' || paused) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [question?.id, question?.status, paused]);
  if (!question || question.status !== 'open') return 0;
  return Math.max(0, question.remainingMs - (paused ? 0 : now - received.current.at));
}

function ScoreStrip({ view }: { view: RoomViewNext }) {
  const { game, room } = view;
  const teamId = possessionTeamId(view);
  const holder = teamId === game.home.id ? game.home : teamId === game.away.id ? game.away : undefined;
  const team = (side: 'away' | 'home') => {
    const t = game[side];
    return <div className={`rd-team is-${side}${holder?.id === t.id ? ' has-ball' : ''}`} style={{ '--team': t.color } as CSSProperties}>
      <span className="rd-team-name"><span className="rd-team-short">{t.short}</span><span className="rd-team-full">{t.name}</span></span>
      <b className="rd-team-score"><ScoreTick value={t.score} /></b>
    </div>;
  };
  const clock = room.phase === 'final' ? 'Final' : room.phase === 'lobby' ? (roomSport(view) === 'basketball' ? 'Tip-off soon' : 'Kickoff soon') : `Q${game.quarter} ${game.clock}`;
  return <section className="rd-score" aria-label="Score">
    {team('away')}
    <div className="rd-clock"><strong>{clock}</strong>{room.phase === 'paused' && <span className="rd-paused">Paused</span>}</div>
    {team('home')}
    <p className="rd-ball">{room.phase === 'live' || room.phase === 'paused' ? <>Ball: <b>{holder ? holder.short : 'Unknown'}</b></> : room.phase === 'final' ? 'Game over' : 'Pregame'}</p>
  </section>;
}

function FeaturedCall({ view, remaining }: { view: RoomViewNext; remaining: number }) {
  const question = view.question;
  const last = !question && view.lastQuestion?.result ? view.lastQuestion : undefined;
  const shown = question ?? last;
  const paused = view.room.phase === 'paused';
  if (!shown) return <section className="rd-call is-empty" aria-label="Featured call"><span className="rd-eyebrow">Featured call</span><h2>Next call coming up</h2><p className="rd-muted">Answer on your phone or by voice.</p></section>;
  const total = Object.values(shown.pickCounts).reduce((a, b) => a + b, 0);
  const status = shown.status as string;
  const secs = Math.ceil(remaining / 1000);
  const statusText = paused ? 'Paused · Calls on hold'
    : status === 'open' ? `Closes in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    : status === 'locked' ? 'Locked · Waiting for the play'
    : status === 'void' ? `No result${(shown as { voidReason?: string }).voidReason ? ` · ${(shown as { voidReason?: string }).voidReason}` : ''} · streaks kept`
    : 'Result';
  return <section className={`rd-call is-${status}${status === 'open' && secs <= 3 && !paused ? ' is-urgent' : ''}`} aria-label="Featured call">
    <span className="rd-eyebrow">Featured call</span>
    <h2>{shown.text}</h2>
    <div className={`rd-options${shown.options.length > 2 ? ' has-many' : ''}`}>{shown.options.map((option) => {
      const count = shown.pickCounts[option.id] ?? 0;
      const winner = shown.result?.optionId === option.id;
      return <div key={option.id} className={`rd-option${winner ? ' is-winner' : ''}${shown.result && !winner ? ' is-out' : ''}`}>
        <b>{option.label}</b>{winner && <span className="rd-check" aria-label="Correct">✓</span>}
        <small>{count} {count === 1 ? 'pick' : 'picks'}</small>
        <i className="rd-share" style={{ width: `${total ? (count / total) * 100 : 0}%` }} aria-hidden="true" />
      </div>;
    })}</div>
    <p className="rd-call-status" role="status"><span>{statusText}</span><span>{total} of {view.room.participantCount} answered</span></p>
    {status === 'open' && !paused && <div className="rd-timer" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, remaining / Math.max(1, shown.locksAt - shown.opensAt))) * 100}%` }} /></div>}
  </section>;
}

function JoinQr({ url }: { url: string }) {
  const svg = useMemo(() => renderSVG(url, { border: 2, ecc: 'M', pixelSize: 1, whiteColor: '#ffffff', blackColor: '#0b0b0d' }), [url]);
  return <span className="rd-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Lobby({ view, joinUrl }: { view: RoomViewNext; joinUrl: string }) {
  const ready = view.standings.filter((row) => row.roster.length === view.rules.flexSlots + 1).length;
  const pregame = view.pregame;
  return <section className="rd-call rd-lobby" aria-label="Join">
    <span className="rd-eyebrow">Pregame</span>
    <h2>Join on your phone</h2>
    <div className="rd-lobby-join"><JoinQr url={joinUrl} /><div><b className="rd-code">{view.room.code}</b><small>{joinUrl.replace(/^https?:\/\//, '')}</small></div></div>
    <p className="rd-call-status"><span>{ready} of {view.room.participantCount} lineups ready</span>{pregame && <span>Winner picks: {[view.game.away, view.game.home].map((t) => `${t.short} ${pregame.pickCounts[t.id] ?? 0}`).join(' · ')}</span>}</p>
  </section>;
}

function Lineups({ view, perPage }: { view: RoomViewNext; perPage: number }) {
  const [page, setPage] = useState(0);
  const pages = paginate(view.standings, perPage);
  const current = Math.min(page, pages.length - 1);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  return <section className="rd-lineups" aria-label="Lineups">
    {view.standings.length ? <ul>{pages[current]!.map((row) => {
      const captain = row.roster.find((slot) => slot.captain);
      return <li key={row.participantId}><header><Face name={row.name} size={28} /><b title={row.name}>{row.name}</b><span>{points(row.fantasyPoints)}</span></header>
        {row.roster.length ? <p><span className="rd-cap">C</span>{captain ? name(captain.playerId) : '—'}<br /><small>{row.roster.filter((slot) => !slot.captain).map((slot) => name(slot.playerId).split(' ').at(-1)).join(' · ')}</small></p> : <p className="rd-muted">Choosing lineup</p>}
      </li>;
    })}</ul> : <p className="rd-empty">No lineups yet.</p>}
    {pages.length > 1 && <nav className="rd-pager" aria-label="Lineup pages"><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current + 1} of {pages.length}</span><button disabled={current === pages.length - 1} onClick={() => setPage(current + 1)}>Next</button></nav>}
  </section>;
}

export function RoomDisplay({ view: input, layout, current, onView, joinUrl, stale = false, host = false, fixture = false, voice, overlay, highlightId, caption }: {
  view: RoomViewNext; layout: DisplayLayout; current: RoomViewId; onView: (view: RoomViewId) => void; joinUrl: string;
  stale?: boolean; host?: boolean; fixture?: boolean; voice?: ReactNode; overlay?: ReactNode; highlightId?: string; caption?: string;
}) {
  const view = toDisplayModel(input);
  const config = LAYOUT[layout];
  const phase = view.room.phase;
  const final = phase === 'final';
  const remaining = useCountdown(view.question, phase === 'paused');
  const basketball = roomSport(view) === 'basketball';
  const sourceStale = stale || sourceStatus(view) === 'stale' || sourceStatus(view) === 'unavailable';
  const latest = view.game.recentPlays.slice(-config.plays).reverse();
  const top = leaders(view.standings, config.leaders, highlightId);
  const calls = (view as RoomViewNext & PointsSnapshotFields).calls;
  const views: RoomViewId[] = calls?.length ? [...ROOM_VIEWS, 'calls'] : [...ROOM_VIEWS];
  const court = basketball ? <BasketballCourt view={view} compact={layout === 'compact'} /> : <FootballField view={view as RoomView} />;
  return <main className={`rd is-${layout} is-${phase}${sourceStale ? ' is-stale' : ''}`}>
    <header className="rd-top">
      <BrandLockup size={layout === 'tv' ? 36 : 26} />
      <RoomNav current={current} onChange={onView} final={final} controls="rd-view" views={views} />
      <span className="rd-code-chip">{fixture && <b className="rd-fixture" title="Fixture data, not a connected room">Fixture</b>}Code <b>{view.room.code}</b></span>
    </header>
    <ScoreStrip view={view} />
    {sourceStale && <p className="rd-stale" role="status">Showing last update · Reconnecting</p>}
    <div id="rd-view" className={`rd-view is-${current}`} role="tabpanel" aria-labelledby={`rd-tab-${current}`}>
      {current === 'game' && (final ? <RoomResults view={view as RoomView} host={host} seasonRows={config.standingsPage} /> : <div className="rd-game">
        {phase === 'lobby' ? <Lobby view={view} joinUrl={joinUrl} /> : <FeaturedCall view={view} remaining={remaining} />}
        <aside className="rd-leaders" aria-label="Room leaders">
          <h2>Room leaders</h2>
          {top.length ? <ol className="rd-rows">{top.map((row) => <StandingRow key={row.participantId} row={row} highlight={row.participantId === highlightId} />)}</ol> : <p className="rd-empty">No players yet</p>}
          {view.standings.length > top.length && <button className="rd-link" onClick={() => onView('standings')}>All standings ({view.standings.length})</button>}
        </aside>
        {config.court && <div className="rd-court-slot">{court}</div>}
      </div>)}
      {current === 'standings' && <RoomStandings rows={view.standings} perPage={config.standingsPage} highlightId={highlightId} title={final ? 'Tonight' : 'Standings'} />}
      {current === 'lineups' && <Lineups view={view} perPage={config.lineupsPage} />}
      {current === 'calls' && <CallsList calls={calls ?? []} standings={view.standings} />}
      {current === 'results' && (final ? <RoomResults view={view as RoomView} host={host} seasonRows={config.standingsPage} /> : <p className="rd-empty">Results open at the final buzzer.</p>)}
    </div>
    <footer className="rd-foot">
      {!config.court && basketball && phase !== 'lobby' && <span className="rd-foot-ball">{court}</span>}
      <div className="rd-foot-play" aria-label="Latest play">{caption ? <p className="rd-caption" aria-live="polite">{caption}</p> : latest.length ? latest.map((play) => <p key={play.id}><span className="rd-tag">{playLabel(play.kind) ?? (play.kind === 'score' ? 'Score' : 'Play')}</span>{play.text}</p>) : <p className="rd-muted">{phase === 'lobby' ? 'Waiting for the host to start' : final ? 'Game over' : 'Waiting for the next play'}</p>}</div>
      <div className="rd-foot-voice">{voice}<span className="rd-muted rd-source-label">{basketball ? 'Fictional basketball replay' : 'Fictional football replay'}</span></div>
    </footer>
    {overlay}
  </main>;
}
