import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { storageWarning } from './api';
import { ScoreTick, ToastLayer } from '../fx/fx';
import { FinalPodium, FootballField, HostControls, Leaderboard, PlayFeed, points, Question, RoomRules, RoomScore } from './components';
import { BasketballCourt } from './BasketballCourt';
import { ordinal, useRoomMoments } from './moments';
import { JoinRoom } from './RoomLanding';
import { Lineup } from './Lineup';
import { RoomAssistant } from './RoomAssistant';
import { RoomNav, type RoomViewId } from './RoomNav';
import { usePickReceipt } from './PredictionReceipt';
import { roomSport, sourceLabel } from './sport';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';

const PHONE_LABELS = { lineups: 'My lineup' } as const;
const PHONE_VIEWS = ['game', 'lineups', 'standings', 'results'] as const;

/** Lobby work is the lineup; live play is the game; after the final, the results. */
export function defaultPhoneView(phase: string | undefined, requested: string | null): RoomViewId {
  if (requested === 'season' || requested === 'standings') return 'standings';
  if (requested === 'lineup' || requested === 'lineups') return 'lineups';
  if (requested === 'results' && phase === 'final') return 'results';
  return phase === 'lobby' ? 'lineups' : phase === 'final' ? 'results' : 'game';
}

export function RoomPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const [params, setParams] = useSearchParams();
  const { view, credentials, error, stale, busy, mutate, send, refresh, acceptJoin, retry, updatedAt } = useRoom(code);
  const [copyStatus, setCopyStatus] = useState('');
  const joinName = (useLocation().state as { joinName?: string } | null)?.joinName ?? '';
  const moments = useRoomMoments(view, { personal: true });
  const [tab, setTab] = useState<RoomViewId | null>(null);
  const phase = view?.room.phase;
  // Follow the game phase (lobby -> game -> results) until the participant picks a view.
  const [phaseSeen, setPhaseSeen] = useState(phase);
  useEffect(() => { if (phase !== phaseSeen) { if (phaseSeen !== undefined) setTab(null); setPhaseSeen(phase); } }, [phase, phaseSeen]);
  const current = tab ?? defaultPhoneView(phase, params.get('view'));
  const { receipt, submit } = usePickReceipt({
    send: (body) => send('picks', { ...body, participantToken: credentials.participantToken }),
    refresh,
  });
  function choose(next: RoomViewId) {
    setTab(next);
    if (params.has('view')) { const copy = new URLSearchParams(params); copy.delete('view'); setParams(copy, { replace: true }); }
  }
  if (!view) return <main className="rm rm-loading"><BrandLockup size={32} /><h1>{error ? 'Room unavailable' : 'Opening room…'}</h1>{error ? <><p role="alert">Could not open room {code}. Check the code or try again.</p><button onClick={retry}>Retry</button><Link to={`/?join=${encodeURIComponent(code)}`}>Edit party code</Link></> : <p role="status">Connecting to {code}</p>}<Link to="/">Home</Link></main>;
  const joined = !!credentials.participantToken && !!view.me;
  const me = joined ? view.standings.find((row) => row.participantId === view.me?.participantId) : undefined;
  const livePhase = view.room.phase;
  const final = livePhase === 'final';
  const lineup = joined && <Lineup view={view} busy={busy} onSave={async (selection) => (await mutate('lineup', { ...selection, participantToken: credentials.participantToken }))?.view} onAuto={async (style) => (await mutate('auto-lineup', { participantToken: credentials.participantToken, style }))?.view} />;
  const host = credentials.hostToken && <details className="rm-phone-host"><summary>Host controls</summary><HostControls view={view} busy={busy} onAction={(action, speed) => { void mutate('host', { hostToken: credentials.hostToken, action, speed }); }} /></details>;
  const last = me?.lastPickScore;
  const label = (questionId: string, optionId: string) => view.question?.id === questionId ? view.question.options.find((option) => option.id === optionId)?.label ?? optionId : optionId;
  const court = roomSport(view) === 'basketball' ? <BasketballCourt view={view} /> : <FootballField view={view} />;
  return <main className={`rm rm-phone is-${livePhase}`}>
    <header className="rm-header"><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={28} /></Link><a className="rm-tv-link" href={`/room/${encodeURIComponent(code)}/display`}>Shared screen →</a></header>
    <div className="rm-room-heading"><h1>{view.room.name}</h1><div className="rm-room-code"><span>Room code · {view.room.participantCount} {view.room.participantCount === 1 ? 'player' : 'players'}</span><button aria-label={`Copy room code ${code}`} onClick={async () => { try { await navigator.clipboard.writeText(code); setCopyStatus('Code copied'); } catch { setCopyStatus(`Share code ${code}`); } }}>{code} <span>Copy</span></button><small role="status">{copyStatus}</small></div></div>
    <p className="rm-source-line">{sourceLabel(view)}</p>
    <div className="rm-connection" aria-live="polite">{stale && <span>Reconnecting · Showing last update{updatedAt ? ` at ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>}</div>
    {error && <p className="rm-error rm-banner" role="alert">{error} <button onClick={retry}>Retry</button></p>}
    {storageWarning() && <p className="rm-banner">{storageWarning()}</p>}
    <RoomScore view={view} />
    {!joined ? <>
      {final && <FinalPodium view={view} />}
      <JoinRoom code={code} seasonId={view.season.id} phase={livePhase} initialName={joinName} onJoin={acceptJoin} />
      <Leaderboard view={view} />
      <RoomRules view={view} />
    </> : <>
      <section className="rm-personal-score" aria-label="Your score">
        <div><span>You · {view.me?.name}{me ? ` · ${ordinal(me.rank)}` : ''}</span><strong><ScoreTick value={points(me?.total ?? 0)} /></strong><span>Total pts</span></div>
        <div><span>Lineup pts</span><b>{points(me?.fantasyPoints ?? 0)}</b></div><div><span>Pick pts</span><b>{points(me?.predictionPoints ?? 0)}</b></div><div><span>Streak</span><b>{me?.streak ?? 0}</b></div>
      </section>
      <RoomNav current={current} onChange={choose} final={final} controls="rm-view" labels={PHONE_LABELS} views={PHONE_VIEWS} className="rm-phone-nav" idPrefix="rm-tab" />
      <div id="rm-view" role="tabpanel" aria-labelledby={`rm-tab-${current}`} className="rm-view">
        {current === 'game' && <>
          {last && <div className={`rm-pick-recap${last.correct ? '' : ' is-miss'}`}>{last.correct ? `Correct · +${points(last.points)} pts` : 'Incorrect · +0 pts'}{last.correct && last.bonuses.length > 0 && <details><summary>Bonus details</summary><span>{last.bonuses.map((bonus) => bonus.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())).join(' · ')}</span></details>}</div>}
          {final ? <FinalPodium view={view} /> : <Question view={view} busy={busy} receipt={receipt} onPick={(questionId, optionId) => submit(questionId, optionId, label(questionId, optionId)).then(() => undefined)} onRetry={(previous) => { void submit(previous.questionId, previous.optionId, previous.label, previous); }} />}
          <details className="rm-game-details"><summary>Game details</summary>{court}{livePhase !== 'lobby' && <PlayFeed view={view} />}</details>
          {host}
          <RoomRules view={view} />
        </>}
        {current === 'lineups' && <>{lineup}{livePhase === 'lobby' && host}</>}
        {current === 'standings' && <><Leaderboard view={view} />{(final || view.season.standings.length > 0) && <Leaderboard view={view} season />}</>}
        {current === 'results' && final && <><FinalPodium view={view} /><details className="rm-pick-review"><summary>Previous pick</summary><Question view={view} /></details><Leaderboard view={view} season /></>}
      </div>
      <RoomAssistant busy={busy} onNavigate={(target) => choose(target === 'season' || target === 'standings' ? 'standings' : target === 'lineups' ? 'lineups' : 'game')} onCommand={async (text) => {
        const result = await mutate('assistant', { text, participantToken: credentials.participantToken, hostToken: credentials.hostToken }, true);
        return result?.reply === undefined ? undefined : { reply: result.reply, accepted: result.accepted, navigate: result.navigate };
      }} />
    </>}
    <ToastLayer toasts={moments.toasts.slice(-1)} placement="top" />
  </main>;
}
