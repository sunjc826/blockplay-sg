import type { CSSProperties } from 'react';
import { Rotate3d } from 'lucide-react';
import { tapProps } from './touch-tap';
import type { FpsHud } from '../game/fps-engine';
import { RELOAD_POINTS, reloadShare, type WeaponSpec } from '../game/fps-rules';
import { itemById, tierRank } from '../game/armory-catalog';
import { MAG_IN_START, reloadStage } from '../game/fps-weapon-motion';
import { fillFraction, magazineDisplay } from '../game/hud-motion';
import { useReducedMotion } from '../game/use-reduced-motion';
import { SHORT_SCREEN, useMediaQuery } from '../game/use-media-query';
import type { UtilityKind } from '../game/utility-belt';
import FpsUtilityBelt from './FpsUtilityBelt';
import './fps-weapon-hud.css';

export default function FpsWeaponHud({ hud, weapon, canFight, onUtility, onPickFood, onInspect, touch = false }: { hud: FpsHud; weapon: WeaponSpec & { equipment?: { variant: string } }; canFight: boolean; onUtility?: (kind: UtilityKind) => void; onPickFood?: () => void; onInspect?: () => void; touch?: boolean }) {
  // A phone on its side has no height for the belt over the ammo under the weapon
  // slider, so the belt docks along the bottom between the two thumbs instead.
  const docked = useMediaQuery(SHORT_SCREEN) && touch;
  const belt = <FpsUtilityBelt hud={hud} canUse={canFight && !hud.supplyUse} onUse={onUtility} onPickFood={onPickFood} docked={docked} />;
  // Canted onto an offset dot, the sight in use is a 1x one whatever sits on top.
  // Elite and up wear their rarity beside the name, so a Mythic reads as one mid-fight too.
  const tier = itemById(weapon.equipment?.variant ?? '')?.tier, rare = tier && tierRank(tier) >= tierRank('Elite') ? tier : null;
  const magnified = (weapon.optic === 'integrated' || weapon.optic === 'precision') && !hud.canted;
  const reloading = hud.reloading > 0, stage = reloadStage(hud.reloading, hud.reloadEmpty);
  // Truthful digits, except through a reload — see `hud-motion.ts`.
  // The digits are the magazine; a chambered round shows beside them as +1.
  const inMagazine = Math.max(0, hud.magazine - (hud.chambered ? 1 : 0));
  const rounds = useReducedMotion() ? inMagazine : magazineDisplay(inMagazine, weapon.capacity, hud.reserve, hud.reloading, reloadShare(MAG_IN_START, hud.reloadEmpty), reloadShare(RELOAD_POINTS.seat, hud.reloadEmpty));
  // An interrupted reload keeps its progress for the next one (see fps-rules).
  const resume = !reloading && hud.reloadSaved > 0 ? Math.round(hud.reloadSaved * 100) : 0;
  const using = hud.supplyUse;
  const prompt = using ? `${using.verb} · FIRE OR SPRINT TO STOP` : reloading ? `${hud.reloadEmpty ? 'EMPTY' : 'TACTICAL'} RELOAD · ${stage}`
    : hud.inspecting ? 'INSPECTING · FIRE OR AIM TO READY'
    : resume ? `${hud.magazineOut ? 'NO MAGAZINE · ' : ''}R RESUME RELOAD · ${resume}%`
    : hud.magazine === 0 ? 'EMPTY · PRESS R'
    : !hud.roundReady ? (hud.magazineOut ? 'NO MAGAZINE · PRESS R' : 'CHAMBER EMPTY · PRESS R')
    : null;
  return <div className="fps-weapon-hud" data-sight={magnified ? 'scope' : 'reflex'} data-aiming={hud.aiming} data-reloading={reloading}
    style={{ '--fps-aim': hud.aimProgress, '--fps-spread': `${hud.crosshairSpread}px` } as CSSProperties}>
    {canFight && hud.aimProgress > .02 && <div className="fps-scope fps-sight-vignette" aria-hidden="true" />}
    {/* The lens owns the ADS reticle. Unmount the hip crosshair before the
        lens fades in; legacy global ADS styles must not resurrect its bars. */}
    {canFight && !hud.aiming && hud.aimProgress <= .12 && <div className="fps-crosshair fps-tactical-crosshair" aria-hidden="true"><i /><i /><i /><i /><b /></div>}
    {canFight && hud.hit && <div key={`${hud.shots}-${hud.hits}`} className={`fps-impact-marker ${hud.hitKind === 'kill' ? 'is-kill' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>}
    {canFight && using && <div className="fps-reload-cue fps-supply-cue" data-supply-style={using.style} role="status"><span>{using.verb} · {using.name}</span><div><i style={{ width: `${using.progress * 100}%` }} /></div></div>}
    {canFight && reloading && !using && <div className="fps-reload-cue" aria-hidden="true"><span>{stage}</span><div><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div></div>}
    {docked && belt}
    <div className={`fps-ammo ${!hud.roundReady && !reloading ? 'is-empty' : ''}`}>
      {/* Above the weapon so the two read as one kit, and so the belt rises with the ammo block wherever the thumbs push it. */}
      {!docked && belt}
      <span>{rare && <em className="fps-tier" data-tier={rare.toLowerCase()}>{rare}</em>}{weapon.name} <small>{hud.aiming ? 'ADS' : weapon.fireMode === 'semi' ? 'SEMI' : 'AUTO'}</small></span>
      <strong key={hud.shots}>{rounds.toString().padStart(2, '0')}{hud.chambered && <em className="fps-chamber" aria-label="one in the chamber">+1</em>}<small>/ {hud.reserve}</small></strong>
      {prompt ? <p>{prompt}</p> : <p className="fps-ammo-detail">R RELOAD · Q TOGGLE AIM · RMB HOLD</p>}
      {(hud.rail || hud.offsetDot) && <p className="fps-ammo-detail" data-accessories>{[
        hud.rail && `B ${hud.rail.kind === 'laser' ? 'LASER' : hud.rail.kind === 'light' ? 'LIGHT' : 'LASER-LIGHT'} ${hud.rail.on ? 'ON' : 'OFF'}`,
        hud.offsetDot && `X ${hud.canted ? 'BACK TO SCOPE' : 'OFFSET DOT'}`,
      ].filter(Boolean).join(' · ')}</p>}
      <p className="fps-ammo-detail">{hud.carriedKg.toFixed(1)} KG CARRIED · {Math.round(hud.movementScale * 100)}% MOVEMENT</p>
      {onInspect && hud.vehicle === 'on-foot' && <button type="button" className="fps-inspect-button" aria-label={hud.inspecting ? 'Stop inspecting weapon' : 'Inspect weapon'} aria-pressed={hud.inspecting}
        disabled={!canFight || hud.pilotEnabled || reloading || !!using || hud.aiming} title="Inspect weapon (K)"
        {...tapProps(onInspect)}><Rotate3d size={13} /><span>{hud.inspecting ? 'Inspecting' : 'Inspect'}</span>{!touch && <kbd>K</kbd>}</button>}
      {weapon.requiresMount && <p>{hud.braced ? 'PRONE MOUNT DEPLOYED · Z / STAND TO MOVE' : 'Z / PRONE: SAFE · STAND 20 / CROUCH 10 BEFORE ARMOR'}</p>}
      {reloading
        ? <div className="fps-reload-track" role="progressbar" aria-label="Reload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - hud.reloading) * 100)}><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div>
        : <div className="fps-magazine-bar" aria-hidden="true"><i style={{ transform: `scaleX(${fillFraction(rounds, weapon.capacity)})` }} /></div>}
    </div>
  </div>;
}
