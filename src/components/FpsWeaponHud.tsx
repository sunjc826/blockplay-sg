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
import FpsVitals from './FpsVitals';
import './fps-weapon-hud.css';

export default function FpsWeaponHud({ hud, weapon, canFight, onUtility, onPickFood, onPickGrenade, onGrenadeFire, onInspect, touch = false }: { hud: FpsHud; weapon: WeaponSpec & { equipment?: { variant: string } }; canFight: boolean; onUtility?: (kind: UtilityKind) => void; onPickFood?: () => void; onPickGrenade?: () => void; onGrenadeFire?: (held: boolean) => void; onInspect?: () => void; touch?: boolean }) {
  // A phone on its side has no height for the belt over the ammo under the weapon
  // slider, so the belt docks along the bottom between the two thumbs instead.
  const docked = useMediaQuery(SHORT_SCREEN) && touch;
  const belt = <FpsUtilityBelt hud={hud} canUse={canFight && !hud.supplyUse} onUse={onUtility} onPickFood={onPickFood} onPickGrenade={onPickGrenade} onGrenadeFire={onGrenadeFire} docked={docked} />;
  // Canted onto an offset dot, the sight in use is a 1x one whatever sits on top.
  // Elite and up wear their rarity beside the name, so a Mythic reads as one mid-fight too.
  const tier = itemById(weapon.equipment?.variant ?? '')?.tier, rare = tier && tierRank(tier) >= tierRank('Elite') ? tier : null;
  const magnified = (weapon.optic === 'integrated' || weapon.optic === 'precision') && !hud.canted;
  const reloading = hud.reloading > 0, stage = reloadStage(hud.reloading, hud.reloadEmpty);
  // Truthful digits, except through a reload — see `hud-motion.ts`.
  // The digits are the magazine; a chambered round shows beside them as +1.
  const capacity = hud.magazineCapacity ?? weapon.capacity, reloadCapacity = hud.reloadCapacity ?? capacity;
  const inMagazine = Math.max(0, hud.magazine - (hud.chambered ? 1 : 0));
  const rounds = useReducedMotion() ? inMagazine : magazineDisplay(inMagazine, reloadCapacity, reloadCapacity, hud.reloading, reloadShare(MAG_IN_START, hud.reloadEmpty), reloadShare(RELOAD_POINTS.seat, hud.reloadEmpty));
  // An interrupted reload keeps its progress for the next one (see fps-rules).
  const resume = !reloading && hud.reloadSaved > 0 ? Math.round(hud.reloadSaved * 100) : 0;
  const using = hud.supplyUse;
  const grenade = hud.grenadeHeld;
  const hint = (text: string) => <span className="fps-hud-hint">{text}</span>;
  const prompt = grenade ? <>{grenade.pinned ? 'GRENADE PINNED' : 'GRENADE READY'}{hint(grenade.pinned ? ' · RELEASE FIRE TO THROW · HOLD AIM TO LOB' : ' · HOLD FIRE TO COOK · RELEASE TO THROW')}</>
    : using ? <>{using.verb}{hint(' · FIRE OR SPRINT TO STOP')}</> : reloading ? `${hud.reloadEmpty ? 'EMPTY' : 'TACTICAL'} RELOAD · ${stage}`
    : hud.inspecting ? <>INSPECTING{hint(' · FIRE OR AIM TO READY')}</>
    : resume ? <>{hud.magazineOut ? 'NO MAGAZINE · ' : ''}{hint('R · ')}RESUME RELOAD · {resume}%</>
    : hud.magazine === 0 ? <>EMPTY{hint(' · PRESS R')}</>
    : !hud.roundReady ? <>{hud.magazineOut ? 'NO MAGAZINE' : 'CHAMBER EMPTY'}{hint(' · PRESS R')}</>
    : null;
  return <div className="fps-weapon-hud" data-sight={magnified ? 'scope' : 'reflex'} data-aiming={hud.aiming} data-reloading={reloading}
    style={{ '--fps-aim': hud.aimProgress, '--fps-spread': `${hud.crosshairSpread}px` } as CSSProperties}>
    {canFight && hud.aimProgress > .02 && <div className="fps-scope fps-sight-vignette" aria-hidden="true" />}
    {/* The lens owns the ADS reticle. Unmount the hip crosshair before the
        lens fades in; legacy global ADS styles must not resurrect its bars. */}
    {canFight && !hud.aiming && hud.aimProgress <= .12 && <div className="fps-crosshair fps-tactical-crosshair" aria-hidden="true"><i /><i /><i /><i /><b /></div>}
    {canFight && grenade && <div className="fps-grenade-cook" role="progressbar" aria-label="Grenade fuse" aria-valuemin={0} aria-valuemax={grenade.fuse} aria-valuenow={grenade.cooked} style={{ '--cook': `${grenade.cooked / grenade.fuse * 100}%` } as CSSProperties}><span>{grenade.pinned ? `${Math.max(0, grenade.fuse - grenade.cooked).toFixed(1)}s` : '9'}</span></div>}
    {canFight && hud.grenadeWarnings.map(g => <div key={g.serial} className="fps-grenade-warning" style={{ transform: `rotate(${g.angle}rad)` }} aria-label="Live grenade nearby"><b>▼</b></div>)}
    {canFight && hud.conditions.some(c => c.kind === 'at-attention') && <div className="fps-attention-overlay" role="alert">STAND BY</div>}
    {canFight && hud.hit && <div key={`${hud.shots}-${hud.hits}`} className={`fps-impact-marker ${hud.hitKind === 'kill' ? 'is-kill' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>}
    {canFight && using && <div className="fps-reload-cue fps-supply-cue" data-supply-style={using.style} role="status"><span>{using.verb} · {using.name}</span><div><i style={{ width: `${using.progress * 100}%` }} /></div></div>}
    {canFight && reloading && !using && <div className="fps-reload-cue" aria-hidden="true"><span>{stage}</span><div><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div></div>}
    {docked && belt}
    <div className="fps-combat-hud" role="group" aria-label="Combat status">
      {!docked && belt}
      <div className="fps-combat-readouts">
        <FpsVitals hud={hud} />
        <div className={`fps-ammo ${!hud.roundReady && !reloading ? 'is-empty' : ''}`}>
          <span>{rare && <em className="fps-tier" data-tier={rare.toLowerCase()}>{rare}</em>}{grenade?.name ?? weapon.name} <small>{hud.aiming ? 'ADS' : weapon.fireMode === 'semi' ? 'SEMI' : 'AUTO'}</small></span>
          {grenade ? <strong>{grenade.pinned ? Math.max(0, grenade.fuse - grenade.cooked).toFixed(1) : 'READY'}<small>{grenade.pinned ? ' s' : grenade.under ? ' LOB' : ' THROW'}</small></strong> : <strong key={hud.shots}>{rounds.toString().padStart(2, '0')}{hud.chambered && <em className="fps-chamber" aria-label="one in the chamber">+1</em>}<small title={`${weapon.caliberMm} mm compatible spare magazines`}> · {hud.spareMagazines ?? 0} MAGS</small></strong>}
          {prompt ? <p>{prompt}</p> : <p className="fps-ammo-detail fps-hud-hint">R RELOAD · DISCARDS UNUSED ROUNDS · Q / RMB AIM{onInspect && hud.vehicle === 'on-foot' && !touch && ' · K INSPECT'}</p>}
          {(hud.rail || hud.offsetDot) && <p className="fps-ammo-detail" data-accessories>
            {hud.rail && hud.rail.kind !== 'light' && <>{hint('B ')}LASER {(hud.rail.laserOn ?? hud.rail.on) ? 'ON' : 'OFF'}</>}
            {hud.rail?.kind === 'laser-light' && ' · '}
            {hud.rail && hud.rail.kind !== 'laser' && <>{hint('L ')}LIGHT {(hud.rail.lightOn ?? hud.rail.on) ? 'ON' : 'OFF'}</>}
            {hud.rail && hud.offsetDot && ' · '}{hud.offsetDot && <>{hint('X ')}{hud.canted ? 'OFFSET DOT' : 'PRIMARY SIGHT'}</>}
          </p>}
          <p className="fps-ammo-detail fps-hud-hint">{hud.carriedKg.toFixed(1)} KG CARRIED · {Math.round(hud.movementScale * 100)}% MOVEMENT</p>
          {touch && onInspect && hud.vehicle === 'on-foot' && <button type="button" className="fps-inspect-button" aria-label={hud.inspecting ? 'Stop inspecting weapon' : 'Inspect weapon'} aria-pressed={hud.inspecting}
            disabled={!canFight || hud.pilotEnabled || reloading || !!using || !!grenade || hud.aiming} title="Inspect weapon (K)"
            {...tapProps(onInspect)}><Rotate3d size={13} /><span>{hud.inspecting ? 'Inspecting' : 'Inspect'}</span></button>}
          {weapon.requiresMount && <p>{hud.braced ? <>PRONE MOUNT DEPLOYED{hint(' · Z / STAND TO MOVE')}</> : <>{hint('Z / PRONE: SAFE · ')}STAND 20 / CROUCH 10 BEFORE ARMOR</>}</p>}
          {reloading
            ? <div className="fps-reload-track" role="progressbar" aria-label="Reload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - hud.reloading) * 100)}><i style={{ width: `${(1 - hud.reloading) * 100}%` }} /></div>
            : <div className="fps-magazine-bar" aria-hidden="true"><i style={{ transform: `scaleX(${fillFraction(rounds, capacity)})` }} /></div>}
        </div>
      </div>
    </div>
  </div>;
}
