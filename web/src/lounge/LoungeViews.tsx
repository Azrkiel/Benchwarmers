import type { PartyStateResponse, PropView } from '@shared/types';
import { formatCountdown, lockDeadline, secondsLeft } from '../lib/usePartyState';
import { playerInfo } from '../tv/rosters';
import { BasketballArt, LoungeIcon, MemberFace, Seats, type LoungeView } from './LoungeElements';

export function currentQuestion(state: PartyStateResponse) {
  return state.activeProp ?? state.props.find((p) => p.status === 'locked') ?? state.lastResolvedProp;
}

export function questionStatus(state: PartyStateResponse, now: number) {
  const prop = currentQuestion(state);
  if (!prop) return 'Next question coming soon';
  if (prop.status === 'resolved') return 'The result is in';
  const deadline = lockDeadline(state);
  const left = secondsLeft(deadline, now);
  if (prop.status === 'locked' || (deadline !== undefined && left === 0)) return 'Picks closed · result pending';
  return deadline !== undefined ? `Closes in ${formatCountdown(left)}` : 'Open for picks';
}

export function Tonight({ state, now, onNavigate, onMember }: { state: PartyStateResponse; now: number; onNavigate: (view: LoungeView, origin: string) => void; onMember: (id: string) => void }) {
  const prop = currentQuestion(state);
  const draft = state.party.status === 'drafting';
  const final = state.party.status === 'final';
  const next = draft ? 'draft' : final ? 'final' : 'picks';
  const action = draft ? 'Explore the draft' : final ? 'See tonight’s results' : 'See live picks';
  return <>
    <div className="lg-tonight-grid">
      <section className="lg-match">
        <BasketballArt />
        <div className="lg-match-content">
          <span className="lg-eyebrow">{final ? 'That’s the game' : draft ? 'Before the first whistle' : 'On the court'}</span>
          <h1 className={Math.max(state.game.home.name.length, state.game.away.name.length) > 22 ? 'is-long' : ''}><span>{state.game.home.name}</span><em>vs.</em><span>{state.game.away.name}</span></h1>
          <div className="lg-match-score" aria-label={`${state.game.home.name} ${state.game.home.score}, ${state.game.away.name} ${state.game.away.score}`}><b>{state.game.home.score}</b><span>—</span><b>{state.game.away.score}</b><small>{state.game.clock}</small></div>
        </div>
        <div className="lg-latest"><span>Latest</span><span>{state.recentEvents[0]?.text ?? 'The night starts with your draft.'}</span></div>
      </section>
      <section className="lg-next">
        <div className="lg-next-top"><span className="lg-eyebrow">{draft ? 'Build your roster' : final ? 'After the whistle' : 'Your next call'}</span><span className="lg-question-mark" aria-hidden="true">{draft ? '01' : final ? '✓' : '?'}</span></div>
        <h2>{draft ? 'Who’s on your bench?' : final ? 'Who owned the night?' : prop?.question ?? 'What happens next?'}</h2>
        <p>{draft ? 'Find your favorites. See who your friends have their eye on.' : final ? 'The winner, the highlights, and the benchwarmer of the night.' : prop ? questionStatus(state, now) : 'The next question will appear here when it opens.'}</p>
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
    <header><h2>{option.label}</h2>{correct ? <span>✓ Correct answer</span> : <span>{count} {count === 1 ? 'pick' : 'picks'}</span>}</header>
    {option.probability !== undefined ? <div className="lg-estimate"><span style={{ width: `${Math.max(0, Math.min(100, option.probability * 100))}%` }} /><p>{Math.round(option.probability * 100)}% model estimate</p></div> : null}
    <div className="lg-who">{who.length ? who.map((pick) => <span key={pick.memberId}>{pick.memberName}</span>) : <span className="lg-muted">No one here yet</span>}</div>
  </article>;
}

export function Picks({ state, now }: { state: PartyStateResponse; now: number }) {
  const prop = currentQuestion(state);
  return <section className="lg-picks-view"><span className="lg-eyebrow">Pick’em · {questionStatus(state, now)}</span><h1>{prop?.question ?? 'The next call is coming.'}</h1>
    {prop ? <><div className="lg-options">{prop.options.map((option) => <Option key={option.id} state={state} prop={prop} option={option} />)}</div><p className="lg-picks-explanation">{prop.status === 'resolved' ? prop.explanation ?? 'The correct answer is marked above.' : 'Make your own pick by voice or on your device. The room’s choices appear here.'}</p></> : <div className="lg-empty"><p>There isn’t a question open right now. Your crew’s next call will appear here.</p></div>}
  </section>;
}

export function Draft({ state }: { state: PartyStateResponse }) {
  const count = state.draftBoard.filter((entry) => entry.ownerMemberId).length;
  return <section className="lg-draft-view"><header className="lg-view-title"><div><span className="lg-eyebrow">The first picks of the night</span><h1>The draft</h1></div><span>{count} players drafted</span></header>
    <div className="lg-draft-teams">{(['home', 'away'] as const).map((side) => <section key={side}><h2><i style={{ background: state.game[side].color }} />{state.game[side].name}</h2><div className="lg-draft-rows">{state.draftBoard.filter((entry) => entry.side === side).map((entry) => <article key={entry.player.id}>
      <span className="lg-player-number">{String(entry.player.number).padStart(2, '0')}</span><span className="lg-draft-player"><b>{entry.player.nickname ?? entry.player.name}</b><small>{entry.player.name} · {entry.player.position}</small></span><span className={`lg-owner${entry.ownerName ? ' is-owned' : ''}`}>{entry.ownerName ?? 'Available'}{entry.round ? <small>Round {entry.round}</small> : null}</span>
    </article>)}</div></section>)}</div>
  </section>;
}

export function Results({ state }: { state: PartyStateResponse }) {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  const winner = rows[0];
  return <section className="lg-results"><div className="lg-winner"><span className="lg-eyebrow">The room has a winner</span>{winner ? <><MemberFace row={winner} /><h1>{winner.name} takes the night.</h1><div className="lg-winner-points">{winner.total.toFixed(1)}<span>points</span></div><span>{winner.household}</span></> : <><h1>That’s the final whistle.</h1><p>Results will appear when your crew’s points are ready.</p></>}</div>
    <div className="lg-results-story"><h2>How it finished.</h2><p>{state.recap ?? (winner ? `${winner.name} finishes first with ${winner.total.toFixed(1)} points.` : 'Your game-night recap will appear here.')}</p><div className="lg-finishers">{rows.slice(1).map((row) => <div key={row.memberId}><span>#{row.rank}</span><MemberFace row={row} /><b>{row.name}</b><strong>{row.total.toFixed(1)}</strong></div>)}</div>
      {state.benchwarmerOfTheNight ? <aside className="lg-benchwarmer"><span className="lg-eyebrow">Benchwarmer of the night</span><h3>{state.benchwarmerOfTheNight.playerName}</h3><p>Drafted by {state.benchwarmerOfTheNight.ownerName} · {state.benchwarmerOfTheNight.points.toFixed(1)} points</p></aside> : null}
    </div></section>;
}

export function RosterDialog({ memberId, state, onClose }: { memberId: string; state: PartyStateResponse; onClose: () => void }) {
  const row = state.standings.find((member) => member.memberId === memberId);
  if (!row) return null;
  return <div className="lg-modal-backdrop"><section className="lg-roster-dialog" role="dialog" aria-modal="true" aria-labelledby="lg-roster-title">
    <button className="lg-close lg-focus" id="lg-close-roster" type="button" onClick={onClose} aria-label="Close roster"><LoungeIcon name="close" /></button>
    <header><MemberFace row={row} /><div><span className="lg-eyebrow">{row.household}</span><h2 id="lg-roster-title">{row.name}’s roster</h2></div><div className="lg-roster-total"><b>{row.total.toFixed(1)}</b><span>Total points</span></div></header>
    <div className="lg-roster-players">{row.roster.length ? row.roster.map((player) => { const info = playerInfo(state, player.playerId); return <article key={player.playerId}><span className="lg-player-number">{info?.player.number ?? '—'}</span><div><h3>{info?.player.nickname ?? info?.player.name ?? player.playerId}</h3><span>{info ? `${info.player.name} · ${info.teamShort}` : ''}</span><p>{player.statLine}</p></div><b>{player.points.toFixed(1)}<small>points</small></b></article>; }) : <div className="lg-empty"><h3>A bench waiting to be built.</h3><p>Your drafted players will appear here.</p></div>}</div>
    <footer><span>Draft <b>{row.draftPoints.toFixed(1)}</b></span><span>Picks <b>{row.pickPoints.toFixed(1)}</b></span><span>Rank <b>#{row.rank}</b></span></footer>
  </section></div>;
}
