import { useRef, type CSSProperties } from 'react';
import type { RoomStanding, RoomView } from '@shared/room';
import { ScoreTick } from '../fx/fx';
import { useFlip } from '../tv/flip';
import { ordinal, playLabel } from './moments';

export const statLine = (text: string) => text.replace(/\s*\(proxy\)/g, '');
export const points = (value: number) => Number(value || 0).toFixed(1);
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const FACE = ['#eda77b', '#b9b3e3', '#a9d3b4', '#e4c6a7', '#e8a0a0', '#9fc4e8', '#d9b3e3', '#c9d38f'];
export function faceColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FACE[h % FACE.length];
}
export function Face({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <span className="rm-face" style={{ width: size, height: size, fontSize: size * 0.4, background: faceColor(name) }} aria-hidden="true">{initials}</span>;
}

const PHASE: Record<string, string> = { lobby: 'Pregame', live: 'Live', paused: 'Paused', final: 'Final' };
export function PhasePill({ phase }: { phase: string }) {
  return <span className={`rm-phase is-${phase}`}>{phase === 'live' ? <i aria-hidden="true" /> : null}{PHASE[phase] ?? phase}</span>;
}

/** Broadcast scorebug: away left, home right, possession marker, clock and down in the middle. */
export function RoomScore({ view, large = false }: { view: RoomView; large?: boolean }) {
  const { game, room } = view;
  const team = (side: 'away' | 'home') => {
    const t = game[side];
    const ball = game.possession === t.id;
    return <div className={`rm-bug-team is-${side}${ball ? ' has-ball' : ''}`} style={{ '--team': t.color } as CSSProperties}>
      <span className="rm-bug-short">{t.short}</span>
      <span className="rm-bug-name">{t.name}{ball ? <span className="rm-bug-ball" aria-label="has the ball" /> : null}</span>
      <b><ScoreTick value={t.score} /></b>
    </div>;
  };
  return <section className={`rm-score rm-bug${large ? ' is-large' : ''}`} aria-label="Football score">
    {team('away')}
    <div className="rm-bug-mid">
      <PhasePill phase={room.phase} />
      <strong>{room.phase === 'final' ? 'Final' : room.phase === 'lobby' ? 'Kickoff soon' : <>Q{game.quarter} <span>{game.clock}</span></>}</strong>
      {room.phase === 'live' || room.phase === 'paused' ? <span className="rm-bug-down">{game.situation}</span> : null}
    </div>
    {team('home')}
  </section>;
}

/** Field strip: home end zone left, away right; ball, line of scrimmage and the line to gain. */
export function FootballField({ view }: { view: RoomView }) {
  const { game } = view;
  // fieldX runs from the home goal (0) to the away goal (100). Drawn mirrored so the
  // away end zone sits on the left, matching the scorebug.
  const x = 100 - Math.max(3, Math.min(97, game.fieldX));
  const togo = Number(/&\s*(\d+)/.exec(game.situation)?.[1]);
  const dir = game.possession === game.home.id ? -1 : game.possession === game.away.id ? 1 : 0;
  const gain = dir && Number.isFinite(togo) ? Math.max(0, Math.min(100, x + dir * togo)) : undefined;
  const offense = game.possession === game.home.id ? game.home : game.possession === game.away.id ? game.away : undefined;
  return <section className="rm-field-wrap" role="region" aria-label="Football field">
    <div className="rm-field">
      <span className="rm-endzone" style={{ background: game.away.color }}>{game.away.short}</span>
      <div className="rm-yardlines">
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((yard, i) => <span key={i}>{yard}</span>)}
        {dir ? <span className="rm-los" style={{ left: `${x}%` }} aria-hidden="true" /> : null}
        {gain !== undefined ? <span className="rm-gain" style={{ left: `${gain}%` }} aria-hidden="true" /> : null}
        <span className={`rm-ball${dir < 0 ? ' is-left' : ''}`} style={{ left: `${x}%` }} aria-label="Ball" />
      </div>
      <span className="rm-endzone" style={{ background: game.home.color }}>{game.home.short}</span>
    </div>
    <div className="rm-situation">
      <strong>{offense ? `${offense.name} ball` : view.room.phase === 'final' ? 'Game over' : 'Between drives'}</strong>
      <span>{game.driveNumber > 0 ? `Drive ${game.driveNumber} of ${game.driveCount}` : 'Kickoff'}</span>
    </div>
  </section>;
}

export function PlayFeed({ view, tv = false }: { view: RoomView; tv?: boolean }) {
  const plays = view.game.recentPlays.slice(-3).reverse();
  const [latest, ...rest] = plays;
  return <section className="rm-play-feed" role="region" aria-label="Recent football plays" tabIndex={tv ? 0 : undefined}>
    {latest ? <>
      <div className={`rm-play-latest is-${latest.kind}`} key={latest.id}>
        <span className="rm-play-tag">{playLabel(latest.kind) ?? 'Last play'}</span>
        <p>{latest.text}</p>
        <small>Q{latest.quarter} · {latest.clock}</small>
      </div>
      {rest.length ? <ol>{rest.map((play) => <li key={play.id}><span>Q{play.quarter} {play.clock}</span><p>{play.text}</p></li>)}</ol> : null}
    </> : <p className="rm-play-empty">{view.room.phase === 'lobby' ? 'Kickoff when the host is ready.' : 'Waiting on the next snap.'}</p>}
  </section>;
}

export function HostControls({ view, busy, onAction }: { view: RoomView; busy: boolean; onAction: (action: string, speed?: number) => void }) {
  const phase = view.room.phase;
  return <section className="rm-host" aria-label="Host controls"><span className="rm-eyebrow">Host</span><div className="rm-host-row">{phase === 'lobby' && <button className="rm-primary" disabled={busy} onClick={() => onAction('start')}>Start game</button>}{phase === 'live' && <button disabled={busy} onClick={() => onAction('pause')}>Pause game</button>}{phase === 'paused' && <button className="rm-primary" disabled={busy} onClick={() => onAction('resume')}>Resume game</button>}{phase === 'final' && <span>Game over · season saved</span>}<div className="rm-speeds" role="group" aria-label="Replay speed">{[1, 2, 3, 4].map((speed) => <button key={speed} aria-pressed={view.room.speed === speed} aria-label={`Replay ${speed} times speed`} disabled={busy || phase === 'final'} onClick={() => onAction('set_speed', speed)}>{speed}x</button>)}</div></div>{phase === 'lobby' && <p>Starting locks lineups. Empty seats get an auto lineup.</p>}</section>;
}

export function Question({ view, busy = false, onPick, tv = false }: { view: RoomView; busy?: boolean; tv?: boolean; onPick?: (questionId: string, optionId: string) => void }) {
  const question = view.question;
  const result = view.lastQuestion?.result ? view.lastQuestion : question?.result ? question : undefined;
  const total = question ? Object.values(question.pickCounts).reduce((a, b) => a + b, 0) : 0;
  const span = question ? Math.max(1, question.locksAt - question.opensAt) : 1;
  const left = question?.status === 'open' ? Math.max(0, Math.min(1, question.remainingMs / span)) : 0;
  const secs = question ? Math.max(0, Math.ceil(question.remainingMs / 1000)) : 0;
  return <section className={`rm-question${question?.status === 'open' ? ' is-open' : ''}${question?.status === 'open' && secs <= 5 ? ' is-urgent' : ''}`} aria-labelledby={tv ? undefined : 'rm-question-title'} role={tv ? 'region' : undefined} aria-label={tv ? 'Prediction details' : undefined} tabIndex={tv ? 0 : undefined}>
    <div className="rm-section-heading"><span className="rm-eyebrow">Call the drive</span>{question && <span className="rm-countdown">{question.status === 'open' ? `${secs}s` : question.status === 'locked' ? 'Locked' : 'Final'}</span>}</div>
    {question?.status === 'open' && <div className="rm-timer" aria-hidden="true"><i style={{ width: `${left * 100}%` }} /></div>}
    <h2 id="rm-question-title">{question?.text ?? (view.room.phase === 'lobby' ? 'First call opens at kickoff.' : view.room.phase === 'final' ? 'That’s the final whistle.' : 'Next call coming up.')}</h2>
    {question && <div className="rm-options">{question.options.map((option) => {
      const selected = view.me?.currentPick?.questionId === question.id && view.me.currentPick.optionId === option.id;
      const winner = question.result?.optionId === option.id;
      const count = question.pickCounts[option.id] ?? 0;
      const share = total ? count / total : 0;
      return <button key={option.id} className={`${winner ? 'is-winner' : ''}${question.result && !winner ? ' is-out' : ''}`} disabled={!onPick || busy || view.room.phase !== 'live' || question.status !== 'open' || question.remainingMs <= 0} aria-pressed={selected} onClick={() => onPick?.(question.id, option.id)}>
        <span className="rm-option-top"><span>{option.label}</span><b>{winner ? '✓' : `${option.basePoints} pts`}</b></span>
        <span className="rm-split" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
        <small>{count} {count === 1 ? 'pick' : 'picks'}{option.probability !== undefined ? ` · ${Math.round(option.probability * 100)}% of drives` : ''}{selected ? ' · Your call' : ''}</small>
      </button>;
    })}</div>}
    {result?.result && <div className="rm-result"><strong>Last call · {result.options.find((option) => option.id === result.result?.optionId)?.label ?? result.result.optionId}</strong><p>{result.result.explanation}</p></div>}
  </section>;
}

export function RoomRules({ view, tv = false }: { view: RoomView; tv?: boolean }) {
  const { rules } = view;
  return <details className="rm-rules" name={tv ? 'room-tv-tools' : undefined}><summary>How scoring works</summary><div role={tv ? 'region' : undefined} aria-label={tv ? 'Game rules' : undefined} tabIndex={tv ? 0 : undefined}>
    <h2>Lineups</h2>
    <ul><li>{money(rules.salaryCap)} to spend on 1 captain and {rules.flexSlots} flex players.</li><li>Your captain costs and scores {rules.captainMultiplier}×.</li><li>Anyone can pick the same player. Lineups lock at kickoff.</li></ul>
    <dl className="rm-rule-weights">{Object.entries(rules.positionMultipliers).map(([position, weight]) => <div key={position}><dt>{position}</dt><dd>{weight}×</dd></div>)}</dl>
    <h2>Drive calls</h2>
    <ul><li>One call per drive. Touchdown 10, field goal 12, punt 6, turnover 15, yes/no 10.</li><li>Bonuses for streaks, early calls, going against the room and long shots, up to {rules.pickFactorCap}×.</li><li>A miss resets your streak.</li></ul>
    <p className="rm-rules-note">Percentages come from NFL drives, 2015–2025 (nflverse). Teams and players are fictional.</p>
  </div></details>;
}

function BoardRow({ row, me, tv, leader }: { row: RoomStanding; me: boolean; tv: boolean; leader: boolean }) {
  return <li data-flip-key={row.participantId} className={`rm-row${me ? ' is-me' : ''}${leader ? ' is-leader' : ''}`}>
    <span className="rm-row-rank">{row.rank}</span>
    <Face name={row.name} size={tv ? 46 : 34} />
    <span className="rm-row-name"><b>{row.name}</b><small>{me && !tv ? 'You · ' : ''}{points(row.fantasyPoints)} lineup · {points(row.predictionPoints)} calls{row.streak > 1 ? <span className="rm-streak"> · 🔥 {row.streak}</span> : null}</small></span>
    <span className="rm-row-pts"><ScoreTick value={points(row.total)} /></span>
  </li>;
}

export function Leaderboard({ view, season = false, tv = false }: { view: RoomView; season?: boolean; tv?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, season ? [] : view.standings.map((r) => r.participantId));
  const rows = season ? view.season.standings : view.standings;
  return <section className={`rm-board${season ? ' is-season' : ''}`}>
    <div className="rm-section-heading"><h2>{season ? 'Season' : 'Standings'}</h2><span>{season ? view.season.name : `${view.room.participantCount} ${view.room.participantCount === 1 ? 'player' : 'players'}`}</span></div>
    <div className="rm-board-scroll" role="region" aria-label={season ? 'Season leaderboard' : 'Room leaderboard'} tabIndex={0}>
      <ol ref={list}>{season
        ? view.season.standings.map((row, i) => <li key={row.participantId} className="rm-row"><span className="rm-row-rank">{i + 1}</span><Face name={row.name} size={tv ? 46 : 34} /><span className="rm-row-name"><b>{row.name}</b><small>{row.nightsWon} {row.nightsWon === 1 ? 'win' : 'wins'} · {row.nightsPlayed} {row.nightsPlayed === 1 ? 'night' : 'nights'}</small></span><span className="rm-row-pts">{points(row.points)}</span></li>)
        : view.standings.map((row, i) => <BoardRow key={row.participantId} row={row} me={row.participantId === view.me?.participantId} tv={tv} leader={i === 0 && row.total > 0} />)}</ol>
      {rows.length === 0 && <p className="rm-empty">{season ? 'Season totals land after the final whistle.' : 'Join from your phone to get on the board.'}</p>}
    </div>
  </section>;
}

export function FinalPodium({ view }: { view: RoomView }) {
  const [first, second, third] = view.standings;
  const step = (row: RoomStanding | undefined, place: number) => row ? <div className={`rm-podium-step is-${place}`}>
    {place === 1 ? <span className="rm-crown" aria-hidden="true">👑</span> : null}
    <Face name={row.name} size={place === 1 ? 92 : 68} />
    <b>{row.name}</b><strong>{points(row.total)}</strong>
    <div className="rm-podium-block"><span>{ordinal(place)}</span></div>
  </div> : <div className={`rm-podium-step is-${place} is-empty`} />;
  return <section className="rm-podium" aria-label="Final standings">
    <div className="rm-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.45}s`, background: FACE[i % FACE.length] }} />)}</div>
    <span className="rm-eyebrow">Winner of the night</span>
    <div className="rm-podium-row">{step(second, 2)}{step(first, 1)}{step(third, 3)}</div>
  </section>;
}
