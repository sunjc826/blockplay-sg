import { useEffect } from 'react';
import { revealAfterHistory, useWipe } from '../lib/route-transition';
import './route-wipe.css';

/**
 * The stripes of a screen change (lib/route-transition). Keyed by the wipe, so
 * the same stripes that closed over the old screen open onto the new one.
 */
export default function RouteWipe() {
  const wipe = useWipe();
  useEffect(() => {
    window.addEventListener('popstate', revealAfterHistory);
    return () => window.removeEventListener('popstate', revealAfterHistory);
  }, []);
  if (!wipe) return null;
  return <div key={wipe.id} className={`route-wipe is-${wipe.phase} is-${wipe.direction}`} aria-hidden="true">
    <i className="route-wipe-stripe" />
    <i className="route-wipe-stripe" />
    <i className="route-wipe-stripe route-wipe-panel">
      <span className="route-wipe-label">
        <span className="route-wipe-mark"><span /><span /><span /></span>
        <small>{wipe.kicker}</small>
        <strong>{wipe.label}</strong>
      </span>
    </i>
  </div>;
}
