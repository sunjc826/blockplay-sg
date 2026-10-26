import type { ReactNode } from 'react';
import { Bandage, BriefcaseMedical, Package, Sandwich, ShieldPlus } from 'lucide-react';
import type { FpsHud } from '../game/fps-engine';
import { KIND_OF_STYLE, type UtilityKind } from '../game/utility-belt';
import { healthBand } from '../game/vitals';

const ICONS: Record<UtilityKind, ReactNode> = {
  food: <Sandwich size={15} />, bandage: <Bandage size={15} />, 'first-aid': <BriefcaseMedical size={15} />,
  plates: <ShieldPlus size={15} />, ammo: <Package size={15} />,
};
const HEALING: readonly UtilityKind[] = ['food', 'bandage', 'first-aid'];

/**
 * The utility belt: every slot, always in the same place, with what it holds.
 * Empty slots stay drawn so a player learns where the bandages go before they
 * have any. The selected slot is G's; a slot in use fills as the hands work,
 * and while health is low the slots that could fix it are marked.
 */
export default function FpsUtilityBelt({ hud, canUse, onUse, docked = false }: { hud: FpsHud; canUse: boolean; onUse?: (kind: UtilityKind) => void; docked?: boolean }) {
  if (!hud.belt.length) return null;
  const using = hud.supplyUse?.fromBelt ? KIND_OF_STYLE[hud.supplyUse.style] : null;
  const hurt = healthBand(hud.health, hud.maxHealth) !== 'steady';
  const selected = hud.belt.find(slot => slot.kind === hud.beltSelected);
  return <div className={`fps-belt${docked ? ' is-docked' : ''}`} role="group" aria-label="Utility belt" data-testid="utility-belt">
    <div className="fps-belt-slots">{hud.belt.map(slot => <button key={slot.kind} type="button" className="fps-belt-slot" data-kind={slot.kind} data-count={slot.count}
      data-empty={!slot.count || undefined} data-using={using === slot.kind || undefined} data-wanted={(hurt && slot.count > 0 && HEALING.includes(slot.kind)) || undefined}
      aria-pressed={slot.kind === hud.beltSelected} disabled={!canUse || !slot.count || !onUse}
      aria-label={`${slot.label}: ${slot.count ? `${slot.count} carried, next ${slot.next?.name}` : 'none carried'}. Key ${slot.key}.`}
      title={slot.next ? `${slot.next.name} · ${slot.next.effect}` : `No ${slot.label.toLowerCase()} carried`} onClick={() => onUse?.(slot.kind)}>
      <kbd>{slot.key}</kbd>{ICONS[slot.kind]}<b>{slot.count}</b><small>{slot.label}</small>
      {using === slot.kind && <i className="fps-belt-progress" style={{ transform: `scaleX(${hud.supplyUse!.progress})` }} />}
    </button>)}</div>
    {selected?.next && <p className="fps-belt-next"><kbd>G</kbd> {selected.next.name} <span>{selected.next.effect}</span></p>}
  </div>;
}
