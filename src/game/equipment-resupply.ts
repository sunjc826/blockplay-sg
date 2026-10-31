import { startingMagazineInventory } from './ammo-pools';
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
/** Refill physical pouches, preserving loaded magazines, chambers and reload progress. */
export function resupplyEquipment(states: WeaponState[], specs: readonly WeaponSpec[], carried: readonly number[], supplies: Record<string, number>, stock: EquipmentStock) {
  let rounds = 0, items = 0;
  const inventory = states[carried[0]]?.magazineInventory;
  if (stock.ammunition && inventory) {
    // Refill vacancies only; existing extended magazines and reloads stay put.
    const goal = startingMagazineInventory(specs, carried);
    for (let slot = 0; slot < inventory.slots.length; slot++) {
      if (inventory.slots[slot] || !goal.slots[slot]) continue;
      const mag = goal.slots[slot]!;
      // A grabbed magazine still belongs to this pouch until it is seated.
      if (carried.some(i => states[i].pendingMagazine && states[i].reloadSlot === slot)) continue;
      inventory.slots[slot] = { ...mag }; rounds += mag.capacity;
    }
  }
  for (const [id, amount] of Object.entries(stock.supplies)) {
    const item = itemById(id); if (item?.category !== 'consumable' || !Number.isFinite(amount) || amount < 0) continue;
    const goal = Math.min(consumableLimit(item), Math.floor(amount)), held = supplies[id] ?? 0;
    if (held < goal) { items += goal - held; supplies[id] = goal; }
  }
  return { rounds, items };
}
