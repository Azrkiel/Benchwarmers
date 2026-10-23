import { useEffect, useRef, useState } from 'react';
import type { DeviceTurn } from './assistantClient';

export function Transcript({
  turns,
  pending,
  listening,
  interim,
}: {
  turns: DeviceTurn[];
  pending: boolean;
  listening: boolean;
  interim: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [unread, setUnread] = useState(false);

  // Keep the newest turn in view.
  useEffect(() => {
    const el = ref.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
    else if (el) setUnread(true);
  }, [turns, pending, interim]);

  const empty = turns.length === 0 && !pending && !listening;

  return (
    <div className="ds-transcript" data-testid="transcript" role="log" aria-live="polite" ref={ref} onScroll={() => { const el=ref.current; if(el) { atEnd.current=el.scrollHeight-el.scrollTop-el.clientHeight<48; if(atEnd.current) setUnread(false); } }}>
      {empty ? <p className="ds-empty">Ask about the game, or choose a suggestion.</p> : null}
      {turns.map((t) => (
        <div
          key={t.id}
          className={`ds-turn ds-turn-${t.role}${t.error ? ' ds-turn-error' : ''}`}
          data-testid={`turn-${t.role}`}
          role={t.error ? 'alert' : undefined}
        >
          {t.role === 'user' && t.speaker ? <span className="ds-speaker">{t.speaker.memberName}</span> : null}
          <p className="ds-text">{t.text}</p>
        </div>
      ))}
      {listening && interim ? (
        <div className="ds-turn ds-turn-interim" data-testid="interim">
          <p className="ds-text">{interim}</p>
        </div>
      ) : null}
      {pending ? (
        <div className="ds-thinking" data-testid="thinking" role="status">
          Sending…
        </div>
      ) : null}
      {unread ? <button type="button" className="ds-new" onClick={() => { if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; atEnd.current=true; setUnread(false); }}>New messages ↓</button> : null}
    </div>
  );
}
