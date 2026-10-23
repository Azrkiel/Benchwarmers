import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { storageWarning } from './api';
import { ScoreTick, ToastLayer } from '../fx/fx';
import { FinalPodium, FootballField, HostControls, Leaderboard, PlayFeed, points, Question, RoomRules, RoomScore } from './components';
import { ordinal, useRoomMoments } from './moments';
import { JoinRoom } from './RoomLanding';
import { Lineup } from './Lineup';
import { RoomAssistant } from './RoomAssistant';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';

export function RoomPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const { view, credentials, error, stale, busy, mutate, acceptJoin, retry, updatedAt } = useRoom(code);
  const [copyStatus, setCopyStatus] = useState('');
  const moments = useRoomMoments(view, { personal: true });
  if (!view) return <main className="rm rm-loading"><BrandLockup size={32} /><h1>{error ? 'Room unavailable' : 'Opening room…'}</h1>{error ? <><p role="alert">Could not open room {code}. Check the code or try again.</p><button onClick={retry}>Retry</button><Link to="/">Edit room code</Link></> : <p role="status">Connecting to {code}</p>}<Link to="/">Home</Link></main>;
  const joined = !!credentials.participantToken && !!view.me;
  const me = joined ? view.standings.find((row) => row.participantId === view.me?.participantId) : undefined;
  const phase = view.room.phase;
  const lineup = joined && <Lineup view={view} busy={busy} onSave={async (selection) => (await mutate('lineup', { ...selection, participantToken: credentials.participantToken }))?.view} onAuto={async (style) => (await mutate('auto-lineup', { participantToken: credentials.participantToken, style }))?.view} />;
  const last = me?.lastPickScore;
  return <main className={`rm rm-phone is-${phase}`}>
    <header className="rm-header"><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={28} /></Link><a className="rm-tv-link" href={`/room/${encodeURIComponent(code)}/tv`}>TV view →</a></header>
    <div className="rm-room-heading"><h1>{view.room.name}</h1><div className="rm-room-code"><span>Room code · {view.room.participantCount} {view.room.participantCount === 1 ? 'player' : 'players'}</span><button aria-label={`Copy room code ${code}`} onClick={async () => { try { await navigator.clipboard.writeText(code); setCopyStatus('Code copied'); } catch { setCopyStatus(`Share code ${code}`); } }}>{code} <span>Copy</span></button><small role="status">{copyStatus}</small></div></div>
    <div className="rm-connection" aria-live="polite">{stale && <span>Reconnecting · Showing last update{updatedAt ? ` at ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>}</div>
    {error && <p className="rm-error rm-banner" role="alert">{error} <button onClick={retry}>Retry</button></p>}
    {storageWarning() && <p className="rm-banner">{storageWarning()}</p>}
    <RoomScore view={view} />
    {phase === 'final' && <FinalPodium view={view} />}
    {!joined ? <JoinRoom code={code} seasonId={view.season.id} phase={phase} onJoin={acceptJoin} /> : <>
      <section className="rm-personal-score" aria-label="Your score">
        <div><span>You · {view.me?.name}{me ? ` · ${ordinal(me.rank)}` : ''}</span><strong><ScoreTick value={points(me?.total ?? 0)} /></strong><span>Total pts</span></div>
        <div><span>Lineup pts</span><b>{points(me?.fantasyPoints ?? 0)}</b></div><div><span>Pick pts</span><b>{points(me?.predictionPoints ?? 0)}</b></div><div><span>Streak</span><b>{me?.streak ?? 0}</b></div>
      </section>
      {last && <div className={`rm-pick-recap${last.correct ? '' : ' is-miss'}`}>{last.correct ? `Correct · +${points(last.points)} pts` : 'Incorrect · +0 pts'}{last.correct && last.bonuses.length > 0 && <details><summary>Bonus details</summary><span>{last.bonuses.map((bonus) => bonus.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())).join(' · ')}</span></details>}</div>}
      {phase === 'lobby' && lineup}
      {phase !== 'final' && <Question view={view} busy={busy} onPick={async (questionId, optionId) => !!(await mutate('picks', { participantToken: credentials.participantToken, questionId, optionId }))} />}
      <RoomAssistant busy={busy} onCommand={async (text) => (await mutate('assistant', { text, participantToken: credentials.participantToken, hostToken: credentials.hostToken }, true))?.reply} />
    </>}
    <Leaderboard view={view} />
    {(phase === 'final' || view.season.standings.length > 0) && <Leaderboard view={view} season />}
    <details className="rm-game-details"><summary>Game details</summary><FootballField view={view} />{phase !== 'lobby' && <PlayFeed view={view} />}</details>
    {phase !== 'lobby' && <details className="rm-lineup-review"><summary>Review lineup</summary>{lineup}</details>}
    {phase === 'final' && <details className="rm-pick-review"><summary>Previous pick</summary><Question view={view} /></details>}
    {credentials.hostToken && <details className="rm-phone-host"><summary>Host controls</summary><HostControls view={view} busy={busy} onAction={(action, speed) => { void mutate('host', { hostToken: credentials.hostToken, action, speed }); }} /></details>}
    <RoomRules view={view} />
    <ToastLayer toasts={moments.toasts.slice(-1)} placement="top" />
  </main>;
}
