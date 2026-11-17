import { compassBearing, compassTicks } from '../game/compass';
import './fps-heading.css';

const SPAN = 60, WIDTH = 240;

/** A strip of the horizon's bearings under the top bar, read at its centre mark. It replaces the fixed setting line. */
export default function FpsHeading({ yaw }: { yaw: number }) {
  const bearing = compassBearing(yaw);
  return <div className="fps-compass fps-heading" role="img" aria-label={`Heading ${bearing} degrees`} data-bearing={bearing}>
    <div className="fps-heading-strip" aria-hidden="true">
      {compassTicks(bearing, SPAN).map(tick => <span key={tick.bearing} data-point={tick.label || undefined}
        style={{ left: `${(tick.offset / SPAN / 2 + .5) * WIDTH}px`, opacity: Math.max(0, 1 - (Math.abs(tick.offset) / SPAN) ** 2) }}>{tick.label}</span>)}
    </div>
    <b aria-hidden="true">{String(bearing).padStart(3, '0')}°</b>
  </div>;
}
