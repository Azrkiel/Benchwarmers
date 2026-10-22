import { Link, useParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { storageWarning } from './api';
import { BurstLayer, PlayBanner, ScoreTick, ToastLayer } from '../fx/fx';
import { FootballField, HostControls, Leaderboard, PlayFeed, points, Question, RoomRules, RoomScore } from './components';
import { ordinal, useRoomMoments } from './moments';
import { JoinRoom } from './RoomLanding';
import { Lineup } from './Lineup';
import { RoomAssistant } from './RoomAssistant';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';

export function RoomPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const { view, credentials, error, stale, busy, mutate, acceptJoin } = useRoom(code);
  const moments = useRoomMoments(view, { personal: true });
  if (!view) return <main className="rm rm-loading"><BrandLockup size={32} /><h1>{error ? 'Room unavailable' : 'Opening the room...'}</h1>{error ? <p role="alert">{error}</p> : <p role="status">Connecting to {code}</p>}<Link to="/">Back to game night</Link></main>;
  const joined = !!credentials.participantToken && !!view.me;
  const me = joined ? view.standings.find((row) => row.participantId === view.me?.participantId) : undefined;
  const phase = view.room.phase;
  const lineup = joined && <Lineup view={view} busy={busy} onSave={async (selection) => (await mutate('lineup', { ...selection, participantToken: credentials.participantToken }))?.view} onAuto={async (style) => (await mutate('auto-lineup', { participantToken: credentials.participantToken, style }))?.view} />;
  const last = me?.lastPickScore;
  return <main className="rm rm-phone">
    <header className="rm-header"><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={28} /></Link><a className="rm-tv-link" href={`/room/${encodeURIComponent(code)}/tv`}>Open TV view &rarr;</a></header>
    <div className="rm-room-heading"><div><span className="rm-eyebrow">Football</span><h1>{view.room.name}</h1></div><div className="rm-room-code"><span>Room code</span><b>{code}</b><small>{view.room.participantCount} {view.room.participantCount === 1 ? 'player' : 'players'}</small></div></div>
    {stale && <p className="rm-reconnecting" role="status">Reconnecting…</p>}
    {error && <p className="rm-error rm-banner" role="alert">{error}</p>}
    {storageWarning() && <p className="rm-banner">{storageWarning()}</p>}
    <RoomScore view={view} />
    <FootballField view={view} />
    {credentials.hostToken && <HostControls view={view} busy={busy} onAction={(action, speed) => { void mutate('host', { hostToken: credentials.hostToken, action, speed }); }} />}
    {!joined ? <JoinRoom code={code} seasonId={view.season.id} onJoin={acceptJoin} /> : <>
      <section className="rm-personal-score" aria-label="Your score">
        <div><span>{view.me?.name}{me && me.total > 0 ? ` · ${ordinal(me.rank)}` : ''}</span><strong><ScoreTick value={points(me?.total ?? 0)} /> <small>pts</small></strong></div>
        <div><span>Lineup</span><b>{points(me?.fantasyPoints ?? 0)}</b></div>
        <div><span>Calls</span><b>{points(me?.predictionPoints ?? 0)}</b></div>
        <div><span>Streak</span><b>{me?.streak ? `🔥 ${me.streak}` : 0}</b></div>
      </section>
      {last && <p className={`rm-pick-recap${last.correct ? '' : ' is-miss'}`}>{last.correct ? `Last call +${points(last.points)}` : 'Last call missed'}{last.correct && last.bonuses.length > 0 ? ` · ${last.bonuses.join(' · ')}` : ''}</p>}
      {phase === 'lobby' && lineup}
      <Question view={view} busy={busy} onPick={(questionId, optionId) => { void mutate('picks', { participantToken: credentials.participantToken, questionId, optionId }); }} />
    </>}
    {phase !== 'lobby' && <PlayFeed view={view} />}
    <Leaderboard view={view} />
    {phase !== 'lobby' && lineup}
    {joined && <RoomAssistant busy={busy} onCommand={async (text) => (await mutate('assistant', { text, participantToken: credentials.participantToken, hostToken: credentials.hostToken }, true))?.reply} />}
    <RoomRules view={view} />
    {(phase === 'final' || view.season.standings.length > 0) && <Leaderboard view={view} season />}
    <PlayBanner banner={moments.banner} />
    <BurstLayer bursts={moments.bursts} />
    <ToastLayer toasts={moments.toasts} placement="top" />
  </main>;
}
