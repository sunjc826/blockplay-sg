import type { FpsHud } from '../game/fps-engine';
import { armorState, healthBand } from '../game/vitals';

/**
 * One reading, shared by the range, the arena and the expedition: the band and
 * the armor state are attributes so the stylesheet colours them, and so the
 * browser smokes can assert the state the player is actually being shown.
 */
export default function FpsVitals({ hud }: { hud: FpsHud }) {
  return <div className="fps-vitals" data-health-band={healthBand(hud.health, hud.maxHealth)} data-armor-state={armorState(hud.armor)}>
    <span className="fps-vital is-health">HP <b>{Math.ceil(hud.health)}</b>{hud.maxHealth > 100 && <small> / {hud.maxHealth}</small>}</span>
    <span className="fps-vital is-armor">ARMOR <b>{Math.ceil(hud.armor)}</b></span>
    <span className="fps-capture-state" aria-label="Mouse capture status">{hud.pilotEnabled ? 'AI PILOT' : hud.locked ? 'MOUSE LOCKED' : 'TOUCH LOOK'}</span>
  </div>;
}
