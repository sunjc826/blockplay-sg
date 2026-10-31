import './fps-vehicle-hud.css';
import HelicopterFlightHud from './HelicopterFlightHud';
import HelicopterStatusHud from './HelicopterStatusHud';
import FpsVitals from './FpsVitals';
import type { FpsHud } from '../game/fps-engine';

export default function FpsVehicleHud({ hud }: { hud: FpsHud }) {
  if (hud.vehicle === 'on-foot') return null;
  if (hud.vehicle === 'helicopter') return <><HelicopterFlightHud hud={hud} /><HelicopterStatusHud hud={hud} /></>;
  return (<div className="fps-vehicle-hud" data-damage={hud.vehicleDamage} data-personal={hud.vehiclePersonalWeapon || undefined}>{!hud.vehiclePersonalWeapon && <FpsVitals hud={hud} />}<span>UTILITY 01 / {hud.vehicleSeats[hud.vehicleSeat ?? 0]?.label.toUpperCase()}</span><strong>{Math.round(hud.vehicleSpeed)}<small>KM/H</small></strong><div className="fps-vehicle-vitals"><label>HULL {Math.ceil(hud.vehicleHealth)} / {hud.vehicleMaxHealth} HP · {hud.vehicleDamage.toUpperCase()}<meter min={0} max={hud.vehicleMaxHealth} value={hud.vehicleHealth} /></label>{!hud.vehiclePersonalWeapon && <b>{hud.vehicleWeapon} · {hud.vehicleAmmo} / {hud.vehicleAmmoMax}</b>}<small>{hud.vehiclePersonalWeapon ? <span className="fps-hud-hint">LMB / FIRE · EQUIPPED FIREARM · R RELOAD</span> : !hud.vehicleCanFire ? 'GUNNER CONTROLS WEAPON' : hud.vehicleAmmo ? <span className="fps-hud-hint">LMB / FIRE · LOOK TO AIM</span> : 'AMMUNITION DEPLETED'}</small></div><div className="fps-vehicle-seats">{hud.vehicleSeats.map((seat, i) => <span key={seat.label} data-self={seat.self || undefined}>{i + 1}. {seat.label}: {seat.name}</span>)}</div><p><span className="fps-hud-hint">C · </span>{hud.vehicleView === 'first-person' ? 'FIRST PERSON' : 'THIRD PERSON'}<span className="fps-hud-hint"> · Q / RMB AIM</span></p><p className="fps-hud-hint">V · SWITCH SEAT · E · EXIT</p><p className="fps-hud-hint">BRAKE TO DISMOUNT</p></div>);
}
