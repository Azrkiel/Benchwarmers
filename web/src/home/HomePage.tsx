import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HostRoomForm, JoinCodeForm } from '../room/RoomLanding';
import { HomeFooter, HomeNav } from './HomeNav';
import './home.css';

type Mode = 'host' | 'join' | null;

/** Original half-court graphic: a shot arcs into the hoop. Decorative only. */
function CourtGraphic() {
  return <div className="hm-court" aria-hidden="true">
    <svg viewBox="0 0 440 300" fill="none">
      <path className="hm-court-line" d="M20 280H420M90 280V170H350V280M150 170A70 70 0 0 0 290 170M40 280V120A180 180 0 0 1 400 120V280" />
      <path className="hm-court-board" d="M180 52H260" />
      <path className="hm-court-rim" d="M204 66H236" />
      <path className="hm-court-net" d="M206 68L212 92L220 70L228 92L234 68M210 80H230" />
      <path className="hm-court-arc" pathLength="1" d="M92 236Q150 -20 220 60" />
      <circle className="hm-court-ball" cx="92" cy="236" r="13" />
      <path className="hm-court-seam" d="M79 236H105M92 223V249" />
    </svg>
  </div>;
}

export function HomePage() {
  const [params] = useSearchParams();
  const initialCode = params.get('join') ?? '';
  const [mode, setMode] = useState<Mode>(initialCode ? 'join' : null);
  const hostButton = useRef<HTMLButtonElement>(null);
  const joinButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Mode>(null);

  useEffect(() => {
    if (mode) panel.current?.querySelector<HTMLElement>('input:not([type=radio]), input:checked')?.focus();
  }, [mode]);

  function open(next: Exclude<Mode, null>) { opener.current = next; setMode(next); }
  function close() {
    const back = opener.current === 'join' ? joinButton : hostButton;
    setMode(null);
    requestAnimationFrame(() => back.current?.focus());
  }
  function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape' && mode) { event.preventDefault(); close(); } }

  return <main className="hm">
    <HomeNav />
    <section className={`hm-hero${mode ? ' has-panel' : ''}`} aria-labelledby="hm-title">
      <div className="hm-copy">
        <span className="hm-eyebrow">Watch-party fantasy</span>
        <h1 id="hm-title">Game night</h1>
        <p>Pick a lineup. Call the next play. See where you stand.</p>
        <div className="hm-actions">
          <button ref={hostButton} className="hm-cta" aria-expanded={mode === 'host'} aria-controls="hm-panel" onClick={() => mode === 'host' ? close() : open('host')}>Host a party</button>
          <button ref={joinButton} className="hm-cta is-secondary" aria-expanded={mode === 'join'} aria-controls="hm-panel" onClick={() => mode === 'join' ? close() : open('join')}>Join a party</button>
        </div>
      </div>
      <div className="hm-stage">
        {mode
          ? <div id="hm-panel" ref={panel} className="hm-panel" role="group" aria-label={mode === 'host' ? 'Host a party' : 'Join a party'} onKeyDown={onKeyDown}>
              <h2>{mode === 'host' ? 'Host a party' : 'Join a party'}</h2>
              {mode === 'host' ? <HostRoomForm onCancel={close} /> : <JoinCodeForm initialCode={initialCode} onCancel={close} />}
            </div>
          : <CourtGraphic />}
      </div>
    </section>
    <HomeFooter />
  </main>;
}
