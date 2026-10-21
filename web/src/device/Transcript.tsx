import { useEffect, useRef } from 'react';
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

  // Keep the newest turn in view.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, interim]);

  const empty = turns.length === 0 && !pending && !listening;

  return (
    <div className="ds-transcript" data-testid="transcript" role="log" aria-live="polite" ref={ref}>
      {empty ? <p className="ds-empty">Tap the mic or type a message to start.</p> : null}
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
          thinking…
        </div>
      ) : null}
    </div>
  );
}
