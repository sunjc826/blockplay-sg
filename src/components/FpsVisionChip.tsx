import type { FpsHud } from '../game/fps-engine';
import { PALETTE_LABELS } from '../game/vision-devices';
import './fps-vision.css';

/** What the device is doing, in a few characters: warming, recalibrating, its palette, or on. */
export function visionStatus(vision: NonNullable<FpsHud['vision']>, short = false) {
  if (!vision.on) return 'OFF';
  if (vision.calibrating) return short ? 'NUC' : 'NUC · CALIBRATING';
  if (vision.warm < 1) return `${short ? '' : vision.kind === 'nvg' ? 'TUBE ' : 'CORE '}${Math.round(vision.warm * 100)}%`;
  return vision.palette ? PALETTE_LABELS[vision.palette] : 'ON';
}
/**
 * The worn night-vision or thermal device: what it is, and what it is doing.
 * On a touchscreen the eye button carries this instead (TouchControls), since
 * a phone's top corners are already full.
 */
export default function FpsVisionChip({ hud, touch }: { hud: FpsHud; touch: boolean }) {
  const vision = hud.vision;
  if (!vision || touch) return null;
  const kind = vision.kind === 'nvg' ? `NVG GEN ${vision.generation}` : `THERMAL T${vision.generation}`;
  const state = visionStatus(vision);
  const keys = vision.on && vision.palettes > 1 ? 'H · J' : 'H';
  return <div className="fps-vision-chip" data-vision={vision.kind} data-on={vision.on || undefined} role="status" aria-label={`${vision.name}, ${vision.on ? 'on' : 'off'}`}>
    <i aria-hidden="true" /><span>{kind}</span><b>{state}</b>{keys && <kbd>{keys}</kbd>}
  </div>;
}
