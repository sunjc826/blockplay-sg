import type { ReactNode } from 'react';
import type { DeploymentPoint, DeploymentView } from '../game/expedition-deployment';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
import './expedition-deployment.css';

/** Choose on press: parallax or a re-projection before release cannot eat a click.
 * Native keyboard activation still arrives through click with detail zero. */
export function DeploymentPins({ points, markers, choice, onChoose, disabled = false }: {
  points: readonly DeploymentPoint[]; markers: DeploymentView['markers']; choice: string | null;
  onChoose: (id: string) => void; disabled?: boolean;
}) {
  return <div className="deployment-pins" role="group" aria-label="Landing zones in the district">
    {points.map((point, i) => {
      const marker = markers?.find(m => m.id === point.id);
      if (!marker?.visible) return null;
      const available = point.available !== false;
      return <button key={point.id} className="deployment-pin" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
        data-deployment-id={point.id} data-world-x={point.x} data-world-y={point.y ?? 0} data-world-z={point.z}
        aria-label={`Deploy at ${point.name}${!available ? ` · ${point.reason}` : ''}`} aria-pressed={choice === point.id}
        title={available ? point.name : `${point.name} · ${point.reason}`} disabled={disabled || !available}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({preventScroll:true}); onChoose(point.id); }}
        onClick={event => { if (event.detail === 0) onChoose(point.id); }}>
        <span className="deployment-pin-target">{i + 1}</span><span className="deployment-pin-name">{point.name}{!available && <small>{point.reason}</small>}</span>
      </button>;
    })}
  </div>;
}

export function DeploymentCameraControls({ zoom = 1, onZoom, onResetView, disabled = false }: {
  zoom?: number; onZoom?: (factor: number) => void; onResetView?: () => void; disabled?: boolean;
}) {
  return <div className="deployment-view-controls" role="group" aria-label="Aerial camera">
    <button aria-label="Zoom in on district" disabled={disabled || zoom >= 4} onClick={() => onZoom?.(1.4)}>+</button>
    <button aria-label="Zoom out of district" disabled={disabled || zoom <= 1} onClick={() => onZoom?.(1 / 1.4)}>−</button>
    <button onClick={onResetView} disabled={disabled}>View all</button>
  </div>;
}

export default function ExpeditionDeployment({ zone, deployment, onChoose, onZoom, onResetView, disabled = false, children }: {
  zone: WorldZoneId; deployment: DeploymentView | null; onChoose: (id: string) => void;
  onZoom?: (factor: number) => void; onResetView?: () => void; disabled?: boolean; children?: ReactNode;
}) {
  if (!deployment?.canChoose) return null;
  const selected = deployment.points.find(point => point.id === deployment.choice);
  return <section className="expedition-deployment" aria-label="Aerial deployment">
    <header><span>DEPLOYMENT / {getWorldZone(zone).name.toUpperCase()}</span><h2>Choose your landing zone</h2><p>Allied zones + entry · Drag to pan</p></header>
    <DeploymentPins points={deployment.points} markers={deployment.markers} choice={deployment.choice} onChoose={onChoose} disabled={disabled} />
    <DeploymentCameraControls zoom={deployment.zoom} onZoom={onZoom} onResetView={onResetView} disabled={disabled} />
    <footer className="deployment-dock">
      <div className="deployment-choice" role="status"><span>LANDING ZONE</span><strong>{selected?.name ?? 'Random allied entry'}</strong><small>{selected ? 'Landing zone selected. Enter the district when ready.' : 'Grey beams are unavailable. Choose an allied zone or your district entry.'}</small></div>
      <div className="deployment-actions"><button className="deployment-random" aria-pressed={deployment.choice === 'random'} disabled={disabled || !deployment.points.some(p => p.available !== false)} onClick={() => onChoose('random')}>Random allied entry</button>{children}</div>
    </footer>
  </section>;
}
