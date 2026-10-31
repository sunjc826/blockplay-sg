import { grenadeEffectLines } from './grenade-catalog';
import { ARMORY_CATALOG, consumableLimit, itemById, type ShopItem } from './armory-catalog';
import { supplyProfile, type SupplyStyle } from './fps-healing';
import { FOOD_EFFECTS, foodEffectLines } from './food-effects';

/**
 * Supplies are carried on a belt of fixed slots, one per kind of job, rather
 * than as one quick item: a player reaches for "a bandage", not for a
 * catalogue entry. A slot holds every item of its kind; which one comes out
 * is decided when it is used (`pickUtility`).
 */
export type UtilityKind = 'food' | 'bandage' | 'first-aid' | 'plates' | 'ammo' | 'grenade';
export interface UtilitySlotSpec { kind: UtilityKind; label: string; key: string }
/** Left to right on the HUD; the key uses that slot (1–3 are the weapons). */
export const UTILITY_SLOTS: readonly UtilitySlotSpec[] = [
  { kind: 'food', label: 'Food', key: '4' },
  { kind: 'bandage', label: 'Bandage', key: '5' },
  { kind: 'first-aid', label: 'First aid', key: '6' },
  { kind: 'plates', label: 'Plates', key: '7' },
  { kind: 'ammo', label: 'Ammo', key: '8' },
  { kind: 'grenade', label: 'Grenade', key: '9' },
];
export const KIND_OF_STYLE: Readonly<Record<SupplyStyle, UtilityKind>> = { eat: 'food', bandage: 'bandage', medkit: 'first-aid', plates: 'plates', ammo: 'ammo' };

/** The slot a supply goes in: the same reading `supplyProfile` uses to choose how the hands use it. */
export function utilityKind(item: ShopItem | undefined): UtilityKind | null {
  if (item?.grenade) return 'grenade';
  return item?.category === 'consumable' ? KIND_OF_STYLE[supplyProfile(item).style] : null;
}
export const utilitySlot = (kind: string) => UTILITY_SLOTS.find(slot => slot.kind === kind);
/** KeyboardEvent.key is the digit for both the number row and the numeric keypad. */
export const utilitySlotForKey = (key: string) => UTILITY_SLOTS.find(slot => slot.key === key);

/** Held counts, cleaned: only consumables, whole numbers, capped as the profile caps them. */
export function heldSupplies(consumables: Readonly<Record<string, number>>): Record<string, number> {
  const held: Record<string, number> = {};
  for (const [id, count] of Object.entries(consumables)) {
    if (itemById(id)?.category !== 'consumable' || typeof count !== 'number' || !Number.isFinite(count)) continue;
    const whole = Math.max(0, Math.min(consumableLimit(itemById(id)), Math.floor(count)));
    if (whole) held[id] = whole;
  }
  return held;
}

/** What the player is short of, which decides the item a slot hands out. */
export interface UtilityNeed { health: number; maxHealth: number }

/**
 * The item a slot hands out. A food the player chose for the food slot comes
 * out while any is held, since its effects are why it was chosen. Otherwise
 * ("Auto") healing takes the smallest item that still covers the wound, so a
 * graze does not spend a full meal, and the largest when nothing covers it.
 * Ties go to the catalogue's order, so the choice is stable from frame to frame.
 */
export function pickUtility(kind: UtilityKind, held: Readonly<Record<string, number>>, need?: UtilityNeed, chosenFood?: string | null, chosenGrenade?: string | null): ShopItem | undefined {
  if (kind === 'grenade' && chosenGrenade && (held[chosenGrenade] ?? 0) > 0 && itemById(chosenGrenade)?.grenade) return itemById(chosenGrenade);
  if (kind === 'food' && chosenFood && (held[chosenFood] ?? 0) > 0) {
    const chosen = itemById(chosenFood);
    if (utilityKind(chosen) === 'food') return chosen;
  }
  const items = ARMORY_CATALOG.filter(item => (held[item.id] ?? 0) > 0 && utilityKind(item) === kind);
  if (kind === 'grenade') return items[0];
  if (items.length < 2) return items[0];
  const heal = (item: ShopItem) => item.effect?.health ?? 0;
  const missing = need ? Math.max(0, need.maxHealth - need.health) : 0;
  const covering = items.filter(item => heal(item) >= missing);
  return covering.length
    ? covering.reduce((best, item) => heal(item) < heal(best) ? item : best)
    : items.reduce((best, item) => heal(item) > heal(best) ? item : best);
}

export interface UtilitySlotView {
  kind: UtilityKind; label: string; key: string;
  /** Everything of this kind on the belt. */
  count: number;
  /** What using the slot now would take out, if anything. */
  next: { id: string; name: string; effect: string } | null;
  /** Food only: the next item is the player's pick rather than Auto's. */
  chosen?: boolean;
}
const effectLine = (item: ShopItem) => item.grenade ? grenadeEffectLines(item.grenade).join(' · ') : [item.effect?.health && `+${item.effect.health} HP`, item.effect?.armor && `+${item.effect.armor} AP`, item.effect?.reserve && '+2 MAGS',
  ...(item.foodEffects ?? []).map(effect => FOOD_EFFECTS[effect.kind].label)].filter(Boolean).join(' · ');

/** The belt as the HUD draws it: every slot, empty ones included, so the layout never shifts. */
export function utilityBelt(held: Readonly<Record<string, number>>, need?: UtilityNeed, chosenFood?: string | null, chosenGrenade?: string | null): UtilitySlotView[] {
  return UTILITY_SLOTS.map(slot => {
    const count = ARMORY_CATALOG.reduce((total, item) => total + (utilityKind(item) === slot.kind ? held[item.id] ?? 0 : 0), 0);
    const item = pickUtility(slot.kind, held, need, chosenFood, chosenGrenade);
    const chosen = !!item && (slot.kind === 'food' && item.id === chosenFood || slot.kind === 'grenade' && item.id === chosenGrenade);
    return { ...slot, count, next: item ? { id: item.id, name: item.name, effect: effectLine(item) } : null, ...(['food', 'grenade'].includes(slot.kind) ? { chosen } : {}) };
  });
}

/** One entry in the food picker. `id` null is Auto. */
export interface FoodOption { id: string | null; name: string; tier: ShopItem['tier'] | null; count: number; health: number; effects: string[] }
/**
 * The food picker's entries: Auto first, then every food carried, lowest tier
 * first. Auto's line says what it would hand out right now.
 */
export function foodOptions(held: Readonly<Record<string, number>>, need?: UtilityNeed): FoodOption[] {
  const foods = ARMORY_CATALOG.filter(item => (held[item.id] ?? 0) > 0 && utilityKind(item) === 'food');
  const auto = pickUtility('food', held, need);
  return [
    { id: null, name: 'Auto', tier: null, count: foods.reduce((n, item) => n + held[item.id], 0), health: auto?.effect?.health ?? 0,
      effects: [auto ? `Heals to need · now ${auto.name}` : 'Heals to need'] },
    ...foods.map(item => ({ id: item.id, name: item.name, tier: item.tier, count: held[item.id], health: item.effect?.health ?? 0, effects: foodEffectLines(item.foodEffects) })),
  ];
}

/** The supplies' carried weight, for whatever is still on the belt. */
export const beltWeightKg = (held: Readonly<Record<string, number>>, weightOf: (item?: ShopItem) => number) =>
  Object.entries(held).reduce((kg, [id, count]) => kg + weightOf(itemById(id)) * Math.max(0, Math.min(consumableLimit(itemById(id)), Number.isFinite(count) ? count : 0)), 0);

export function grenadeOptions(held: Readonly<Record<string, number>>): FoodOption[] {
 const items = ARMORY_CATALOG.filter(i => i.grenade && (held[i.id] ?? 0) > 0);
 return [{ id: null, name: 'Auto', tier: null, count: items.reduce((n, i) => n + held[i.id], 0), health: 0, effects: [items[0] ? `Catalogue order · now ${items[0].name}` : 'Catalogue order'] }, ...items.map(i => ({ id: i.id, name: i.name, tier: i.tier, count: held[i.id], health: 0, effects: grenadeEffectLines(i.grenade) }))];
}
