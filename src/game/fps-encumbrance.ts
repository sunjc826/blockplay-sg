import type { ResolvedLoadout } from './armory-state';
import type { ShopItem } from './armory-catalog';
import type { WeaponState } from './fps-rules';

const bounded = (value: number | undefined, fallback: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
/** Arcade approximations, including cartridge and feed-link mass; not ballistic energy. */
export const roundWeightKg = (caliber: number) => caliber >= 12 ? .115 : caliber >= 8 ? .012 : caliber >= 7 ? .024 : .012;
export const supplyWeightKg = (item?: ShopItem) => item?.category === 'consumable'
  ? bounded(item.weightKg, item.effect?.reserve ? 1.2 : item.supplyType === 'food' ? .4 : .5, 10) : 0;

/** Only slotted weapons are carried, including the one in hand (counted once).
 * Stored ownership and cosmetic skins have no mass. Ammo changes live; reloading
 * merely transfers it. Armor stays on the body even when its protection is spent.
 */
export function equipmentMovement(equipment: ResolvedLoadout, active: number,
  ammunition?: readonly WeaponState[], quickRemaining = equipment.quickCount) {
  const carriedWeapons = equipment.carriedFamilies.map(index => ({ weapon: equipment.weapons[index], index }));
  const weaponsKg = carriedWeapons.reduce((kg, { weapon }) => kg + bounded(weapon.weightKg, 3, 100), 0);
  const ammoKg = carriedWeapons.reduce((kg, { weapon, index }) => {
    const state = ammunition?.[index];
    const rounds = bounded(state?.magazine, weapon.capacity, 200) + bounded(state?.reserve, weapon.reserve, 999);
    return kg + rounds * roundWeightKg(weapon.caliberMm);
  }, 0);
  // Non-expedition exercises keep an immutable loadout but spend their quick stack.
  const spent = Math.max(0, equipment.quickCount - bounded(quickRemaining, equipment.quickCount, 99));
  const suppliesKg = Math.max(0, bounded(equipment.suppliesWeightKg, 0, 1000) - spent * supplyWeightKg(equipment.quickItem));
  const totalKg = weaponsKg + ammoKg + suppliesKg + bounded(equipment.armorWeightKg, 0, 100);
  // Weight taxes every carried kilogram; armor's existing mobility measures bulk.
  const carried = Math.max(.35, Math.min(1, bounded(equipment.mobility, 1, 1) / (1 + totalKg * .006)));
  const inHand = Math.max(.25, bounded(equipment.weapons[equipment.carriedFamilies.includes(active) ? active : equipment.carriedFamilies[0]]?.mobility, 1, 1.15));
  const movement = Math.max(.2, Math.min(1, carried * inHand));
  return { totalKg, weaponsKg, ammoKg, suppliesKg, carried, inHand, movement,
    jumpVelocity: .5 + .5 * movement, aimSpeed: Math.max(.25, (.35 + .65 * carried) * inHand) };
}
