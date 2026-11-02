import { useEffect, useRef, type PointerEvent } from 'react';
import { ChevronUp } from 'lucide-react';
import type { FpsHud } from '../game/fps-engine';
import { itemById } from '../game/armory-catalog';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { UTILITY_HOLD_MS, type UtilityGroup, type UtilityOption } from '../game/utility-wheel';
import { tapProps } from './touch-tap';

function QuickUtility({ group, item, canUse, onUse, onPick, progress }: { group: UtilityGroup; item: UtilityOption | null; canUse: boolean; onUse?: () => void; onPick?: () => void; progress?: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), held = useRef(false);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  useEffect(() => { if (!canUse) { cancel(); held.current = true; } }, [canUse]);
  const key = group === 'recovery' ? 'F' : 'G', label = group === 'recovery' ? 'Recovery' : 'Combat';
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); cancel(); held.current = false;
    timer.current = setTimeout(() => { timer.current = null; held.current = true; onPick?.(); }, UTILITY_HOLD_MS);
  };
  return <div className="fps-quick-utility">
    <button className="fps-belt-slot fps-quick-slot" type="button" data-group={group} data-item={item?.id} data-count={item?.count ?? 0}
      data-depleted={!item?.count || undefined} data-using={progress !== undefined || undefined} disabled={!canUse}
      aria-label={`${label}: ${item?.name ?? 'none selected'}, ${item?.count ?? 0} carried. Tap ${key} to use, hold to choose.`}
      onPointerDown={down} onPointerUp={event => { event.preventDefault(); cancel(); if (!held.current) onUse?.(); }}
      onPointerCancel={() => { cancel(); held.current = true; }} onClick={event => { if (event.detail === 0 && !(event.nativeEvent as globalThis.PointerEvent).pointerType) onUse?.(); }}>
      <kbd>{key}</kbd>{item && <img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(itemById(item.id)!)}`} alt="" draggable={false} />}
      <b>{item?.count ?? 0}</b><small>{!item?.count ? 'Choose item' : label}</small>
      {progress !== undefined && <i className="fps-belt-progress" style={{ transform: `scaleX(${progress})` }} />}
    </button>
    <button type="button" className="fps-quick-choose" disabled={!canUse} aria-label={`Choose ${group} item`} {...tapProps(() => onPick?.())}><ChevronUp size={13} /><span>Choose</span></button>
  </div>;
}

export default function FpsUtilityBelt({ hud, canUse, onUse, onPickRecovery, onPickGrenade, docked = false }: { hud: FpsHud; canUse: boolean; onUse?: (group: UtilityGroup) => void; onPickRecovery?: () => void; onPickGrenade?: () => void; docked?: boolean }) {
  return <div className={`fps-belt${docked ? ' is-docked' : ''}`} role="group" aria-label="Utility belt" data-testid="utility-belt">
    {hud.conditions.length > 0 && <ul className="fps-food-effects fps-grenade-conditions" aria-label="Grenade conditions">{hud.conditions.map(c => <li key={c.kind}><span>{c.label}</span><b>{c.remaining}s</b><i style={{ transform: `scaleX(${c.share})` }} /></li>)}</ul>}
    {hud.foodEffects.length > 0 && <ul className="fps-food-effects" aria-label="Food effects">{hud.foodEffects.map(effect => <li key={effect.kind} data-kind={effect.kind} title={effect.summary}><span>{effect.label}</span><b>{effect.remaining}s</b><i style={{ transform: `scaleX(${effect.share})` }} /></li>)}</ul>}
    <div className="fps-belt-slots">
      <QuickUtility group="recovery" item={hud.recoveryItem} canUse={canUse && !hud.grenadeHeld?.pinned} onUse={() => onUse?.('recovery')} onPick={onPickRecovery} progress={hud.supplyUse?.fromBelt ? hud.supplyUse.progress : undefined} />
      <QuickUtility group="combat" item={hud.combatItem} canUse={canUse && !hud.grenadeHeld?.pinned} onUse={() => onUse?.('combat')} onPick={onPickGrenade} progress={hud.grenadeHeld ? hud.grenadeHeld.cooked / hud.grenadeHeld.fuse : undefined} />
    </div>
    {hud.inputMode !== 'touch' && <p className="fps-belt-next">Tap to use · hold to choose</p>}
  </div>;
}
