import { useEffect } from 'react';

/** Opt a page into the scorebook redesign's root font and palette (see styles.css). */
export function useScorebookTheme(): void {
  useEffect(() => {
    document.documentElement.classList.add('theme-scorebook');
    return () => document.documentElement.classList.remove('theme-scorebook');
  }, []);
}
