import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { basketballFixture, FIXTURE_STATES, type FixtureState } from './fixtures/basketball';
import { layoutFor, RoomDisplay, type DisplayLayout } from './RoomDisplay';
import { ROOM_VIEWS, type RoomViewId } from './RoomNav';
import type { RoomViewNext } from './sport';
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

/** Shared room display. `?layout=compact|medium|tv` overrides the responsive default for QA. */
export function RoomDisplayPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const [params, setParams] = useSearchParams();
  // Fixture mode is a development aid only and is labeled on screen.
  const fixtureParam = import.meta.env.DEV ? params.get('fixture') : null;
  const fixtureState = FIXTURE_STATES.includes(fixtureParam as FixtureState) ? fixtureParam as FixtureState : null;
  const room = useRoom(code, true, !fixtureState);
  const [fixture] = useState(() => fixtureState ? basketballFixture(fixtureState, Number(params.get('players')) || 4) : null);
  const view: RoomViewNext | undefined = fixture ?? room.view;
  const { w, h } = useViewport();
  const override = params.get('layout') as DisplayLayout | null;
  const layout = override && LAYOUTS.includes(override) ? override : layoutFor(w, h);
  const requested = params.get('view') as RoomViewId | null;
  const [current, setCurrent] = useState<RoomViewId>(requested && ROOM_VIEWS.includes(requested) ? requested : 'game');
  const root = useRef<HTMLDivElement>(null);
  const final = view?.room.phase === 'final';
  useEffect(() => { if (current === 'results' && view && !final) setCurrent('game'); }, [current, final, view]);

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
  return <div ref={root} onKeyDown={onKeyDown} className="rd-root">
    <RoomDisplay view={view} layout={layout} current={current} onView={change} joinUrl={joinUrl} stale={!fixture && room.stale} host={!!room.credentials.hostToken} fixture={!!fixture} />
  </div>;
}
