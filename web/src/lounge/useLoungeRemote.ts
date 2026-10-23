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
      if (key === 'Escape' || key === 'Backspace' || key === 'BrowserBack' || key === 'GoBack') {
        if (event.repeat) { event.preventDefault(); return; }
        if (onBack()) event.preventDefault();
        return;
      }
      if (modal) {
        const targets = Array.from(modal.querySelectorAll<HTMLElement>('button, [data-lg-scroll]'));
        const index = Math.max(0, targets.indexOf(active!));
        if (key === 'Tab') { event.preventDefault(); targets[(index + (event.shiftKey ? targets.length - 1 : 1)) % targets.length]?.focus(); }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault();
          if (active?.hasAttribute('data-lg-scroll') && (key === 'ArrowDown' || active.scrollTop > 0)) active.scrollTop += key === 'ArrowDown' ? 180 : -180;
          else targets[key === 'ArrowDown' ? targets.length - 1 : 0]?.focus();
        }
        if (key === 'ArrowLeft' || key === 'ArrowRight') { event.preventDefault(); targets[key === 'ArrowLeft' ? 0 : targets.length - 1]?.focus(); }
        if (key === 'Enter' && active?.tagName === 'BUTTON') { event.preventDefault(); if (!event.repeat) active.click(); }
        return;
      }
      if (active?.hasAttribute('data-lg-scroll') && (key === 'ArrowDown' || key === 'ArrowUp') && (key === 'ArrowDown' || active.scrollTop > 0)) { event.preventDefault(); active.scrollTop += key === 'ArrowDown' ? 180 : -180; return; }
      if (key === 'Enter' && active?.matches('[data-lg-row]')) {
        event.preventDefault();
        if (!event.repeat) active.click();
        return;
      }
      if (!key?.startsWith('Arrow')) return;
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-lg-row]') ?? []).filter(el => !el.closest('details:not([open])') || el.tagName === 'SUMMARY');
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
      target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [root, onBack]);
}
