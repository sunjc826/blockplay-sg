import { itemById } from '../game/armory-catalog';
import { variantSpec } from '../game/armory-state';
import { reloadMechanism } from '../game/reload-audio';

export type StoreEquipSound = 'equip' | 'equip-food' | 'equip-medical' | 'equip-grenade'
  | `equip-gun-${ReturnType<typeof reloadMechanism>}` | 'equip-gun-drum-box';

/** Classify the item actually equipped, including fixed variants' feed overrides. */
export function storeEquipSound(id: string | undefined): StoreEquipSound {
  const item = itemById(id ?? '');
  if (item?.category === 'weapon') {
    const weapon = variantSpec(item)!;
    // A box-fed Ultimax retains its own charging action, as in gameplay reloads.
    return weapon.id === 'ultimax-inspired' && weapon.feed === 'magazine'
      ? 'equip-gun-drum-box' : `equip-gun-${reloadMechanism(weapon)}`;
  }
  if (item?.category === 'consumable') {
    if (item.supplyType === 'food') return 'equip-food';
    if (item.supplyType === 'medical') return 'equip-medical';
    if (item.grenade || item.supplyType === 'grenade') return 'equip-grenade';
  }
  return 'equip';
}
