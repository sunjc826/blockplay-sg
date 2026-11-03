import { useEffect, useRef } from 'react';
import type { PlayerRespawnView } from '../game/player-respawn';
import { DeploymentCameraControls, DeploymentPins } from './ExpeditionDeployment';
import './expedition-respawn.css';

export default function ExpeditionRespawn({ view, seconds, onChoose, onAutomatic, onMenu, onLoadout, onZoom, onResetView }: {
  view: PlayerRespawnView; seconds: number;
  onChoose: (id: string) => void; onAutomatic: (checked: boolean) => void; onMenu: () => void; onLoadout?: () => void;
  onZoom?: (factor: number) => void; onResetView?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const selected = view.zones.find(zone => zone.id === view.selected);
  const ready = seconds <= 0;
  return <section className="expedition-deployment expedition-respawn-picker" role="dialog" aria-modal="true" aria-labelledby="respawn-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onMenu(); } }}>
    <header><span>OPERATOR DOWN / REDEPLOYMENT</span><h2 id="respawn-title" tabIndex={-1} ref={heading}>Choose where to respawn</h2>
      <p>Allied zones + default spawn · Drag to pan</p></header>
    <DeploymentPins points={view.zones.map(zone => ({...zone, yaw:0, pitch:0}))} markers={view.markers} choice={view.selected} onChoose={onChoose} />
    <DeploymentCameraControls zoom={view.zoom} onZoom={onZoom} onResetView={onResetView} />
    <footer className="deployment-dock respawn-card">
      <div className="deployment-choice"><span>{ready ? 'READY TO REDEPLOY' : `RESPAWN IN ${Math.ceil(seconds)}s`}</span><strong>{selected?.name ?? 'Choose a spawn zone'}</strong>
        <small role="status">{!view.zones.some(zone => zone.available) ? 'Waiting for a clear default spawn or an operational allied zone.' : selected ? ready ? 'Deploying…' : 'Selected. You will respawn here when the timer ends.' : view.automatic ? 'An allied zone will be chosen, with your default spawn as fallback.' : 'Select an allied beam or your default spawn to return to the fight.'}</small></div>
      <div className="deployment-actions">
        <label className="respawn-automatic"><input type="checkbox" checked={view.automatic} onChange={event => onAutomatic(event.target.checked)} />Auto-respawn</label>
        {onLoadout && <button type="button" className="respawn-loadout-trigger" onClick={onLoadout}>Respawn loadout</button>}
        <button className="respawn-menu" type="button" onClick={onMenu}>Menu</button>
      </div>
    </footer>
  </section>;
}
