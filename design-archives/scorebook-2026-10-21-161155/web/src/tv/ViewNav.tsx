import { useEffect, useRef, useState, type RefObject } from 'react';
import type { TvMode } from './modes';

export type ViewChoice = { mode: TvMode; label: string };

const LEGACY_KEYS: Record<number, string> = {
  4: 'Escape', 13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
};

export function ViewNav({ views, mode, manual, onSelect, onClose, contentRef }: {
  views: ViewChoice[];
  mode: TvMode;
  manual: boolean;
  onSelect: (mode: TvMode) => void;
  onClose: () => void;
  contentRef?: RefObject<HTMLElement | null>;
}) {
  const navRef = useRef<HTMLElement>(null);
  const lastActionRef = useRef<string | undefined>(undefined);
  const [tabStop, setTabStop] = useState<TvMode>(mode);
  const availableStop = views.some((v) => v.mode === tabStop) ? tabStop : views[0]?.mode;

  useEffect(() => {
    if (document.activeElement === document.body) {
      const buttons = Array.from(navRef.current?.querySelectorAll('button') ?? []);
      (buttons.find((b) => b.getAttribute('aria-pressed') === 'true') ?? buttons[0])?.focus();
    }
  }, [views, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const key = e.key && e.key !== 'Unidentified' ? e.key : LEGACY_KEYS[e.keyCode];
      const buttons = Array.from(navRef.current?.querySelectorAll('button') ?? []);
      const actions = Array.from(contentRef?.current?.querySelectorAll<HTMLButtonElement>('button[data-tv-action]') ?? []);
      const focused = buttons.findIndex((b) => b === document.activeElement);
      const actionIndex = actions.findIndex((b) => b === document.activeElement);
      if (actionIndex >= 0) lastActionRef.current = actions[actionIndex]?.id;
      const menuTarget = buttons[views.findIndex((v) => v.mode === availableStop)] ?? buttons[0];
      if (key === 'Escape' || key === 'BrowserBack' || key === 'GoBack') {
        if (manual) {
          e.preventDefault();
          if (e.repeat) return;
          onClose();
          buttons[0]?.focus();
        } else if (actionIndex >= 0) {
          e.preventDefault();
          if (!e.repeat) menuTarget?.focus();
        }
        return;
      }
      if (key?.startsWith('Arrow')) {
        e.preventDefault();
        if (actionIndex >= 0) {
          if (key === 'ArrowUp') menuTarget?.focus();
          else if (key === 'ArrowLeft') actions[Math.max(0, actionIndex - 1)]?.focus();
          else if (key === 'ArrowRight') actions[Math.min(actions.length - 1, actionIndex + 1)]?.focus();
          return;
        }
        if (key === 'ArrowDown' && actions.length > 0 && focused >= 0) {
          (actions.find((b) => b.id === lastActionRef.current) ?? actions[0])?.focus();
          return;
        }
        const selected = Math.max(0, views.findIndex((v) => v.mode === mode));
        const index = focused < 0 ? selected
          : key === 'ArrowLeft' ? Math.max(0, focused - 1)
          : key === 'ArrowRight' ? Math.min(buttons.length - 1, focused + 1)
          : focused;
        buttons[index]?.focus();
      } else if (key === 'Enter' && (focused >= 0 || actionIndex >= 0)) {
        e.preventDefault();
        if (e.repeat) return;
        (actionIndex >= 0 ? actions[actionIndex] : buttons[focused])?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [views, mode, manual, onSelect, onClose, contentRef, availableStop]);

  return (
    <nav ref={navRef} className="tv-nav" aria-label="TV views">
      {views.map((view) => (
        <button key={view.mode} type="button" aria-pressed={mode === view.mode}
          tabIndex={availableStop === view.mode ? 0 : -1} onFocus={() => setTabStop(view.mode)} onClick={() => onSelect(view.mode)}>
          {view.label}<span className="tv-nav-marker" aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
