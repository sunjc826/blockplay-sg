import type { CSSProperties } from 'react';
import type { FpsHud } from '../game/fps-engine';
import { RELOAD_POINTS, type WeaponSpec } from '../game/fps-rules';
import { MAG_IN_START, reloadStage } from '../game/fps-weapon-motion';
import { fillFraction, magazineDisplay } from '../game/hud-motion';
import { useReducedMotion } from '../game/use-reduced-motion';
import './fps-weapon-hud.css';

export default function FpsWeaponHud({ hud, weapon, canFight }: { hud: FpsHud; weapon: WeaponSpec; canFight: boolean }) {
  const magnified = weapon.optic === 'integrated' || weapon.optic === 'precision';
  const reloading = hud.reloading > 0, stage = reloadStage(hud.reloading, hud.reloadEmpty);
  // Truthful digits, except through a reload — see `hud-motion.ts`.
  // The digits are the magazine; a chambered round shows beside them as +1.
  const inMagazine = Math.max(0, hud.magazine - (hud.chambered ? 1 : 0));
  const rounds = useReducedMotion() ? inMagazine : magazineDisplay(inMagazine, weapon.capacity, hud.reserve, hud.reloading, MAG_IN_START, RELOAD_POINTS.seat);
  // An interrupted reload keeps its progress for the next one (see fps-rules).
  const resume = !reloading && hud.reloadSaved > 0 ? Math.round(hud.reloadSaved * 100) : 0;
  const using = hud.supplyUse;
  const prompt = using ? `${using.verb} · FIRE OR SPRINT TO STOP` : reloading ? `${hud.reloadEmpty ? 'EMPTY' : 'TACTICAL'} RELOAD · ${stage}`
    : resume ? `${hud.magazineOut ? 'NO MAGAZINE · ' : ''}R RESUME RELOAD · ${resume}%`
    : hud.magazine === 0 ? 'EMPTY · PRESS R'
    : !hud.roundReady ? (hud.magazineOut ? 'NO MAGAZINE · PRESS R' : 'CHAMBER EMPTY · PRESS R')
    : 'R RELOAD · Q TOGGLE AIM · RMB HOLD';
  return <div className="fps-weapon-hud" data-sight={magnified ? 'scope' : 'reflex'} data-aiming={hud.aiming} data-reloading={reloading}
    style={{ '--fps-aim': hud.aimProgress, '--fps-spread': `${hud.crosshairSpread}px` } as CSSProperties}>
    {canFight && hud.aimProgress > .02 && <div className="fps-scope fps-sight-vignette" aria-hidden="true" />}
    {/* The lens owns the ADS reticle. Unmount the hip crosshair before the
        lens fades in; legacy global ADS styles must not resurrect its bars. */}
    {canFight && !hud.aiming && hud.aimProgress <= .12 && <div className="fps-crosshair fps-tactical-crosshair" aria-hidden="true"><i /><i /><i /><i /><b /></div>}
    {canFight && hud.hit && <div key={`${hud.shots}-${hud.hits}`} className={`fps-impact-marker ${hud.hitKind === 'kill' ? 'is-kill' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>}
    {canFight && using && <div className="fps-reload-cue fps-supply-cue" data-supply-style={using.style} role="status"><span>{using.verb} · {using.name}</span><div><i style={{ width: `${using.progress * 100}%` }} /></div></div>}
    {canFight && reloading && !using && <div className="fps-reload-cue" aria-hidden="true"><span>{stage}</span><div><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div></div>}
    <div className={`fps-ammo ${!hud.roundReady && !reloading ? 'is-empty' : ''}`}>
      <span>{weapon.name} <small>{hud.aiming ? 'ADS' : weapon.fireMode === 'semi' ? 'SEMI' : 'AUTO'}</small></span>
      <strong key={hud.shots}>{rounds.toString().padStart(2, '0')}{hud.chambered && <em className="fps-chamber" aria-label="one in the chamber">+1</em>}<small>/ {hud.reserve}</small></strong>
      <p>{prompt}</p>
      <p>{hud.carriedKg.toFixed(1)} KG CARRIED · {Math.round(hud.movementScale * 100)}% MOVEMENT</p>
      {weapon.requiresMount && <p>{hud.braced ? 'PRONE MOUNT DEPLOYED · Z / STAND TO MOVE' : 'Z / PRONE: SAFE · STAND 20 / CROUCH 10 BEFORE ARMOR'}</p>}
      {reloading
        ? <div className="fps-reload-track" role="progressbar" aria-label="Reload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - hud.reloading) * 100)}><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div>
        : <div className="fps-magazine-bar" aria-hidden="true"><i style={{ transform: `scaleX(${fillFraction(rounds, weapon.capacity)})` }} /></div>}
    </div>
  </div>;
}
