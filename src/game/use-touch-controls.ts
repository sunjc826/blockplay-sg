import { useEffect, useState } from 'react';
import { prefersTouchControls } from './touch-controls';

/**
 * Whether to draw the thumb layer over a scene.
 *
 * Two signals, because neither is enough alone. The media query describes the
 * device's primary pointer, which is what a phone should be judged on before it
 * has been touched; the round's own input mode is what a convertible laptop or a
 * tablet with a keyboard is actually being played with, and the engine flips
 * that back to `mouse` the moment a real mouse event arrives.
 */
export function useTouchControls(inputMode: 'mouse' | 'touch' = 'mouse') {
  const [coarse, setCoarse] = useState(prefersTouchControls);
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)');
    if (!query?.addEventListener) return;
    const update = () => setCoarse(prefersTouchControls());
    // A tablet gains a fine pointer the moment a mouse is paired with it.
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse || inputMode === 'touch';
}
