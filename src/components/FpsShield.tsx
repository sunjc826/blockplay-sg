import type { FpsHud } from '../game/fps-engine';
import './fps-shield.css';

/** Seconds over which the lapsing shield fades, matching the halo others see on the figure. */
const FADE = .6;

/**
 * The player's own spawn shield, which they cannot see on their own figure:
 * a blue glow round the screen edge and a countdown under the crosshair. It
 * fades over its last moments, and says that firing ends it.
 */
export default function FpsShield({ hud }: { hud: FpsHud }) {
  const left = hud.arenaSelf?.alive ? hud.arenaSelf.shield ?? 0 : 0;
  if (!(left > 0)) return null;
  return <div className="fps-shield" style={{ opacity: Math.min(1, left / FADE) }}>
    <span className="fps-shield-label" role="status">SPAWN SHIELD <b>{left.toFixed(1)}s</b><small>Firing ends it</small></span>
  </div>;
}
