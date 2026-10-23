import type { Member } from '@shared/types';
import './speaker.css';

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
  return (
    <div className="sp-bar">
      <span className="sp-label">{screenPick ? `Playing as ${screenPick}` : 'Choose player for typed actions'}</span>
      {members.map((m) => {
        const on = screenPick === m.name;
        return (
          <button
            key={m.id}
            type="button"
            className={`sp-chip${on ? ' sp-chip-on' : ''}`}
            aria-pressed={on}
            data-testid={`member-${m.id}`}
            onClick={() => onPick(on ? undefined : m.name)}
          >
            <span className="sp-avatar" aria-hidden="true">{m.avatar}</span>
            {m.name}
          </button>
        );
      })}
      {recognized && (
        <span className="sp-chip sp-recognized" data-testid="recognized-chip">
          {recognized.provisional ? 'Check voice match: ' : 'Voice matched: '}{recognized.memberName}
          {recognized.provisional && <span className="sp-guess">Choose your name to confirm</span>}
        </span>
      )}
    </div>
  );
}
