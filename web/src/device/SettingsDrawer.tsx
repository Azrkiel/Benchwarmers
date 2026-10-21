import { useEffect } from 'react';
import type { Member } from '@shared/types';
import { EnrollPanel, type VoiceId } from '../voiceid';
import './speaker.css';

export function SettingsDrawer({
  open,
  onClose,
  members,
  voice,
  muted,
  onToggleMute,
  partyCode,
  householdName,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  voice: VoiceId;
  muted: boolean;
  onToggleMute: () => void;
  partyCode: string;
  householdName: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canLoad = voice.status === 'idle' || voice.status === 'error';
  const statusText =
    voice.status === 'ready'
      ? `Model ready${voice.backend ? ` (${voice.backend})` : ''}`
      : voice.status === 'loading'
        ? `Loading model… ${Math.round(voice.progress * 100)}%`
        : voice.status === 'error'
          ? `Model error: ${voice.error ?? 'unknown'}`
          : 'Model not loaded';

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>Settings</h2>
          <button type="button" className="drawer-close" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </header>
        <section className="drawer-section">
          <h3>Voice ID</h3>
          <p className="drawer-status">{statusText}</p>
          {canLoad && (
            <button type="button" className="drawer-btn" onClick={() => void voice.load()}>
              Load voice model
            </button>
          )}
          <EnrollPanel members={members} voice={voice} />
        </section>
        <section className="drawer-section">
          <h3>Speech</h3>
          <label className="drawer-row">
            <input type="checkbox" checked={!muted} onChange={onToggleMute} />
            Speak replies
          </label>
        </section>
        <section className="drawer-section">
          <h3>Party</h3>
          <p className="drawer-row">Party code: <strong>{partyCode}</strong></p>
          <p className="drawer-row">Household: <strong>{householdName}</strong></p>
        </section>
      </aside>
    </div>
  );
}
