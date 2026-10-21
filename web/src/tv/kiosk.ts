import { useEffect } from 'react';

export function useKiosk(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add('tv-kiosk');
    const onClick = () => {
      if (typeof root.requestFullscreen === 'function') {
        try {
          void Promise.resolve(root.requestFullscreen()).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener('click', onClick, { once: true });
    return () => {
      document.removeEventListener('click', onClick);
      root.classList.remove('tv-kiosk');
    };
  }, [enabled]);
}
