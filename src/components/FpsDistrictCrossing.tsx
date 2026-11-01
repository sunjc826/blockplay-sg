import type { FpsHud } from '../game/fps-engine';
import './fps-district-crossing.css';

export default function FpsDistrictCrossing({ name, phase }: { name: string; phase: FpsHud['phase'] }) {
  if (phase !== 'loading' && phase !== 'playing') return null;
  return <div className={`fps-district-crossing${phase === 'playing' ? ' has-arrived' : ''}`} role="status" aria-live="polite">
    <span>SENTOSA BOARDWALK</span><strong>{phase === 'loading' ? `Crossing to ${name}…` : name}</strong>
  </div>;
}
