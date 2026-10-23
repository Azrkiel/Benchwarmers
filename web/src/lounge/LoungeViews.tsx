import type { PartyStateResponse, PropView } from '@shared/types';
import { formatCountdown, lockDeadline, secondsLeft } from '../lib/usePartyState';
import { playerInfo } from '../tv-broadcast/rosters';
import { BasketballArt, FootballArt, LoungeIcon, MemberFace, Seats, type LoungeView } from './LoungeElements';

export function currentQuestion(state: PartyStateResponse) {
  return state.activeProp ?? state.props.find((p) => p.status === 'locked') ?? state.lastResolvedProp;
}

export function questionStatus(state: PartyStateResponse, now: number) {
  const prop = currentQuestion(state);
  if (!prop) return 'No open pick';
  if (prop.status === 'resolved') return 'Result';
  const deadline = lockDeadline(state);
  const left = secondsLeft(deadline, now);
  if (prop.status === 'locked' || (deadline !== undefined && left === 0)) return 'Picks locked · result pending';
  return deadline !== undefined ? `Closes in ${formatCountdown(left)}` : 'Open for picks';
}

export function Tonight({ state, now, onNavigate, onMember }: { state: PartyStateResponse; now: number; onNavigate: (view: LoungeView, origin: string) => void; onMember: (id: string) => void }) {
  const prop = currentQuestion(state);
  const draft = state.party.status === 'drafting';
  const final = state.party.status === 'final';
  const next = draft ? 'draft' : final ? 'final' : 'picks';
  const action = draft ? 'View draft' : final ? 'View results' : 'View picks';
  return <>
    <div className="lg-tonight-grid">
      <section className="lg-match">
        {state.game.sport === 'football' ? <FootballArt /> : <BasketballArt />}
        <div className="lg-match-content">
          <span className="lg-eyebrow">{final ? 'Final' : draft ? 'Pregame' : 'Playing'}</span>
          <h1 className={Math.max(state.game.home.name.length, state.game.away.name.length) > 22 ? 'is-long' : ''}><span>{state.game.home.name}</span><em>vs.</em><span>{state.game.away.name}</span></h1>
          <div className="lg-match-score" aria-label={`${state.game.home.name} ${state.game.home.score}, ${state.game.away.name} ${state.game.away.score}`}><b>{state.game.home.score}</b><span>—</span><b>{state.game.away.score}</b><small>{state.game.clock}</small></div>
        </div>
        <div className="lg-latest"><span>Latest</span><span>{state.recentEvents[0]?.text ?? 'No plays yet.'}</span></div>
      </section>
      <section className="lg-next">
        <div className="lg-next-top"><span className="lg-eyebrow">{draft ? 'Draft progress' : final ? 'Results' : questionStatus(state, now)}</span></div>
        <h2>{draft ? `${state.draftBoard.filter(e => e.ownerMemberId).length} players drafted` : final ? state.standings.filter(r => r.rank === 1).map(r => r.name).join(' and ') || 'Final' : prop?.question ?? 'No open pick'}</h2>
        <p>{draft ? 'Complete your roster on your device.' : final ? `${state.standings.find(r => r.rank === 1)?.total.toFixed(1) ?? '—'} points` : prop ? 'Make a pick on your device.' : 'The next question will appear here.'}</p>
        {!draft && !final && prop ? <div className="lg-answer-summary">{prop.options.map(o => <span key={o.id}>{o.label}<small>{prop.pickCounts[o.id] ?? 0} {prop.pickCounts[o.id] === 1 ? 'pick' : 'picks'}</small></span>)}</div> : null}
        <button className="lg-primary lg-focus" type="button" id="lg-primary" data-lg-row="0" onClick={() => onNavigate(next, 'lg-primary')}>{action}<LoungeIcon name="arrow" /></button>
      </section>
    </div>
    <Seats state={state} onMember={onMember} />
  </>;
}

function Option({ prop, state, option }: { prop: PropView; state: PartyStateResponse; option: PropView['options'][number] }) {
  const who = state.picks.filter((p) => p.propId === prop.id && p.optionId === option.id);
  const correct = prop.status === 'resolved' && prop.correctOptionId === option.id;
  const count = prop.pickCounts[option.id] ?? 0;
  return <article className={`lg-option${correct ? ' is-correct' : ''}`}>
    <header><h2>{option.label}</h2>{correct ? <span>✓ Correct answer</span> : <span>{count}/{state.households.reduce((n, h) => n + h.members.length, 0)} picks</span>}</header>
    {(() => { const rate = prop.odds?.source === 'drive_odds' ? prop.odds.p[option.id] : option.probability; return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? <div className="lg-estimate"><span style={{ width: `${rate * 100}%` }} /><p>{Math.round(rate * 100)}% · {prop.odds?.source === 'drive_odds' ? 'Historical rate' : 'Estimated rate'}</p></div> : <p className="lg-muted">Rate not available</p>; })()}
    <div className="lg-who">{who.length ? who.map((pick) => <span key={pick.memberId}>{pick.memberName}</span>) : <span className="lg-muted">No picks yet</span>}</div>
  </article>;
}

export function Picks({ state, now }: { state: PartyStateResponse; now: number }) {
  const prop = currentQuestion(state);
  return <section className="lg-picks-view"><span className="lg-eyebrow">{questionStatus(state, now)}</span><h1>{prop?.question ?? 'No open pick'}</h1>
    {prop && prop.status !== 'resolved' ? <p className="lg-picks-explanation">Picks on your device</p> : null}
    {prop ? <><div className="lg-options">{prop.options.map((option) => <Option key={option.id} state={state} prop={prop} option={option} />)}</div>{prop.status === 'resolved' ? <p className="lg-picks-explanation">{prop.explanation ?? 'The correct answer is marked above.'}</p> : null}</> : <div className="lg-empty"><p>The next question will appear here.</p></div>}
  </section>;
}

export function Draft({ state }: { state: PartyStateResponse }) {
  const count = state.draftBoard.filter((entry) => entry.ownerMemberId).length;
  return <section className="lg-draft-view"><header className="lg-view-title"><div><h1>Draft</h1></div><span>{count} players drafted</span></header>
    <div className="lg-draft-teams">{(['home', 'away'] as const).map((side) => <section key={side}><h2><i style={{ background: state.game[side].color }} />{state.game[side].name}</h2><div className="lg-draft-rows lg-focus" tabIndex={0} role="region" aria-label={`${state.game[side].name} draft players`} data-lg-scroll data-lg-row="1">{state.draftBoard.filter((entry) => entry.side === side).map((entry) => <article key={entry.player.id}>
      <span className="lg-player-number">{String(entry.player.number).padStart(2, '0')}</span><span className="lg-draft-player"><b>{entry.player.nickname ?? entry.player.name}</b><small>{entry.player.nickname && entry.player.nickname !== entry.player.name ? `${entry.player.name} · ` : ''}{entry.player.position} · {entry.teamShort}</small></span><span className={`lg-owner${entry.ownerName ? ' is-owned' : ''}`}>{entry.ownerName ?? 'Available'}{entry.round ? <small>Round {entry.round}</small> : null}</span>
    </article>)}</div></section>)}</div>
  </section>;
}

export function Results({ state }: { state: PartyStateResponse }) {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const winner = rows[0];
  return <section className="lg-results"><div className="lg-winner"><span className="lg-eyebrow">Final standings</span>{winner ? <><MemberFace row={winner} /><h1>{rows.filter(r => r.rank === winner.rank).map(r => r.name).join(' and ')}{rows.filter(r => r.rank === winner.rank).length > 1 ? ' tie for first' : ' wins'}</h1><div className="lg-winner-points">{winner.total.toFixed(1)}<span>points</span></div><span>{winner.household}</span></> : <><h1>Final</h1><p>Results will appear when your crew’s points are ready.</p></>}</div>
    <div className="lg-results-story"><h2>Recap</h2><p>{state.recap ?? (winner ? `${winner.name} finishes first with ${winner.total.toFixed(1)} points.` : 'No recap available.')}</p><div className="lg-finishers">{rows.slice(1).map((row) => <div key={row.memberId}><span>#{row.rank}</span><MemberFace row={row} /><b>{row.name}</b><strong>{row.total.toFixed(1)}</strong></div>)}</div>
      {state.benchwarmerOfTheNight ? <details className="lg-benchwarmer"><summary>Postgame note</summary><span className="lg-eyebrow">Benchwarmer of the night</span><h3>{state.benchwarmerOfTheNight.playerName}</h3><p>Drafted by {state.benchwarmerOfTheNight.ownerName} · {state.benchwarmerOfTheNight.points.toFixed(1)} points</p></details> : null}
    </div></section>;
}

export function RosterDialog({ memberId, state, onClose }: { memberId: string; state: PartyStateResponse; onClose: () => void }) {
  const row = state.standings.find((member) => member.memberId === memberId);
  if (!row) return null;
  return <div className="lg-modal-backdrop"><section className="lg-roster-dialog" role="dialog" aria-modal="true" aria-labelledby="lg-roster-title">
    <button className="lg-close lg-focus" id="lg-close-roster" type="button" onClick={onClose} aria-label="Close roster"><LoungeIcon name="close" /></button>
    <header><MemberFace row={row} /><div><span className="lg-eyebrow">{row.household}</span><h2 id="lg-roster-title">{row.name}’s roster</h2></div><div className="lg-roster-total"><b>{row.total.toFixed(1)}</b><span>Total points</span></div></header>
    <div className="lg-roster-players lg-focus" tabIndex={0} role="region" aria-label="Roster players" data-lg-scroll>{row.roster.length ? row.roster.map((player) => { const info = playerInfo(state, player.playerId); return <article key={player.playerId}><span className="lg-player-number">{info?.player.number ?? '—'}</span><div><h3>{info?.player.nickname ?? info?.player.name ?? player.playerId}</h3><span>{info ? `${info.player.name} · ${info.teamShort}` : ''}</span><p>{player.statLine}</p></div><b>{player.points.toFixed(1)}<small>points</small></b></article>; }) : <div className="lg-empty"><h3>No players drafted</h3></div>}</div>
    <footer><span>Draft <b>{row.draftPoints.toFixed(1)}</b></span><span>Picks <b>{row.pickPoints.toFixed(1)}</b></span><span>Rank <b>#{row.rank}</b></span></footer>
  </section></div>;
}
