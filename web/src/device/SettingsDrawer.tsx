import { useEffect, useRef, type ReactNode } from 'react';
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
  diagnostics,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  voice: VoiceId;
  muted: boolean;
  onToggleMute: () => void;
  partyCode?: string;
  householdName: string;
  diagnostics?: ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href], summary') ?? [])];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open]);

  if (!open) return null;

  const canLoad = voice.status === 'idle' || voice.status === 'error';
  const statusText =
    voice.status === 'ready'
      ? 'Ready'
      : voice.status === 'loading'
        ? `Preparing recognition… ${Math.round(voice.progress * 100)}%`
        : voice.status === 'error'
          ? 'Voice setup failed. Try again.'
          : 'Not set up';

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={dialog}
        className="drawer"
        role="dialog"
        aria-modal="true"
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
          <h3>Recognize voices</h3>
          <p className="drawer-status">{statusText}</p>
          {canLoad && (
            <button type="button" className="drawer-btn" onClick={() => void voice.load()}>
              {voice.status === 'error' ? 'Retry voice setup' : 'Prepare voice recognition'}
            </button>
          )}
          <p className="drawer-status">First setup downloads about 100 MB. Voice ID audio and voiceprints stay on this device.</p>
          <EnrollPanel members={members} voice={voice} />
        </section>
        <details className="drawer-section"><summary>Diagnostics</summary><p>Voice engine: {voice.backend ?? 'Not loaded'}</p>{voice.error ? <p>{voice.error}</p> : null}{diagnostics}</details>
        <section className="drawer-section">
          <h3>Speech</h3>
          <label className="drawer-row">
            <input type="checkbox" checked={!muted} onChange={onToggleMute} />
            Speak replies
          </label>
        </section>
        <section className="drawer-section">
          <h3>Party</h3>
          {partyCode ? <p className="drawer-row">Party code: <strong>{partyCode}</strong></p> : <p className="drawer-row">No party selected</p>}
          <p className="drawer-row">Household: <strong>{householdName}</strong></p>
        </section>
      </aside>
    </div>
  );
}
