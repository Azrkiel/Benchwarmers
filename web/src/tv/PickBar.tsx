import { useEffect, useState } from 'react';
import type { PartyStateResponse, PropView } from '@shared/types';
import { Avatar, householdColor } from './avatar';
import { findMember } from './pops';
import { formatCountdown, lockDeadline, secondsLeft } from '../lib/usePartyState';

export function PickBar({ state, serverNow }: { state: PartyStateResponse; serverNow: () => number }) {
  // Re-render every 250 ms so the countdown follows the server-offset clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Priority: open (active) > locked (picks closed, result pending) > last resolved.
  const locked = state.activeProp ? undefined : state.props.find((p) => p.status === 'locked');
  let body;
  if (state.activeProp) {
    const active = state.activeProp;
    const deadline = lockDeadline(state);
    const sec = secondsLeft(deadline, serverNow());
    const timed = deadline !== undefined && sec > 0;
    const open = active.status === 'open' && (timed || deadline === undefined);
    body = (
      <>
        <PropOptions state={state} prop={active} />
        <div className="tv-pick-status">
          {timed ? (
            <>
              <span className="tv-pick-clock-icon" aria-hidden="true">⏱</span>
              <span className="tv-pick-clock">{formatCountdown(sec)}</span>
              <span className="tv-muted">Locks in</span>
            </>
          ) : (
            <span className="tv-muted">{open ? 'Open' : 'Locked'}</span>
          )}
        </div>
      </>
    );
  } else if (locked) {
    body = (
      <>
        <PropOptions state={state} prop={locked} />
        <div className="tv-pick-status">
          <span className="tv-pick-locked">LOCKED — waiting for the result</span>
        </div>
      </>
    );
  } else if (state.lastResolvedProp) {
    const r = state.lastResolvedProp;
    const ans = r.options.find((o) => o.id === r.correctOptionId)?.label;
    body = (
      <>
        <div className="tv-pick-q">{r.question}</div>
        <div className="tv-pick-status">
          <span className="tv-pick-answer">{ans ? `Answer: ${ans}` : 'Result pending'}</span>
        </div>
        {r.explanation ? <div className="tv-pick-explain">{r.explanation}</div> : null}
      </>
    );
  } else {
    body = <div className="tv-pick-q tv-muted">Next pick coming up…</div>;
  }

  return (
    <section className="tv-pickbar">
      <div className="tv-pick-kicker">LIVE PICK</div>
      {body}
    </section>
  );
}

/** Question plus per-option probability, pick counts and who picked what. */
function PropOptions({ state, prop }: { state: PartyStateResponse; prop: PropView }) {
  const picks = state.picks.filter((p) => p.propId === prop.id);
  return (
    <>
      <div className="tv-pick-q">{prop.question}</div>
      <div className="tv-pick-options">
        {prop.options.map((o) => {
          const pct = o.probability !== undefined ? Math.round(o.probability * 100) : undefined;
          const count = prop.pickCounts[o.id] ?? 0;
          const who = picks.filter((p) => p.optionId === o.id);
          return (
            <div className="tv-pick-opt" key={o.id}>
              <div className="tv-pick-opt-top">
                <span className="tv-pick-label">{o.label}</span>
                <span className="tv-pick-pct">{pct !== undefined ? `${pct}%` : '—'}</span>
              </div>
              <div className="tv-pick-bar"><span style={{ width: `${pct ?? 0}%` }} /></div>
              <div className="tv-pick-count">{`${count} ${count === 1 ? 'pick' : 'picks'}`}</div>
              <div className="tv-pick-who">
                {who.map((p) => {
                  const found = findMember(state.households, p.memberId);
                  return (
                    <span className="tv-pick-who-item" key={`${p.memberId}-${p.at}`}>
                      <Avatar
                        avatar={found?.member.avatar}
                        name={p.memberName}
                        color={householdColor(state.households, found?.household.id)}
                        size={40}
                      />
                      <span>{p.memberName}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
