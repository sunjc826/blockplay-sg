import type { ShopItem } from './armory-catalog';

export type ArmorPickupAction = 'collect' | 'swap';

/** Collect repairs the worn inserts; swapping deliberately replaces the whole set. */
export function armorPickup(armor: number, worn: ShopItem | undefined, found: ShopItem, action: ArmorPickupAction = 'collect') {
  const capacity = worn?.protection ?? 0, points = found.protection ?? 0;
  if (found.category !== 'plate' || points <= 0) return { armor, restored: 0, equip: false, blocked: 'No usable armor' };
  if (capacity <= 0 || action === 'swap' && worn?.id !== found.id) {
    return { armor: points, restored: Math.max(0, points - armor), equip: true };
  }
  if (armor >= capacity) return { armor, restored: 0, equip: false, blocked: 'Armor full' };
  const next = Math.min(capacity, armor + points);
  return { armor: next, restored: next - armor, equip: false };
}
