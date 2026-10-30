import { ammoCalibre, addReserveRounds, startingAmmoPools } from './ammo-pools';
import { consumableLimit, itemById } from './armory-catalog';
import type { WeaponSpec, WeaponState } from './fps-rules';

/** A reusable station definition: other modes can provide different stock. */
export interface EquipmentStock { ammunition: boolean; supplies: Readonly<Record<string, number>> }
export const RANGE_EQUIPMENT_STOCK: EquipmentStock = { ammunition: true, supplies: {
  'grenade-frag': 2, 'grenade-smoke': 2, 'kit-bandage': 3, 'kit-first-aid': 1, 'kit-plates': 2, 'kit-ammo': 2,
} };
export function rangeEquipmentStock(held: Readonly<Record<string, number>>): EquipmentStock {
  const supplies = { ...RANGE_EQUIPMENT_STOCK.supplies };
  for (const [id, count] of Object.entries(held)) if (Number.isFinite(count)) supplies[id] = Math.max(supplies[id] ?? 0, count);
  return { ammunition: true, supplies };
}
/** Top up each carried calibre once. Preserve loaded magazines, chambers and excess reserves. */
export function resupplyEquipment(states: WeaponState[], specs: readonly WeaponSpec[], carried: readonly number[], supplies: Record<string, number>, stock: EquipmentStock) {
  let rounds = 0, items = 0;
  const seen = new Set<string>(), starting = startingAmmoPools(specs, carried);
  if (stock.ammunition) for (const family of carried) {
    const key = ammoCalibre(specs[family].caliberMm);
    if (seen.has(key)) continue; seen.add(key);
    rounds += addReserveRounds(states[family], Math.max(0, starting[key] - states[family].reserve));
  }
  for (const [id, amount] of Object.entries(stock.supplies)) {
    const item = itemById(id); if (item?.category !== 'consumable' || !Number.isFinite(amount) || amount < 0) continue;
    const goal = Math.min(consumableLimit(item), Math.floor(amount)), held = supplies[id] ?? 0;
    if (held < goal) { items += goal - held; supplies[id] = goal; }
  }
  return { rounds, items };
}
