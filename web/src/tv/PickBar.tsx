import { useEffect, useState } from 'react';
import type { PartyStateResponse, PropView } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { findMember } from './pops';
import { PickBonuses } from './PickBonuses';
import { formatCountdown, lockDeadline, secondsLeft } from '../lib/usePartyState';

export function PickBar({ state, serverNow }: { state: PartyStateResponse; serverNow: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(id); }, []);
  const prop = state.activeProp ?? state.props.find(p => p.status === 'locked') ?? state.lastResolvedProp;
  const deadline = lockDeadline(state);
  const sec = secondsLeft(deadline, serverNow());
  const resolved = prop?.status === 'resolved';
  const locked = prop?.status === 'locked' || (deadline !== undefined && sec === 0);
  const heading = resolved ? 'Result' : locked ? 'Picks locked' : prop ? 'Open pick' : 'Picks';
  return <section className="tv-pickbar" aria-label={heading}>
    <div className="tv-pick-kicker">{heading}</div>
    {prop ? <>
      <PropOptions state={state} prop={prop} />
      <div className="tv-pick-status">{resolved ? <span className="tv-pick-answer">{prop.correctOptionId ? `Answer: ${prop.options.find(o => o.id === prop.correctOptionId)?.label ?? prop.correctOptionId}` : 'Result pending'}</span> : locked ? <span className="tv-pick-locked">Waiting for the result</span> : deadline !== undefined ? <><span className="tv-muted">Closes in</span><span className="tv-pick-clock">{formatCountdown(sec)}</span></> : <span>Make a pick on your device</span>}</div>
      {resolved && prop.explanation ? <div className="tv-pick-explain">{prop.explanation}</div> : null}
    </> : <div className="tv-pick-q tv-muted">No open pick. The next question will appear here.</div>}
    <PickBonuses state={state} />
  </section>;
}

function PropOptions({ state, prop }: { state: PartyStateResponse; prop: PropView }) {
  const picks = state.picks.filter(p => p.propId === prop.id);
  const total = state.households.reduce((sum, h) => sum + h.members.length, 0);
  const historical = prop.odds?.source === 'drive_odds';
  const binary = prop.options.length === 2;
  return <>
    <div className="tv-pick-q">{prop.question}</div>
    <div className={`tv-pick-options${binary ? ' is-binary' : ''}`}>
      {prop.options.map(o => {
        const rate = prop.odds?.source === 'drive_odds' ? prop.odds.p[o.id] : o.probability;
        const pct = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? Math.round(rate * 100) : undefined;
        const count = prop.pickCounts[o.id] ?? 0;
        const correct = prop.status === 'resolved' && prop.correctOptionId === o.id;
        return <div className={`tv-pick-opt${correct ? ' is-correct' : ''}`} key={o.id} data-option={o.id}>
          <div className="tv-pick-opt-top"><span className="tv-pick-label">{o.label}</span>{correct ? <span className="tv-correct-answer">Correct answer</span> : null}</div>
          <div className="tv-pick-rate"><span>{historical ? 'Historical rate' : 'Estimated rate'}</span><span className="tv-pick-pct">{pct === undefined ? 'Not available' : `${pct}%`}</span></div>
          {pct !== undefined ? <div className="tv-pick-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div> : null}
          <div className="tv-pick-count">{count}/{total} picks</div>
          <div className="tv-pick-who">{picks.filter(p => p.optionId === o.id).map(p => {
            const member = findMember(state.households, p.memberId);
            return <span className="tv-pick-who-item" key={`${p.memberId}-${p.at}`}><Avatar avatar={member?.member.avatar} name={p.memberName} color={householdColor(state.households, member?.household.id)} size={36} /><span>{p.memberName}</span></span>;
          })}</div>
        </div>;
      })}
    </div>
  </>;
}
