import { useEffect, useRef } from 'react';
import type { PlayerRespawnView } from '../game/player-respawn';
import './expedition-respawn.css';

export default function ExpeditionRespawn({ view, seconds, onChoose, onAutomatic, onMenu }: {
  view: PlayerRespawnView; seconds: number;
  onChoose: (id: string) => void; onAutomatic: (checked: boolean) => void; onMenu: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const selected = view.zones.find(zone => zone.id === view.selected);
  const ready = seconds <= 0;
  return <div className="expedition-respawn-picker" role="dialog" aria-modal="true" aria-labelledby="respawn-title" onKeyDown={event => { if (event.key === 'Escape') onMenu(); }}>
    <section className="respawn-card">
      <header><span>OPERATOR DOWN</span><h2 id="respawn-title" tabIndex={-1} ref={heading}>Choose where to respawn</h2>
        <p role="status">{ready ? 'Ready to redeploy' : `Respawn ready in ${Math.ceil(seconds)}s`}</p></header>
      <div className="respawn-zones" role="group" aria-label="Allied control zones">
        {view.zones.map(zone => <button key={zone.id} type="button" disabled={!zone.available}
          aria-pressed={view.selected === zone.id} onClick={() => onChoose(zone.id)}>
          <span className="respawn-zone-icon" aria-hidden="true">◇</span>
          <span><strong>{zone.name}</strong><small>{zone.available ? `Allied control · X ${Math.round(zone.x)}, Z ${Math.round(zone.z)}` : zone.reason}</small></span>
          <span className="respawn-zone-action">{view.selected === zone.id ? 'SELECTED' : zone.available ? ready ? 'RESPAWN' : 'SELECT' : 'UNAVAILABLE'}</span>
        </button>)}
      </div>
      {!view.zones.some(zone => zone.available) && <p className="respawn-empty" role="status">No allied control zone is available. Waiting for an allied zone to become operational and clear.</p>}
      <label className="respawn-automatic"><input type="checkbox" checked={view.automatic} onChange={event => onAutomatic(event.target.checked)} />
        <span>Auto-respawn<small>Automatically choose an available allied zone when the timer ends.</small></span>
      </label>
      <p className="respawn-selection" role="status">{selected ? `${selected.name} selected. ${ready ? 'Deploying…' : 'You will respawn here when the timer ends.'}` : view.automatic ? 'An available allied zone will be chosen for you.' : 'Select an allied zone to return to the fight.'}</p>
      <button className="respawn-menu" type="button" onClick={onMenu}>Menu</button>
    </section>
  </div>;
}
