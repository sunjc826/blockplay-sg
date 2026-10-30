import type { ReactNode } from 'react';
import type { DeploymentView } from '../game/expedition-deployment';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
import './expedition-deployment.css';

export default function ExpeditionDeployment({ zone, deployment, onChoose, onZoom, onResetView, disabled = false, children }: {
  zone: WorldZoneId; deployment: DeploymentView | null; onChoose: (id: string) => void;
  onZoom?: (factor: number) => void; onResetView?: () => void; disabled?: boolean; children?: ReactNode;
}) {
  if (!deployment?.canChoose) return null;
  const selected = deployment.points.find(point => point.id === deployment.choice);
  return <section className="expedition-deployment" aria-label="Aerial deployment">
    <header><span>DEPLOYMENT / {getWorldZone(zone).name.toUpperCase()}</span><h2>Choose your landing zone</h2><p>Select a marker · Drag to pan · Zoom to inspect</p></header>
    <div className="deployment-pins" role="group" aria-label="Landing zones in the district">
      {deployment.points.map((point, i) => {
        const marker = deployment.markers?.find(m => m.id === point.id);
        if (!marker?.visible) return null;
        return <button key={point.id} className="deployment-pin" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          data-deployment-id={point.id} data-world-x={point.x} data-world-z={point.z}
          aria-label={`Deploy at ${point.name}`} aria-pressed={deployment.choice === point.id} disabled={disabled}
          onClick={() => onChoose(point.id)}><span className="deployment-pin-target">{i + 1}</span><span className="deployment-pin-name">{point.name}</span></button>;
      })}
    </div>
    <div className="deployment-view-controls" role="group" aria-label="Aerial camera">
      <button aria-label="Zoom in on district" disabled={disabled || (deployment.zoom ?? 1) >= 4} onClick={() => onZoom?.(1.4)}>+</button>
      <button aria-label="Zoom out of district" disabled={disabled || (deployment.zoom ?? 1) <= 1} onClick={() => onZoom?.(1 / 1.4)}>−</button>
      <button onClick={onResetView} disabled={disabled}>View all</button>
    </div>
    <footer className="deployment-dock">
      <div className="deployment-choice" role="status"><span>LANDING ZONE</span><strong>{selected?.name ?? 'Random entry point'}</strong><small>{selected ? 'Landing zone selected. Enter the district when ready.' : 'Pick a marker, or let deployment choose a clear entry.'}</small></div>
      <div className="deployment-actions"><button className="deployment-random" aria-pressed={deployment.choice === 'random'} disabled={disabled} onClick={() => onChoose('random')}>Random entry point</button>{children}</div>
    </footer>
  </section>;
}
