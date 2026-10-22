import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { BurstLayer, PlayBanner, ToastLayer } from '../fx/fx';
import { Face, FinalPodium, FootballField, HostControls, Leaderboard, PlayFeed, Question, RoomRules, RoomScore } from './components';
import { useRoomMoments } from './moments';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';

export function RoomTvPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const { view, credentials, error, stale, busy, mutate } = useRoom(code, true);
  const root = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const initialized = useRef(false);
  const moments = useRoomMoments(view);
  useEffect(() => {
    if (view && !initialized.current) {
      root.current?.querySelector<HTMLElement>('[data-tv-first]')?.focus();
      initialized.current = true;
    }
  }, [!!view]);

  function navigateRemote(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' || event.key === 'BrowserBack') {
      event.preventDefault();
      const popover = root.current?.querySelector<HTMLDetailsElement>('details[open]');
      if (popover) {
        popover.open = false;
        popover.querySelector('summary')?.focus();
      } else navigate(`/room/${code}`);
      return;
    }
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') === 'region' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const amount = event.key === 'ArrowDown' ? 160 : -160;
      const canScroll = amount > 0 ? target.scrollTop + target.clientHeight < target.scrollHeight - 1 : target.scrollTop > 0;
      if (canScroll) {
        event.preventDefault();
        target.scrollBy({ top: amount, behavior: 'auto' });
        return;
      }
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const candidates = [...(root.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),summary,[tabindex="0"]') ?? [])]
      .filter((element) => {
        const details = element.closest('details');
        return !details || details.open || element.tagName === 'SUMMARY';
      });
    const index = candidates.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    candidates[Math.max(0, Math.min(candidates.length - 1, index + step))]?.focus();
  }

  if (!view) return (
    <main className="rm rm-loading rm-tv-loading">
      <BrandLockup size={44} />
      <h1>{error ? 'Room unavailable' : 'Opening the big screen...'}</h1>
      {error ? <p role="alert">{error}</p> : <p role="status">Connecting to room {code}</p>}
      <Link to="/">Back to game night</Link>
    </main>
  );

  const joinPath = `/room/${encodeURIComponent(code)}`;
  const joinUrl = `${window.location.origin}${joinPath}`;
  const phase = view.room.phase;
  return (
    <main className={`rm rm-tv is-${phase}`} ref={root} onKeyDown={navigateRemote}>
      <div className="rm-tv-top">
        <header className="rm-tv-header">
          <BrandLockup size={38} />
          <div><h1>{view.room.name}</h1><span>{view.room.participantCount} {view.room.participantCount === 1 ? 'player' : 'players'} in the room</span></div>
          <a data-tv-first className="rm-join-code" href={joinPath} aria-label={`Join on your phone: ${joinUrl}`}>
            <span>Join on your phone</span><b>{code}</b><small>{joinUrl.replace(/^https?:\/\//, '')}</small>
          </a>
        </header>
        {stale && <p className="rm-reconnecting" role="status">Reconnecting…</p>}
        {error && <p className="rm-error" role="alert">{error}</p>}
      </div>
      <div className="rm-tv-layout">
        <div className="rm-tv-game">
          <RoomScore view={view} large />
          <FootballField view={view} />
          {phase === 'final' ? <FinalPodium view={view} /> : phase === 'lobby' ? (
            <section className="rm-lobby" role="region" aria-label="Prediction details" tabIndex={0}>
              <span className="rm-eyebrow">Pregame</span>
              <h2>Grab your phone and join.</h2>
              <div className="rm-lobby-join"><span>{joinUrl.replace(/^https?:\/\//, '').replace(/\/room\/.*/, '')}</span><b>{code}</b></div>
              <div className="rm-lobby-crowd">{view.standings.map((row) => <span key={row.participantId} className="rm-lobby-seat"><Face name={row.name} size={44} />{row.name}</span>)}</div>
            </section>
          ) : <Question view={view} tv />}
          <PlayFeed view={view} tv />
        </div>
        <aside className="rm-tv-standings">
          <Leaderboard view={view} tv />
          {phase === 'final' && <Leaderboard view={view} season tv />}
        </aside>
      </div>
      <footer className="rm-tv-footer">
        <div className="rm-tv-tools">
          <RoomRules view={view} tv />
          {credentials.hostToken && (
            <details className="rm-tv-host" name="room-tv-tools">
              <summary>Host controls</summary>
              <div className="rm-tv-host-panel">
                <HostControls view={view} busy={busy} onAction={(action, speed) => {
                  void mutate('host', { hostToken: credentials.hostToken, action, speed });
                }} />
              </div>
            </details>
          )}
          <Link to={joinPath}>My lineup</Link>
        </div>
      </footer>
      <PlayBanner banner={moments.banner} />
      <BurstLayer bursts={moments.bursts} />
      <ToastLayer toasts={moments.toasts} placement="top" />
    </main>
  );
}
