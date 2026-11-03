import { HeartPulse, Shield } from 'lucide-react';
import type { FpsHud } from '../game/fps-engine';
import { fillFraction } from '../game/hud-motion';
import { armorState, healthBand } from '../game/vitals';
import './fps-vitals.css';

/** Paints behind the chip's digits; the clip keeps the ghost out from under the translucent fill. */
function VitalGauge({ fraction }: { fraction: number }) {
  return <>
    <i className="fps-vital-ghost-clip" style={{ clipPath: `inset(0 0 0 ${fraction * 100}%)` }}><i className="fps-vital-ghost" style={{ transform: `scaleX(${fraction})` }} /></i>
    <i className="fps-vital-fill" style={{ transform: `scaleX(${fraction})` }} />
  </>;
}

/** Shared by infantry and mounted weapons. */
export default function FpsVitals({ hud }: { hud: FpsHud }) {
  const health = fillFraction(hud.health, hud.maxHealth);
  const armorCapacity = Math.max(hud.maxArmor, hud.armor);
  const band = healthBand(hud.health, hud.maxHealth);
  const warning = hud.health <= 0 ? 'OPERATOR DOWN' : band === 'critical' ? 'CRITICAL · FIND COVER' : band === 'low' ? 'LOW HEALTH · HEAL' : 'OPERATOR STATUS';
  return <div className="fps-vitals" role="group" aria-label="Operator health and armor" data-health-band={band} data-armor-state={armorState(hud.armor)}>
    <span className="fps-vitals-status" role="status">{warning}</span>
    <span className="fps-vital is-health" data-hurt={hud.hurt || undefined} aria-label={`Health ${Math.ceil(hud.health)} of ${hud.maxHealth}`}>
      <span className="fps-vital-label"><HeartPulse size={14} aria-hidden="true" />HEALTH</span>
      <b>{Math.ceil(hud.health)}</b>{hud.maxHealth > 100 && <small> / {hud.maxHealth}</small>}
      <VitalGauge fraction={health} />
    </span>
    <span className="fps-vital is-armor" aria-label={`Armor ${Math.ceil(hud.armor)} of ${Math.ceil(armorCapacity)}`}>
      <span className="fps-vital-label"><Shield size={14} aria-hidden="true" />{hud.armor > 0 ? 'ARMOR' : 'NO ARMOR'}</span>
      <b>{Math.ceil(hud.armor)}</b>
      <VitalGauge fraction={fillFraction(hud.armor, armorCapacity)} />
    </span>
  </div>;
}
