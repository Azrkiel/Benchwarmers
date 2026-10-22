import { useEffect, useRef, type RefObject } from 'react';

const LEGACY: Record<number, string> = { 4: 'Escape', 13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };

/** The lounge has a vertical menu and numbered content rows. Data itself is not focusable. */
export function useLoungeRemote(root: RefObject<HTMLDivElement | null>, onBack: () => boolean) {
  const remembered = useRef<Record<string, string>>({});
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key && event.key !== 'Unidentified' ? event.key : LEGACY[event.keyCode];
      const active = document.activeElement as HTMLElement | null;
      const modal = root.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (key === 'Escape' || key === 'BrowserBack' || key === 'GoBack') {
        if (event.repeat) { event.preventDefault(); return; }
        if (onBack()) event.preventDefault();
        return;
      }
      if (modal) {
        const close = modal.querySelector<HTMLButtonElement>('button');
        if (key === 'Tab' || key?.startsWith('Arrow')) { event.preventDefault(); close?.focus(); }
        if (key === 'Enter') { event.preventDefault(); if (!event.repeat) close?.click(); }
        return;
      }
      if (key === 'Enter' && active?.matches('[data-lg-row]')) {
        event.preventDefault();
        if (!event.repeat) active.click();
        return;
      }
      if (!key?.startsWith('Arrow')) return;
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-lg-row]') ?? []);
      const row = active?.dataset.lgRow;
      const selectedMenu = controls.find((el) => el.dataset.lgRow === 'nav' && el.getAttribute('aria-current') === 'page');
      if (!row) { event.preventDefault(); selectedMenu?.focus(); return; }
      remembered.current[row] = active!.id;
      const inRow = controls.filter((el) => el.dataset.lgRow === row);
      const index = inRow.indexOf(active!);
      let target: HTMLElement | undefined;
      if (row === 'nav') {
        if (key === 'ArrowUp') target = inRow[Math.max(0, index - 1)];
        if (key === 'ArrowDown') target = inRow[Math.min(inRow.length - 1, index + 1)];
        if (key === 'ArrowRight') {
          const content = controls.filter((el) => el.dataset.lgRow !== 'nav');
          target = content.find((el) => el.id === remembered.current[content[0]?.dataset.lgRow ?? '0']) ?? content[0];
        }
      } else {
        if (key === 'ArrowLeft') target = index === 0 ? selectedMenu : inRow[index - 1];
        if (key === 'ArrowRight') target = inRow[Math.min(inRow.length - 1, index + 1)];
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          const nextRow = String(Number(row) + (key === 'ArrowUp' ? -1 : 1));
          const neighbors = controls.filter((el) => el.dataset.lgRow === nextRow);
          target = neighbors.find((el) => el.id === remembered.current[nextRow]) ?? neighbors[Math.min(index, neighbors.length - 1)];
        }
      }
      event.preventDefault();
      target?.focus();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [root, onBack]);
}
