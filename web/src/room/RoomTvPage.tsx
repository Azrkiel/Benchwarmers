import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { renderSVG } from 'uqr';
import { BrandLockup } from '../brand/Brand';
import { PlayBanner, ToastLayer } from '../fx/fx';
import { Face, FinalPodium, FootballField, HostControls, Leaderboard, PlayFeed, Question, RoomRules, RoomScore } from './components';
import { useRoomMoments } from './moments';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';

function JoinQr({ url }: { url: string }) {
  const svg = useMemo(() => renderSVG(url, { border: 3, ecc: 'M', pixelSize: 1, whiteColor: '#ffffff', blackColor: '#0b0b0d' }), [url]);
  return <span className="rm-join-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const targets = 'a[href],button:not(:disabled),summary,[tabindex="0"]';
function visible(element: HTMLElement) {
  if (element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(element)) return false;
  }
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

export function RoomTvPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const { view, credentials, error, stale, busy, mutate, retry, updatedAt } = useRoom(code, true);
  const root = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const [remoteHint, setRemoteHint] = useState('');
  const moments = useRoomMoments(view);
  useEffect(() => {
    if (view && !initialized.current) {
      root.current?.querySelector<HTMLElement>('[data-tv-first]')?.focus();
      initialized.current = true;
    }
  }, [!!view]);
  useEffect(() => {
    const node = root.current;
    function onToggle(event: Event) {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const first = [...details.querySelectorAll<HTMLElement>(targets)].find((element) => element !== details.querySelector('summary') && visible(element));
      first?.focus();
    }
    node?.addEventListener('toggle', onToggle, true);
    return () => node?.removeEventListener('toggle', onToggle, true);
  }, [!!view]);

  function navigateRemote(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const openTools = root.current?.querySelector<HTMLDetailsElement>('.rm-tv-tools > details[open]');
    if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
      event.preventDefault();
      if (openTools) { openTools.open = false; openTools.querySelector('summary')?.focus(); }
      else { root.current?.querySelector<HTMLElement>('[data-tv-first]')?.focus(); setRemoteHint('Shared screen. Use Open phone view to leave.'); }
      return;
    }
    const scope = openTools ?? root.current;
    const candidates = [...(scope?.querySelectorAll<HTMLElement>(targets) ?? [])].filter(visible);
    if (event.key === 'Tab' && openTools && candidates.length) {
      const index = candidates.indexOf(target);
      if (event.shiftKey && index <= 0) { event.preventDefault(); candidates.at(-1)?.focus(); }
      else if (!event.shiftKey && index === candidates.length - 1) { event.preventDefault(); candidates[0]?.focus(); }
      return;
    }
    if (target.getAttribute('role') === 'region' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const amount = event.key === 'ArrowDown' ? 160 : -160;
      const canScroll = amount > 0 ? target.scrollTop + target.clientHeight < target.scrollHeight - 1 : target.scrollTop > 0;
      if (canScroll) { event.preventDefault(); target.scrollBy({ top: amount, behavior: 'auto' }); return; }
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const from = target.getBoundingClientRect();
    const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    const positive = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    const ranked = candidates.filter((candidate) => candidate !== target).map((element) => {
      const to = element.getBoundingClientRect();
      const dx = to.left + to.width / 2 - cx;
      const dy = to.top + to.height / 2 - cy;
      const along = horizontal ? dx : dy;
      const across = horizontal ? dy : dx;
      return { element, along: along * (positive ? 1 : -1), distance: Math.abs(along) + Math.abs(across) * 3 };
    }).filter((candidate) => candidate.along > 1).sort((a, b) => a.distance - b.distance);
    ranked[0]?.element.focus();
  }

  if (!view) return <main className="rm rm-loading"><BrandLockup size={44} /><h1>{error ? 'Room unavailable' : 'Opening TV view…'}</h1>{error ? <><p role="alert">Could not open room {code}. Check the code or try again.</p><button onClick={retry}>Retry</button><Link to={`/?join=${encodeURIComponent(code)}`}>Edit party code</Link></> : <p role="status">Connecting to room {code}</p>}<Link to="/">Home</Link></main>;
  const joinPath = `/room/${encodeURIComponent(code)}`;
  const joinUrl = `${window.location.host}${joinPath}`;
  const phase = view.room.phase;
  const ready = view.standings.filter((row) => row.roster.length === view.rules.flexSlots + 1).length;
  return <main className={`rm rm-tv is-${phase}`} ref={root} onKeyDown={navigateRemote}>
    <div className="rm-tv-top"><header className="rm-tv-header"><BrandLockup size={34} /><div><h1>{view.room.name}</h1><span>{view.room.participantCount} {view.room.participantCount === 1 ? 'player' : 'players'} in the room</span></div><a data-tv-first className="rm-join-code" href={joinPath} aria-label={`Join on your phone: ${joinUrl}`}><span>Join on your phone</span><b>{code}</b><small>{joinUrl}</small></a>{phase === 'lobby' && <JoinQr url={`${window.location.origin}${joinPath}`} />}</header><div className="rm-connection" aria-live="polite">{stale && <span>Reconnecting · Last update{updatedAt ? ` ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' unavailable'}</span>}</div>{error && <p className="rm-error" role="alert">Could not update room. Showing the last available state. <button onClick={retry}>Retry</button></p>}<p className="rm-tv-small">For a readable shared display, use a full-size window. <Link to={joinPath}>Open phone view</Link></p></div>
    <div className="rm-tv-layout"><div className="rm-tv-game"><RoomScore view={view} large />{phase === 'final' ? <FinalPodium view={view} /> : phase === 'lobby' ? <section className="rm-lobby" role="region" aria-label="Prediction details" tabIndex={0}><span className="rm-eyebrow">Pregame</span><h2>Join on your phone</h2><p>{ready} of {view.room.participantCount} lineups ready</p><div className="rm-lobby-crowd">{view.standings.map((row) => <span key={row.participantId} className="rm-lobby-seat"><Face name={row.name} size={44} />{row.name}<small>{row.roster.length === view.rules.flexSlots + 1 ? 'Ready' : 'Choosing lineup'}</small></span>)}</div>{!view.standings.length && <p>No players yet</p>}</section> : <Question view={view} tv />}<PlayFeed view={view} tv /></div><aside className="rm-tv-standings"><Leaderboard view={view} tv />{phase === 'final' && <Leaderboard view={view} season tv />}</aside></div>
    <footer className="rm-tv-footer"><div className="rm-tv-tools"><details name="room-tv-tools" className="rm-tv-game-tools"><summary>Game details</summary><div className="rm-tv-tool-panel" role="region" aria-label="Expanded game details" tabIndex={0}><FootballField view={view} /><PlayFeed view={view} /></div></details><RoomRules view={view} tv />{credentials.hostToken && <details className="rm-tv-host" name="room-tv-tools"><summary>Host controls</summary><div className="rm-tv-host-panel"><HostControls view={view} busy={busy} onAction={(action, speed) => { void mutate('host', { hostToken: credentials.hostToken, action, speed }); }} /></div></details>}<Link to={joinPath}>Open phone view</Link><Link to="/">Home</Link></div><span className="rm-remote-hint" role="status">{remoteHint}</span></footer>
    <PlayBanner banner={moments.banner} />
    <ToastLayer toasts={moments.banner ? [] : moments.toasts} placement="bottom" />
  </main>;
}
