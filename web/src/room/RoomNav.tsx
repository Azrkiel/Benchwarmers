import { useRef, type KeyboardEvent } from 'react';

export const ROOM_VIEWS = ['game', 'standings', 'lineups', 'results'] as const;
export type RoomViewId = (typeof ROOM_VIEWS)[number];
const LABEL: Record<RoomViewId, string> = { game: 'Game', standings: 'Standings', lineups: 'Lineups', results: 'Results' };

/**
 * Top-level views for the shared display. Arrow keys move between enabled tabs
 * (remote friendly); Enter or Space activates. Results unlocks at final.
 */
export function RoomNav({ current, onChange, final, controls }: { current: RoomViewId; onChange: (view: RoomViewId) => void; final: boolean; controls: string }) {
  const refs = useRef<Partial<Record<RoomViewId, HTMLButtonElement | null>>>({});
  const enabled = ROOM_VIEWS.filter((view) => view !== 'results' || final);
  function onKeyDown(event: KeyboardEvent, view: RoomViewId) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = enabled.indexOf(view);
    const next = enabled[(index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]!;
    refs.current[next]?.focus();
  }
  return <nav className="rd-nav" aria-label="Room views"><div role="tablist" aria-label="Room views">
    {ROOM_VIEWS.map((view) => {
      const disabled = view === 'results' && !final;
      return <button key={view} ref={(node) => { refs.current[view] = node; }} role="tab" id={`rd-tab-${view}`} aria-selected={current === view} aria-controls={controls}
        tabIndex={current === view ? 0 : -1} disabled={disabled} title={disabled ? 'Results open at the final buzzer' : undefined}
        className={`rd-tab${current === view ? ' is-active' : ''}`} onClick={() => onChange(view)} onKeyDown={(event) => onKeyDown(event, view)}>{LABEL[view]}</button>;
    })}
  </div></nav>;
}
