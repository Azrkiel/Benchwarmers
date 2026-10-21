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
      <span className="sp-label">Who's talking?</span>
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
          Hi {recognized.memberName}
          <span className="sp-conf">{Math.round(recognized.confidence * 100)}%</span>
          {recognized.provisional && <span className="sp-guess">guess</span>}
        </span>
      )}
    </div>
  );
}
