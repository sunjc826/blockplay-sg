import { useEffect, useState } from 'react';

/**
 * Whether a media query matches, for layout CSS cannot express on its own: a
 * HUD piece that has to sit somewhere else in the tree, not only somewhere
 * else on screen. False with no window, so `renderToStaticMarkup` tests work.
 */
export function useMediaQuery(media: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(media).matches);
  useEffect(() => {
    const query = window.matchMedia?.(media);
    if (!query?.addEventListener) return;
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [media]);
  return matches;
}

/** A phone on its side: the height the thumb layer's landscape rules already key on. */
export const SHORT_SCREEN = '(max-height: 560px)';
