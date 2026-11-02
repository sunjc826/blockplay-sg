import { ARMORY_CATALOG, itemById, type ShopItem } from './armory-catalog';
import { foodEffectLines } from './food-effects';
import { grenadeEffectLines } from './grenade-catalog';
import { supplyProfile } from './fps-healing';

export type UtilityGroup = 'recovery' | 'combat';
export interface UtilityOption { id: string; name: string; tier: ShopItem['tier']; count: number; effects: string[]; seconds: number }
export const UTILITY_HOLD_MS = 280;
export function utilityGroup(item: ShopItem | undefined): UtilityGroup | null {
  if (item?.category !== 'consumable' || item.effect?.reserve || item.specialist) return null;
  return item.grenade ? 'combat' : 'recovery';
}
export function utilityOption(id: string | null, held: Readonly<Record<string, number>>): UtilityOption | null {
  const item = id ? itemById(id) : undefined;
  if (!item || !utilityGroup(item)) return null;
  return { id: item.id, name: item.name, tier: item.tier, count: held[item.id] ?? 0,
    seconds: item.grenade ? .35 : supplyProfile(item).seconds,
    effects: item.grenade ? grenadeEffectLines(item.grenade) : [
      ...(item.effect?.health ? [`+${item.effect.health} HP`] : []),
      ...(item.effect?.armor ? [`+${item.effect.armor} armor`] : []), ...foodEffectLines(item.foodEffects),
    ] };
}
/** Catalogue order is stable; each carried item has one image and a quantity badge. */
export function utilityOptions(group: UtilityGroup, held: Readonly<Record<string, number>>): UtilityOption[] {
  return ARMORY_CATALOG.filter(item => utilityGroup(item) === group && (held[item.id] ?? 0) > 0).map(item => utilityOption(item.id, held)!);
}
/** Only choose a default before the first selection; depleted picks never switch to a different item. */
export function initialUtilityChoice(group: UtilityGroup, held: Readonly<Record<string, number>>, preferred?: string): string | null {
  if (preferred && held[preferred] > 0 && utilityGroup(itemById(preferred)) === group) return preferred;
  const options = utilityOptions(group, held);
  return (group === 'recovery' ? options.find(option => itemById(option.id)?.medical) : undefined)?.id ?? options[0]?.id ?? null;
}
