import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { sharedAudio } from '../fx/audio';
import { AudioControls } from '../fx/AudioControls';
import { BasketballCelebration } from '../fx/BasketballCelebration';
import { prefersReducedMotion, useCelebrations } from '../fx/celebrations';
import { usePlaybackLease } from '../fx/playbackLease';
import { useSpeechOutput } from '../device/useSpeechOutput';
import { DisplayVoice } from './DisplayVoice';
import { useRoomAnnouncements } from './useRoomAnnouncements';
import { useCallNotices } from './Calls';
import type { PointsSnapshotFields } from './points/types';
import { basketballFixture, FIXTURE_STATES, type FixtureState } from './fixtures/basketball';
import { layoutFor, RoomDisplay, type DisplayLayout } from './RoomDisplay';
import { ROOM_VIEWS, type RoomViewId } from './RoomNav';
import { roomSport, type RoomViewNext } from './sport';
import { useRoom } from './useRoom';
import './room.css';
import './broadcast.css';
import './display.css';

const LAYOUTS: DisplayLayout[] = ['compact', 'medium', 'tv'];

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function questionStatus(view: RoomViewNext): string {
  const q = view.question!;
  return q.status === 'open' ? 'Call open · answer on your phone' : q.status === 'locked' ? 'Call locked' : 'Call resolved';
}

/** Shared room display. `?layout=compact|medium|tv` overrides the responsive default for QA. */
export function RoomDisplayPage() {
  return <RoomDisplayScreen code={(useParams().code ?? '').toUpperCase()} />;
}

export type ViewRequest = { view: RoomViewId; seq: number };

/**
 * The room display with all of its behavior (polling, celebrations, captions, sound
 * lease). The smart-display simulator embeds it at a fixed preset size and supplies its
 * own talk bar, so `embedded` hides the footer mic and fills the parent instead of the window.
 */
export function RoomDisplayScreen({ code, layout: fixedLayout, embedded = false, reply: externalReply, viewRequest }: { code: string; layout?: DisplayLayout; embedded?: boolean; reply?: string; viewRequest?: ViewRequest }) {
  const [params, setParams] = useSearchParams();
  // Fixture mode is a development aid only and is labeled on screen.
  const fixtureParam = import.meta.env.DEV ? params.get('fixture') : null;
  const fixtureState = FIXTURE_STATES.includes(fixtureParam as FixtureState) ? fixtureParam as FixtureState : null;
  const room = useRoom(code, true, !fixtureState);
  const [fixture, setFixture] = useState(() => fixtureState ? basketballFixture(fixtureState, Number(params.get('players')) || 4) : null);
  // QA aid: ?fixture=open&basket=1 resolves the fixture call with a Harbor three after 1.5 s.
  useEffect(() => {
    if (!fixtureState || params.get('basket') !== '1') return;
    const timer = setTimeout(() => setFixture(basketballFixture('resolved', Number(params.get('players')) || 4)), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const view: RoomViewNext | undefined = fixture ?? room.view;
  const { w, h } = useViewport();
  const override = params.get('layout') as DisplayLayout | null;
  const layout = fixedLayout ?? (override && LAYOUTS.includes(override) ? override : layoutFor(w, h));
  const requested = params.get('view') as RoomViewId | null;
  const [current, setCurrent] = useState<RoomViewId>(requested && (ROOM_VIEWS as readonly string[]).includes(requested) ? requested : 'game');
  const root = useRef<HTMLDivElement>(null);
  const final = view?.room.phase === 'final';
  const [reducedMotion] = useState(prefersReducedMotion);
  const audio = sharedAudio();
  const { celebration, coalesced, corrected } = useCelebrations(view && { sport: roomSport(view), home: view.game.home, away: view.game.away, plays: view.game.recentPlays }, { reducedMotion });
  const [correction, setCorrection] = useState(false);
  useEffect(() => { if (!corrected) return; setCorrection(true); const timer = setTimeout(() => setCorrection(false), 4000); return () => clearTimeout(timer); }, [corrected]);
  useEffect(() => () => audio.stop(), [audio]);
  const { lease, takeOver, label: screenName } = usePlaybackLease(fixture ? '' : code, audio, { hostToken: room.credentials.hostToken });
  const speech = useSpeechOutput({ storageKey: 'bw.display.voiceMuted' });
  useEffect(() => { audio.setSpeaking(speech.speaking); }, [audio, speech.speaking]);
  // Only the playback leader with sound enabled speaks; every screen shows the caption.
  const { caption } = useRoomAnnouncements(view, (text) => { if (audio.canPlay()) speech.speak(text); });
  const callNotice = useCallNotices((view as (RoomViewNext & PointsSnapshotFields) | undefined)?.calls, view?.standings);
  const [reply, setReply] = useState('');
  useEffect(() => { if (!reply) return; const timer = setTimeout(() => setReply(''), 8000); return () => clearTimeout(timer); }, [reply]);
  useEffect(() => { if (current === 'results' && view && !final) setCurrent('game'); }, [current, final, view]);
  useEffect(() => { if (viewRequest) setCurrent(viewRequest.view); }, [viewRequest?.seq]);

  function change(next: RoomViewId) {
    setCurrent(next);
    const copy = new URLSearchParams(params); if (next === 'game') copy.delete('view'); else copy.set('view', next);
    setParams(copy, { replace: true });
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' && event.key !== 'Backspace' && event.key !== 'BrowserBack') return;
    if ((event.target as HTMLElement).matches('input,textarea')) return;
    event.preventDefault();
    change('game');
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('#rd-tab-game')?.focus());
  }

  if (!view) return <main className="rd rd-loading"><BrandLockup size={36} /><h1>{room.error ? 'Room unavailable' : 'Opening display…'}</h1>{room.error ? <><p role="alert">Could not open room {code}.</p><button onClick={room.retry}>Retry</button><Link to={`/?join=${encodeURIComponent(code)}`}>Edit party code</Link></> : <p role="status">Connecting to {code}</p>}</main>;
  const joinUrl = `${window.location.origin}/room/${encodeURIComponent(view.room.code)}`;
  return <div ref={root} onKeyDown={onKeyDown} className={`rd-root${embedded ? ' is-embedded' : ''}`}>
    <RoomDisplay view={view} layout={layout} current={current} onView={change} joinUrl={joinUrl} stale={!fixture && room.stale} host={!!room.credentials.hostToken} fixture={!!fixture}
      caption={externalReply || reply || callNotice || caption}
      voice={<>{correction && <span className="rd-correction" role="status">Score corrected</span>}
        {!fixture && !embedded && <DisplayVoice audio={audio} speak={speech.speak} cancelSpeech={speech.cancel} onReply={setReply} onCommand={async (text) => {
          const result = await room.mutate('assistant', { text, hostToken: room.credentials.hostToken }, true);
          if (result?.navigate === 'season' || result?.navigate === 'standings') change(result.navigate === 'season' && final ? 'results' : 'standings');
          return result?.reply === undefined ? undefined : { reply: result.reply, accepted: result.accepted, navigate: result.navigate };
        }} />}
        <AudioControls audio={audio} lease={lease} onTakeOver={takeOver} name={screenName} /></>}
      overlay={<BasketballCelebration celebration={celebration} coalesced={coalesced} reducedMotion={reducedMotion} audio={audio} status={view.question ? questionStatus(view) : undefined} />} />
  </div>;
}
