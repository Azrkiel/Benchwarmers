import { useState } from 'react';
import type { Member } from '@shared/types';
import './speaker.css';

/** One effective identity: a manual pick wins, else a confident voice match. */
export function SpeakerBar({
  members,
  screenPick,
  onPick,
  recognized,
}: {
  members: Member[];
  screenPick?: string;
  onPick: (name?: string) => void;
  recognized?: { memberName: string; confidence: number; provisional: boolean };
}) {
  const [changing, setChanging] = useState(false);
  const voiceMatch = recognized && !recognized.provisional ? recognized.memberName : undefined;
  const current = screenPick ?? voiceMatch;
  const source = screenPick ? undefined : voiceMatch ? 'voice match' : undefined;
  const showChips = !current || changing;
  const guess = !current && recognized?.provisional ? recognized.memberName : undefined;
  return (
    <div className="sp-bar">
      {current ? (
        <p className="sp-current" data-testid="speaker-current">
          <span className="sp-label">Speaking</span> <strong>{current}</strong>
          {source ? <span className="sp-source">{source}</span> : null}
          <button type="button" className="sp-change" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
            Change player
          </button>
        </p>
      ) : (
        <p className="sp-current sp-none" data-testid="speaker-current">
          <span className="sp-label">Choose who&rsquo;s speaking</span>
          {guess ? <span className="sp-source">Possible match: {guess}</span> : null}
        </p>
      )}
      {showChips ? (
        <div className="sp-chips">
          {members.map((m) => {
            const on = screenPick === m.name;
            return (
              <button
                key={m.id}
                type="button"
                className={`sp-chip${on ? ' sp-chip-on' : ''}`}
                aria-pressed={on}
                data-testid={`member-${m.id}`}
                onClick={() => {
                  onPick(on ? undefined : m.name);
                  setChanging(false);
                }}
              >
                <span className="sp-avatar" aria-hidden="true">{m.avatar}</span>
                {m.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
