import { useRef, useState, type CSSProperties } from 'react';
import type { RoomStanding, RoomView } from '@shared/room';
import { ScoreTick } from '../fx/fx';
import { useFlip } from '../tv/flip';
import { ordinal, playLabel } from './moments';

/** Black or white text, whichever reads better on a team colour. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#0b0b0d' : '#fff';
}


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

const PHASE: Record<string, string> = { lobby: 'Pregame', live: 'Playing', paused: 'Paused', final: 'Final' };
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
      <span className="rm-bug-short" aria-label={`${t.name}${ball ? ', possession' : ''}`}>{t.short}{ball && <span className="rm-bug-ball" aria-hidden="true" />}</span>
      <span className="rm-bug-name">{t.name}{ball ? <span className="rm-bug-ball" aria-label="has the ball" /> : null}</span>
      <b><ScoreTick value={t.score} /></b>
    </div>;
  };
  return <section className={`rm-score rm-bug${large ? ' is-large' : ''}`} aria-label="Football score">
    {team('away')}
    <div className="rm-bug-mid">
      <div className="rm-source-phase"><span className="rm-source">{game.isScripted ? 'Replay' : 'Live'}</span><PhasePill phase={room.phase} /></div>
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
      <span className="rm-endzone" style={{ background: game.away.color, color: inkOn(game.away.color) }}>{game.away.short}</span>
      <div className="rm-yardlines">
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((yard, i) => <span key={i}>{yard}</span>)}
        {dir ? <span className="rm-los" style={{ left: `${x}%` }} aria-hidden="true" /> : null}
        {gain !== undefined ? <span className="rm-gain" style={{ left: `${gain}%` }} aria-hidden="true" /> : null}
        <span className={`rm-ball${dir < 0 ? ' is-left' : ''}`} style={{ left: `${x}%` }} aria-label="Ball" />
      </div>
      <span className="rm-endzone" style={{ background: game.home.color, color: inkOn(game.home.color) }}>{game.home.short}</span>
    </div>
    <div className="rm-situation">
      <strong>{offense ? `${offense.name} ball` : view.room.phase === 'final' ? 'Game over' : 'Between drives'}</strong>
      <span>{game.driveNumber > 0 ? `Drive ${game.driveNumber} of ${game.driveCount}` : 'Kickoff'}</span>
    </div>
  </section>;
}

export function PlayFeed({ view, tv = false }: { view: RoomView; tv?: boolean }) {
  const plays = view.game.recentPlays.slice(tv ? -1 : -3).reverse();
  const [latest, ...rest] = plays;
  return <section className="rm-play-feed" role="region" aria-label={tv ? 'Latest football play' : 'Recent football plays'} tabIndex={tv ? 0 : undefined}>
    {latest ? <>
      <div className={`rm-play-latest is-${latest.kind}`} key={latest.id}>
        <span className="rm-play-tag">{playLabel(latest.kind) ?? 'Last play'}</span>
        <p>{latest.text}</p>
        <small>Q{latest.quarter} · {latest.clock}</small>
      </div>
      {rest.length ? <ol>{rest.map((play) => <li key={play.id}><span>Q{play.quarter} {play.clock}</span><p>{play.text}</p></li>)}</ol> : null}
    </> : <p className="rm-play-empty">{view.room.phase === 'lobby' ? 'Waiting for host' : 'Waiting for next play'}</p>}
  </section>;
}

export function HostControls({ view, busy, onAction }: { view: RoomView; busy: boolean; onAction: (action: string, speed?: number) => void }) {
  const phase = view.room.phase;
  const incomplete = view.standings.filter((row) => row.roster.length !== view.rules.flexSlots + 1).length;
  return <section className="rm-host" aria-label="Host controls"><h2>Host controls</h2><div className="rm-host-row">{phase === 'lobby' && <button className="rm-primary" disabled={busy} onClick={() => onAction('start')}>Start game</button>}{phase === 'live' && <button disabled={busy} onClick={() => onAction('pause')}>Pause game</button>}{phase === 'paused' && <button className="rm-primary" disabled={busy} onClick={() => onAction('resume')}>Resume game</button>}{phase === 'final' && <span>Final · Season saved</span>}<div><span className="rm-muted">Replay speed</span><div className="rm-speeds" role="group" aria-label="Replay speed">{[1, 2, 3, 4].map((speed) => <button key={speed} aria-pressed={view.room.speed === speed} aria-label={`Replay ${speed} times speed`} disabled={busy || phase === 'final'} onClick={() => onAction('set_speed', speed)}>{speed}×</button>)}</div></div></div>{phase === 'lobby' && <p>{incomplete} {incomplete === 1 ? 'player needs a lineup' : 'players need lineups'}. Starting locks saved lineups and auto-fills missing lineups.</p>}</section>;
}

export function Question({ view, busy = false, onPick, tv = false }: { view: RoomView; busy?: boolean; tv?: boolean; onPick?: (questionId: string, optionId: string) => Promise<boolean | undefined> | void }) {
  const question = view.question;
  const [attempt, setAttempt] = useState<{ questionId: string; optionId: string; status: 'saving' | 'failed' | 'saved' }>();
  const result = view.lastQuestion?.result ? view.lastQuestion : question?.result ? question : undefined;
  const total = question ? Object.values(question.pickCounts).reduce((a, b) => a + b, 0) : 0;
  const span = question ? Math.max(1, question.locksAt - question.opensAt) : 1;
  const paused = view.room.phase === 'paused';
  const left = question?.status === 'open' ? Math.max(0, Math.min(1, question.remainingMs / span)) : 0;
  const secs = question ? Math.max(0, Math.ceil(question.remainingMs / 1000)) : 0;
  const editable = view.room.phase === 'live' && question?.status === 'open' && question.remainingMs > 0;
  const currentAttempt = attempt?.questionId === question?.id ? attempt : undefined;
  async function pick(questionId: string, optionId: string) {
    setAttempt({ questionId, optionId, status: 'saving' });
    try {
      const saved = await onPick?.(questionId, optionId);
      setAttempt({ questionId, optionId, status: saved === false ? 'failed' : 'saved' });
    } catch { setAttempt({ questionId, optionId, status: 'failed' }); }
  }
  return <section className={`rm-question${editable ? ' is-open' : ''}${editable && secs <= 5 ? ' is-urgent' : ''}`} aria-labelledby={tv ? undefined : 'rm-question-title'} role={tv ? 'region' : undefined} aria-label={tv ? 'Prediction details' : undefined} tabIndex={tv ? 0 : undefined}>
    <div className="rm-section-heading"><span className="rm-eyebrow">{tv ? 'Make picks on your phone' : 'Make a pick'}</span>{question && <span className="rm-countdown">{paused ? 'Picks paused' : question.status === 'open' ? `Closes in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : question.status === 'locked' ? 'Locked · Awaiting result' : 'Resolved'}</span>}</div>
    {!tv && <span className="rm-sr" role="status" aria-label="Pick window status">{paused ? 'Picks paused' : question?.status === 'locked' ? 'Picks locked. Awaiting result.' : editable && secs <= 5 ? 'Picks close in under five seconds' : ''}</span>}
    {paused && <p className="rm-pick-state" role="status">Game paused · Picks paused</p>}
    {question?.status === 'open' && <div className="rm-timer" aria-hidden="true"><i style={{ width: `${left * 100}%` }} /></div>}
    <h2 id="rm-question-title">{question?.text ?? (view.room.phase === 'lobby' ? 'Picks open at kickoff' : view.room.phase === 'final' ? 'Game complete' : 'Waiting for the next pick')}</h2>
    {question && <div className="rm-options">{question.options.map((option) => {
      const confirmed = view.me?.currentPick?.questionId === question.id && view.me.currentPick.optionId === option.id;
      const selected = currentAttempt ? currentAttempt.optionId === option.id : confirmed;
      const winner = question.result?.optionId === option.id;
      const count = question.pickCounts[option.id] ?? 0;
      const share = total ? count / total : 0;
      const content = <><span className="rm-option-top"><span className="rm-clamp" title={option.label}>{option.label}</span><b>{winner ? '✓ Correct' : `${option.basePoints} pts`}</b></span><span className="rm-split" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span><small>Room: {count} {count === 1 ? 'pick' : 'picks'} ({Math.round(share * 100)}%){option.probability !== undefined && <span className="rm-history-rate">Historical rate: {Math.round(option.probability * 100)}%</span>}</small>{selected && <strong className="rm-your-pick">{currentAttempt?.status === 'saving' ? 'Saving…' : currentAttempt?.status === 'failed' ? 'Your choice · Not saved' : '✓ Your pick'}</strong>}</>;
      const className = `${winner ? 'is-winner' : ''}${question.result && !winner ? ' is-out' : ''}${selected ? ' is-selected' : ''}`;
      return tv ? <div key={option.id} className={`rm-option-info ${className}`}>{content}</div> : <button key={option.id} className={className} disabled={!onPick || busy || currentAttempt?.status === 'saving' || !editable} aria-pressed={selected} onClick={() => { void pick(question.id, option.id); }}>{content}</button>;
    })}</div>}
    {!tv && <span className="rm-sr-only" role="status">{currentAttempt?.status === 'saved' ? `Pick saved: ${question?.options.find(o => o.id === currentAttempt.optionId)?.label ?? ''}` : ''}</span>}
    {currentAttempt?.status === 'failed' && <div className="rm-pick-failure"><p role="alert">Pick not saved. Try again.</p>{editable && <button disabled={busy} onClick={() => { void pick(currentAttempt.questionId, currentAttempt.optionId); }}>Retry pick</button>}</div>}
    {result?.result && <details className="rm-result"><summary>Previous pick · {result.options.find((option) => option.id === result.result?.optionId)?.label ?? result.result.optionId}</summary><p>{result.text}</p><p>{result.result.explanation}</p></details>}
  </section>;
}

export function RoomRules({ view, tv = false }: { view: RoomView; tv?: boolean }) {
  const { rules } = view;
  return <details className="rm-rules" name={tv ? 'room-tv-tools' : undefined}><summary>How scoring works</summary><div role={tv ? 'region' : undefined} aria-label={tv ? 'Game rules' : undefined} tabIndex={tv ? 0 : undefined}>
    <p>Lineup points + pick points = your total. Lineups lock at kickoff.</p>
    <details><summary>Lineups</summary><ul><li>{money(rules.salaryCap)} for 1 captain and {rules.flexSlots} flex players.</li><li>Captain salary and points are multiplied by {rules.captainMultiplier}.</li><li>Players can appear in more than one lineup.</li></ul><dl className="rm-rule-weights">{Object.entries(rules.positionMultipliers).map(([position, weight]) => <div key={position}><dt>{position}</dt><dd>{weight}×</dd></div>)}</dl></details>
    <details><summary>Picks</summary><p>One pick per drive. Touchdown 10 pts, field goal 12 pts, punt 6 pts, turnover 15 pts, yes/no 10 pts.</p></details>
    <details><summary>Bonuses</summary><p>Correct picks can earn streak, early pick, minority and long-shot bonuses, up to {rules.pickFactorCap}×. A miss resets your streak.</p></details>
    <details><summary>Data details</summary><p>Historical rates: NFL drives, 2015–2025 (nflverse). Teams and players are fictional. This game is a scripted replay.</p></details>
    <p className="rm-rules-note">Fictional teams and players · Scripted replay</p>
  </div></details>;
}

function BoardRow({ row, me, tv, leader }: { row: RoomStanding; me: boolean; tv: boolean; leader: boolean }) {
  return <li data-flip-key={row.participantId} className={`rm-row${me ? ' is-me' : ''}${leader ? ' is-leader' : ''}`}>
    <span className="rm-row-rank">{row.rank}</span><Face name={row.name} size={tv ? 46 : 34} />
    <span className="rm-row-name"><b className="rm-clamp" title={row.name}>{row.name}{me && <span className="rm-you"> · You</span>}</b>{!tv && <small>{points(row.fantasyPoints)} lineup pts · {points(row.predictionPoints)} pick pts{row.streak > 1 ? ` · Streak ${row.streak}` : ''}</small>}</span>
    <span className="rm-row-pts"><ScoreTick value={points(row.total)} /><small> pts</small></span>
  </li>;
}

export function Leaderboard({ view, season = false, tv = false }: { view: RoomView; season?: boolean; tv?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, season ? [] : view.standings.map((r) => r.participantId));
  const rows = season ? view.season.standings : view.standings;
  return <section className={`rm-board${season ? ' is-season' : ''}`}>
    <div className="rm-section-heading"><h2>{season ? 'Season' : view.room.phase === 'final' ? 'Tonight' : 'Standings'}</h2><span>{season ? view.season.name : `${view.room.participantCount} ${view.room.participantCount === 1 ? 'player' : 'players'}`}</span></div>
    <div className="rm-board-scroll" role="region" aria-label={season ? 'Season leaderboard' : 'Room leaderboard'} tabIndex={0}>
      <ol ref={list}>{season
        ? view.season.standings.map((row) => <li key={row.participantId} className={`rm-row${row.participantId === view.me?.participantId ? ' is-me' : ''}`}><span className="rm-row-rank">{1 + view.season.standings.filter((other) => other.points > row.points).length}</span><Face name={row.name} size={tv ? 46 : 34} /><span className="rm-row-name"><b className="rm-clamp" title={row.name}>{row.name}</b><small>{row.nightsWon} {row.nightsWon === 1 ? 'win' : 'wins'} · {row.nightsPlayed} {row.nightsPlayed === 1 ? 'game' : 'games'}</small></span><span className="rm-row-pts">{points(row.points)}<small> pts</small></span></li>)
        : view.standings.map((row) => <BoardRow key={row.participantId} row={row} me={row.participantId === view.me?.participantId} tv={tv} leader={row.rank === 1 && row.total > 0} />)}</ol>
      {rows.length === 0 && <p className="rm-empty">{season ? 'Season totals appear after the game.' : 'No players yet. Join on your phone.'}</p>}
    </div>
  </section>;
}

export function FinalPodium({ view }: { view: RoomView }) {
  const winners = view.standings.filter((row) => row.rank === 1);
  return <section className="rm-podium" aria-label="Final standings">
    <span className="rm-eyebrow">Tonight · Final</span><h2>{winners.length > 1 ? 'Tied winners' : winners.length === 1 ? 'Winner' : 'No results yet'}</h2>
    <div className="rm-winners">{winners.map((row) => <div className="rm-winner" key={row.participantId}><Face name={row.name} size={64} /><b>{row.name}</b><strong>{points(row.total)} <small>pts</small></strong></div>)}</div>
    {view.me && <p>Your finish: {ordinal(view.standings.find((row) => row.participantId === view.me?.participantId)?.rank ?? 0)}</p>}
  </section>;
}
