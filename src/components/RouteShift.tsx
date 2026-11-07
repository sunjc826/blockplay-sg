import { useEffect, useRef } from 'react';
import { shiftAfterHistory, useShift } from '../lib/route-transition';
import type { Route } from '../lib/routes';
import './route-shift.css';

/**
 * The line that crosses the top of the screen during a screen change
 * (lib/route-transition), and the entrance for the browser's Back and Forward.
 */
export default function RouteShift({ route }: { route: Route }) {
  const shift = useShift();
  const shown = useRef(route);
  useEffect(() => { shown.current = route; }, [route]);
  useEffect(() => {
    const onPopState = (event: Event) => {
      // Only accepted history changes arrive here. Preserve native swipe animations.
      if ((event as CustomEvent<{ nativeTransition: boolean }>).detail?.nativeTransition) return;
      shiftAfterHistory(shown.current);
    };
    window.addEventListener('blockplay:history', onPopState);
    return () => window.removeEventListener('blockplay:history', onPopState);
  }, []);
  if (!shift) return null;
  return <i key={shift.id} className={`route-shift-line is-${shift.direction}`} aria-hidden="true" />;
}
