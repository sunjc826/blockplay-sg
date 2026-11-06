import { HeartPulse, Shield } from 'lucide-react';
import { useRef, type Ref } from 'react';
import type { FpsHud } from '../game/fps-engine';
import { fillFraction } from '../game/hud-motion';
import { armorState, healthBand } from '../game/vitals';
import { useVitalsHit } from './vitals-hit';
import './fps-vitals.css';

const HEALTH_BLINK = '#ff7a62', HEALTH_GLOW = '#ff3a1f', ARMOR_BLINK = '#f2fbff', ARMOR_GLOW = '#6cc4f0';

/** Paints behind the chip's digits; the clip keeps the ghost out from under the translucent fill. */
function VitalGauge({ fraction, flash }: { fraction: number; flash: Ref<HTMLElement> }) {
  return <>
    <i className="fps-vital-ghost-clip" style={{ clipPath: `inset(0 0 0 ${fraction * 100}%)` }}><i className="fps-vital-ghost" style={{ transform: `scaleX(${fraction})` }} /></i>
    <i className="fps-vital-fill" style={{ transform: `scaleX(${fraction})` }} />
    <i className="fps-vital-flash" ref={flash} />
  </>;
}

/** Touch's readout, shrinking towards the middle: one line, with the number over it. Replaces the chips wherever it is drawn. */
export function FpsHealthLine({ hud }: { hud: FpsHud }) {
  const health = fillFraction(hud.health, hud.maxHealth), band = healthBand(hud.health, hud.maxHealth);
  const armor = Math.ceil(hud.armor), points = Math.ceil(hud.health);
  const warning = hud.health <= 0 ? 'OPERATOR DOWN' : band === 'critical' ? 'CRITICAL · FIND COVER' : '';
  const line = useRef<HTMLDivElement>(null), flash = useRef<HTMLElement>(null), ghost = useRef<HTMLElement>(null), fill = useRef<HTMLElement>(null), digits = useRef<HTMLElement>(null), armorBar = useRef<HTMLElement>(null);
  useVitalsHit(hud.health, hud.armor, hud.maxHealth, {
    health: { parts: { frame: line, flash, bars: [ghost, fill], digits }, blink: HEALTH_BLINK, glow: HEALTH_GLOW },
    armor: { parts: { frame: line, bars: [armorBar] }, blink: ARMOR_BLINK, glow: ARMOR_GLOW },
  }, 'y');
  return <div className="fps-health-line" ref={line} role="group" aria-label={`Health ${points} of ${hud.maxHealth}, armor ${armor}`} data-health-band={band}>
    <div className="fps-health-track" aria-hidden="true">
      <i className="fps-health-flash" ref={flash} />
      <i className="fps-health-ghost" ref={ghost} style={{ transform: `scaleX(${health})` }} />
      <i className="fps-health-fill" ref={fill} style={{ transform: `scaleX(${health})` }} />
      <b ref={digits}>{points}</b>
    </div>
    {armor > 0 && <div className="fps-armor-track" aria-hidden="true">
      <i ref={armorBar} style={{ transform: `scaleX(${fillFraction(hud.armor, Math.max(hud.maxArmor, hud.armor))})` }} />
      <small>+{armor}</small>
    </div>}
    <span className="fps-health-warning" role="status">{warning}</span>
  </div>;
}

/** Shared by infantry and mounted weapons. */
export default function FpsVitals({ hud }: { hud: FpsHud }) {
  const health = fillFraction(hud.health, hud.maxHealth);
  const armorCapacity = Math.max(hud.maxArmor, hud.armor);
  const band = healthBand(hud.health, hud.maxHealth);
  const warning = hud.health <= 0 ? 'OPERATOR DOWN' : band === 'critical' ? 'CRITICAL · FIND COVER' : band === 'low' ? 'LOW HEALTH · HEAL' : 'OPERATOR STATUS';
  const healthChip = useRef<HTMLSpanElement>(null), healthFlash = useRef<HTMLElement>(null), healthDigits = useRef<HTMLElement>(null);
  const armorChip = useRef<HTMLSpanElement>(null), armorFlash = useRef<HTMLElement>(null), armorDigits = useRef<HTMLElement>(null);
  useVitalsHit(hud.health, hud.armor, hud.maxHealth, {
    health: { parts: { frame: healthChip, flash: healthFlash, digits: healthDigits }, blink: '#fff', glow: HEALTH_GLOW },
    armor: { parts: { frame: armorChip, flash: armorFlash, digits: armorDigits }, blink: '#fff', glow: ARMOR_GLOW },
  }, 'x');
  return <div className="fps-vitals" role="group" aria-label="Operator health and armor" data-health-band={band} data-armor-state={armorState(hud.armor)}>
    <span className="fps-vitals-status" role="status">{warning}</span>
    <span className="fps-vital is-health" ref={healthChip} aria-label={`Health ${Math.ceil(hud.health)} of ${hud.maxHealth}`}>
      <span className="fps-vital-label"><HeartPulse size={14} aria-hidden="true" />HEALTH</span>
      <b ref={healthDigits}>{Math.ceil(hud.health)}</b>{hud.maxHealth > 100 && <small> / {hud.maxHealth}</small>}
      <VitalGauge fraction={health} flash={healthFlash} />
    </span>
    <span className="fps-vital is-armor" ref={armorChip} aria-label={`Armor ${Math.ceil(hud.armor)} of ${Math.ceil(armorCapacity)}`}>
      <span className="fps-vital-label"><Shield size={14} aria-hidden="true" />{hud.armor > 0 ? 'ARMOR' : 'NO ARMOR'}</span>
      <b ref={armorDigits}>{Math.ceil(hud.armor)}</b>
      <VitalGauge fraction={fillFraction(hud.armor, armorCapacity)} flash={armorFlash} />
    </span>
  </div>;
}
