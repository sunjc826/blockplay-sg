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
    const onPopState = (event: PopStateEvent) => {
      // Mobile browsers animate their own swipe back; a second animation would fight it.
      if ((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
      shiftAfterHistory(shown.current);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  if (!shift) return null;
  return <i key={shift.id} className={`route-shift-line is-${shift.direction}`} aria-hidden="true" />;
}
