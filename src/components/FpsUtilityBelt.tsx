import type { ReactNode } from 'react';
import { Bomb, Bandage, BriefcaseMedical, ChevronUp, Package, Sandwich, ShieldPlus } from 'lucide-react';
import type { FpsHud } from '../game/fps-engine';
import { KIND_OF_STYLE, type UtilityKind } from '../game/utility-belt';
import { healthBand } from '../game/vitals';
import { tapProps } from './touch-tap';

const ICONS: Record<UtilityKind, ReactNode> = {
  grenade: <Bomb size={15} />, food: <Sandwich size={15} />, bandage: <Bandage size={15} />, 'first-aid': <BriefcaseMedical size={15} />,
  plates: <ShieldPlus size={15} />, ammo: <Package size={15} />,
};
const HEALING: readonly UtilityKind[] = ['food', 'bandage', 'first-aid'];

/**
 * The utility belt: every slot, always in the same place, with what it holds.
 * Empty slots stay drawn so a player learns where the bandages go before they
 * have any. The selected slot is G's; a slot in use fills as the hands work,
 * and while health is low the slots that could fix it are marked.
 */
export default function FpsUtilityBelt({ hud, canUse, onUse, onPickFood, onPickGrenade, onGrenadeFire, docked = false }: { hud: FpsHud; canUse: boolean; onUse?: (kind: UtilityKind) => void; onPickFood?: () => void; onPickGrenade?: () => void; onGrenadeFire?: (held: boolean) => void; docked?: boolean }) {
  if (!hud.belt.length) return null;
  const using = hud.grenadeHeld ? 'grenade' : hud.supplyUse?.fromBelt ? KIND_OF_STYLE[hud.supplyUse.style] : null;
  const hurt = healthBand(hud.health, hud.maxHealth) !== 'steady';
  const selected = hud.belt.find(slot => slot.kind === hud.beltSelected);
  const food = hud.belt.find(slot => slot.kind === 'food');
  const grenade = hud.belt.find(slot => slot.kind === 'grenade');
  return <div className={`fps-belt${docked ? ' is-docked' : ''}`} role="group" aria-label="Utility belt" data-testid="utility-belt">
    {hud.conditions.length > 0 && <ul className="fps-food-effects fps-grenade-conditions" aria-label="Grenade conditions">{hud.conditions.map(c => <li key={c.kind}><span>{c.label}</span><b>{c.remaining}s</b><i style={{ transform: `scaleX(${c.share})` }} /></li>)}</ul>}
    {hud.foodEffects.length > 0 && <ul className="fps-food-effects" aria-label="Food effects">{hud.foodEffects.map(effect =>
      <li key={effect.kind} data-kind={effect.kind} title={effect.summary}><span>{effect.label}</span><b>{effect.remaining}s</b>
        <i style={{ transform: `scaleX(${effect.share})` }} /></li>)}</ul>}
    <div className="fps-belt-slots">{hud.belt.map(slot => <button key={slot.kind} type="button" className="fps-belt-slot" data-kind={slot.kind} data-count={slot.count}
      data-empty={!slot.count || undefined} data-using={using === slot.kind || undefined} data-chosen={slot.chosen || undefined} data-wanted={(hurt && slot.count > 0 && HEALING.includes(slot.kind)) || undefined}
      aria-pressed={slot.kind === hud.beltSelected} disabled={!canUse || !slot.count || !onUse}
      aria-label={`${slot.label}: ${slot.count ? `${slot.count} carried, next ${slot.next?.name}` : 'none carried'}. Key ${slot.key}.`}
      title={slot.next ? `${slot.next.name} · ${slot.next.effect}` : `No ${slot.label.toLowerCase()} carried`} {...(slot.kind === 'grenade' && hud.grenadeHeld && onGrenadeFire ? { onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onGrenadeFire(true); }, onPointerUp: () => onGrenadeFire(false), onPointerCancel: () => onGrenadeFire(false) } : tapProps(() => onUse?.(slot.kind)))}>
      <kbd>{slot.key}</kbd>{ICONS[slot.kind]}<b>{slot.count}</b><small>{slot.label}</small>
      {using === slot.kind && <i className="fps-belt-progress" style={{ transform: `scaleX(${hud.grenadeHeld ? hud.grenadeHeld.cooked / hud.grenadeHeld.fuse : hud.supplyUse!.progress})` }} />}
    </button>)}</div>
    {selected?.next && <p className="fps-belt-next"><kbd>G</kbd> {selected.next.name} <span>{selected.next.effect}</span></p>}
    {grenade && grenade.count > 0 && onPickGrenade && <button type="button" className="fps-food-choose" disabled={!canUse || hud.grenadeHeld?.pinned} aria-label="Choose grenade" {...tapProps(onPickGrenade)}><ChevronUp size={11} />{grenade.chosen ? grenade.next?.name : 'Auto grenade'}<kbd>hold 9</kbd></button>}
    {food && food.count > 0 && onPickFood && <button type="button" className="fps-food-choose" disabled={!canUse} aria-label={`Choose food: ${food.chosen ? food.next?.name : 'Auto'}`}
      {...tapProps(onPickFood)}><ChevronUp size={11} />{food.chosen ? food.next?.name : 'Auto food'}<kbd>hold 4</kbd></button>}
  </div>;
}
