import type { FpsHud } from '../game/fps-engine';
import { fillFraction } from '../game/hud-motion';
import { armorState, healthBand } from '../game/vitals';

/**
 * One reading, shared by the range, the arena and the expedition: the band and
 * the armor state are attributes so the stylesheet colours them, and so the
 * browser smokes can assert the state the player is actually being shown.
 *
 * The digits are the engine's own. What moves is the bar under them, in two
 * layers: the fill tracks health at once, and the ghost behind it trails by a
 * beat, so a burst leaves a red sliver showing exactly what it cost before it
 * closes up. Regeneration is gradual in the engine, so refilling needs no help
 * here — the same fill simply grows, and the ghost comes up behind it.
 */
export default function FpsVitals({ hud }: { hud: FpsHud }) {
  const health = fillFraction(hud.health, hud.maxHealth);
  return <div className="fps-vitals" data-health-band={healthBand(hud.health, hud.maxHealth)} data-armor-state={armorState(hud.armor)}>
    <span className="fps-vital is-health" data-hurt={hud.hurt || undefined}>
      HP <b>{Math.ceil(hud.health)}</b>{hud.maxHealth > 100 && <small> / {hud.maxHealth}</small>}
      <i className="fps-vital-ghost" style={{ transform: `scaleX(${health})` }} />
      <i className="fps-vital-fill" style={{ transform: `scaleX(${health})` }} />
    </span>
    <span className="fps-vital is-armor">ARMOR <b>{Math.ceil(hud.armor)}</b></span>
    <span className="fps-capture-state" aria-label="Mouse capture status">{hud.pilotEnabled ? 'AI PILOT' : hud.locked ? 'MOUSE LOCKED' : 'TOUCH LOOK'}</span>
  </div>;
}
