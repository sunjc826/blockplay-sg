import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { FACILITY_KINDS, facilityActionFor, facilityActionCost, facilityStatus } from '../game/facilities';
import { PLAYER_FACTION } from '../game/arena-factions';
import './fps-facilities.css';

export default function FpsFacilityHud({ hud, engine, touch }: { hud: FpsHud; engine: FpsEngine | null; touch: boolean }) {
  const site = hud.facility;
  if (!site || hud.phase !== 'playing' || hud.lootCard) return null;
  const action = facilityActionFor(site, PLAYER_FACTION), cost = action ? facilityActionCost(site, action) : 0;
  const supplies = hud.arena?.facilities?.supplies[PLAYER_FACTION] ?? 0;
  const canWork = !!hud.facilityPrompt && !!action && !site.action && supplies >= cost;
  const owner = site.owner === PLAYER_FACTION ? 'ALLIED' : site.owner ? 'BLACK KITE' : 'UNBUILT';
  return <aside className="fps-facility-card" data-facility={site.id} data-owner={site.owner ?? 'neutral'} data-health={site.health} data-progress={site.action?.progress ?? 0} aria-label={`${site.name} facility`}>
    <header><span>{owner} · {FACILITY_KINDS[site.kind].label}</span><b>{Math.floor(supplies)} SUPPLY</b></header>
    <strong>{site.name}</strong>
    <div className="fps-facility-condition"><span>{facilityStatus(site)}</span><b>{Math.ceil(site.health)} / {site.maxHealth} HP</b></div>
    <progress aria-label={site.action ? 'Facility work progress' : 'Facility equipment health'} value={site.action?.progress ?? site.health / site.maxHealth} max={1} />
    <p>{site.action ? site.action.stalled ? 'Enemy presence matches or outweighs your side. Bring support.' : 'Work in progress. Stay within 4m; allies can help secure the site.'
      : site.suppressed ? 'Clear enemies from the deployment area to restore operations.'
      : site.kind === 'command' ? `Infantry waves · ${Math.ceil(site.deployIn)}s · 3 supply per soldier`
      : site.kind === 'garage' ? 'Car replacements · 25 supply · keep the motor pool clear'
      : 'Helicopter replacements · 45 supply · keep the landing area clear'}</p>
    {action && !site.action && <button disabled={!canWork} onClick={() => engine?.interactFacility()}>
      {!hud.facilityPrompt ? 'Approach within 4m' : supplies < cost ? `Need ${cost} supply` : `${touch ? '' : 'E · '}${action === 'capture' ? 'Capture intact' : action === 'build' ? 'Build equipment' : 'Repair equipment'}${cost ? ` · ${cost} supply` : ''}`}
    </button>}
  </aside>;
}
