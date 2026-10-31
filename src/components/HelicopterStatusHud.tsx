import type { FpsHud } from '../game/fps-engine';
import { healthBand } from '../game/vitals';

/** Unboxed readouts leave the cabin and scenery visible behind the instruments. */
export default function HelicopterStatusHud({ hud }: { hud: FpsHud }) {
  const cockpit = (hud.vehicleSeat ?? 0) < 2 && hud.vehicleView === 'first-person';
  const flightHud = hud.vehicleSeat === 0 && hud.vehicleView === 'first-person';
  const hull = Math.max(0, Math.min(100, hud.vehicleHealth / Math.max(1, hud.vehicleMaxHealth) * 100));
  const health = healthBand(hud.health, hud.maxHealth);
  const warning = hud.health <= 0 ? 'OPERATOR DOWN' : health === 'critical' ? 'OPERATOR CRITICAL' : health === 'low' ? 'LOW HEALTH' : hud.vehicleDamage === 'critical' ? 'HULL CRITICAL' : '';
  return <aside className="helicopter-status-hud" aria-label={cockpit ? `Helicopter status. Cockpit dashboard: hull ${Math.ceil(hud.vehicleHealth)} of ${hud.vehicleMaxHealth}, gun ammunition ${hud.vehicleAmmo} of ${hud.vehicleAmmoMax}` : 'Helicopter status'} data-personal={hud.vehiclePersonalWeapon || undefined} data-warning={warning ? true : undefined}>
    <div className="helicopter-status-heading"><span>FALCON <b>01</b></span><span>{hud.vehicleSeats[hud.vehicleSeat ?? 0]?.label ?? 'Crew'}</span></div>
    {!flightHud && <div className="helicopter-travel"><span>{Math.round(hud.vehicleSpeed)}<small>KM/H</small></span><span>{hud.altitude.toFixed(1)}<small>ALT M</small></span></div>}
    <dl className="helicopter-readouts">
      {!hud.vehiclePersonalWeapon && <><div data-alert={health !== 'steady' || undefined}><dt>HEALTH</dt><dd aria-label={`Health ${Math.ceil(hud.health)} of ${hud.maxHealth}`}>{Math.ceil(hud.health)}<small>/{hud.maxHealth}</small></dd></div><div><dt>ARMOR</dt><dd>{Math.ceil(hud.armor)}</dd></div></>}
      {!cockpit && <div data-alert={hud.vehicleDamage === 'critical' || undefined}><dt>HULL</dt><dd aria-label={`Hull ${Math.ceil(hud.vehicleHealth)} of ${hud.vehicleMaxHealth}`}>{Math.ceil(hull)}<small>%</small></dd></div>}
      {!cockpit && !hud.vehiclePersonalWeapon && <div><dt>GUN</dt><dd aria-label={`Mounted weapon ammunition ${hud.vehicleAmmo} of ${hud.vehicleAmmoMax}`}>{hud.vehicleAmmo}<small>/{hud.vehicleAmmoMax}</small></dd></div>}
    </dl>
    {!cockpit && <div className="helicopter-hull-line" role="meter" aria-label="Helicopter hull" aria-valuemin={0} aria-valuemax={hud.vehicleMaxHealth} aria-valuenow={Math.ceil(hud.vehicleHealth)}><i style={{ width: `${hull}%` }} /></div>}
    {warning && <div className="helicopter-status-warning" role="status">{warning}</div>}
    {!hud.vehiclePersonalWeapon && <div className="helicopter-weapon-state">{!hud.vehicleAmmo ? 'AMMUNITION DEPLETED' : !hud.vehicleCanFire ? 'GUNNER HAS CONTROL' : hud.vehicleWeapon}</div>}
    <div className="helicopter-crew" aria-label="Crew seats"><span>CREW {hud.vehicleSeats.filter(seat => seat.occupied).length}/{hud.vehicleSeats.length}</span>{hud.vehicleSeats.map((seat, i) => <span key={seat.label} title={`${seat.label}: ${seat.name}`} aria-label={`${seat.label}: ${seat.name}`} data-self={seat.self || undefined} data-occupied={seat.occupied || undefined}><i />{['P', 'G', 'L', 'R'][i]}</span>)}</div>
    <div className="helicopter-controls fps-hud-hint">V · SEAT <span>E · EXIT</span><span>{hud.vehicleView === 'first-person' ? 'FIRST PERSON' : 'THIRD PERSON'}</span></div>
  </aside>;
}
