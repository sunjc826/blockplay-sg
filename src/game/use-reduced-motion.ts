import { useEffect, useState } from 'react';

/**
 * The stylesheets already drop their transitions and keyframes under
 * `prefers-reduced-motion`. This is for the motion CSS cannot reach: the
 * magazine's climb through a reload is computed, so it has to be asked for.
 */
export function useReducedMotion() {
  // Read before paint, and survive a render with no window at all: the other
  // HUD pieces are exercised through `renderToStaticMarkup` in the unit tests.
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query?.addEventListener) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}
