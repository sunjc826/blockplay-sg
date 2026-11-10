import { refillCarrier } from './reserve-carrier';
import { startingMagazineInventory } from './ammo-pools';
import { consumableLimit, itemById } from './armory-catalog';
import type { WeaponSpec, WeaponState } from './fps-rules';
import { availableMagazineSlots, type MagazineInventory, type RigMagazine } from './magazine-inventory';

/** A reusable station definition: other modes can provide different stock. */
export interface EquipmentStock { ammunition: boolean; supplies: Readonly<Record<string, number>> }
export const RANGE_EQUIPMENT_STOCK: EquipmentStock = { ammunition: true, supplies: {
  'grenade-frag': 2, 'grenade-smoke': 2, 'kit-bandage': 3, 'kit-first-aid': 1, 'kit-plates': 2, 'kit-ammo': 2,
} };
export function rangeEquipmentStock(held: Readonly<Record<string, number>>, stowed: readonly string[] = []): EquipmentStock {
  const supplies = { ...RANGE_EQUIPMENT_STOCK.supplies };
  for (const [id, count] of Object.entries(held)) if (Number.isFinite(count)) supplies[id] = Math.max(supplies[id] ?? 0, count);
  for (const id of stowed) delete supplies[id];
  return { ammunition: true, supplies };
}
/** Top each feed up to its starting count using empty pouches only; nothing carried
 * is ever swapped out. Counting by feed rather than pouch position means a spent
 * launcher magazine is not replaced by a rifle one because of where it was carried.
 * Returns the rounds added. */
function refillPouches(states: WeaponState[], specs: readonly WeaponSpec[], carried: readonly number[], inventory: MagazineInventory) {
  const goal = startingMagazineInventory(specs, carried).slots;
  // Above zero is spare, below is short. A grabbed magazine still counts for its feed.
  const surplus = new Map<string, number>();
  const count = (group: string, by: number) => surplus.set(group, (surplus.get(group) ?? 0) + by);
  for (const mag of inventory.slots) if (mag) count(mag.group, 1);
  for (const family of carried) if (states[family].pendingMagazine) count(states[family].pendingMagazine!.group, 1);
  for (const mag of goal) if (mag) count(mag.group, -1);
  const short = (mag: RigMagazine) => surplus.get(mag.group)! < 0;
  // A grabbed magazine still belongs to its pouch until it is seated.
  const reserved = (slot: number) => carried.some(i => states[i].pendingMagazine && states[i].reloadSlot === slot);
  const freeSlots = (mag: RigMagazine) => states[mag.family] ? availableMagazineSlots(states[mag.family], mag).filter(slot => !reserved(slot)) : [];
  let rounds = 0;
  const place = (mag: RigMagazine, slot: number) => { inventory.slots[slot] = { ...mag }; rounds += mag.capacity; count(mag.group, 1); };
  // Each magazine's usual pouch first, then any pouch it fits.
  goal.forEach((mag, slot) => { if (mag && short(mag) && freeSlots(mag).includes(slot)) place(mag, slot); });
  for (const mag of goal) if (mag && short(mag) && freeSlots(mag).length) place(mag, freeSlots(mag)[0]);
  return rounds;
}
/** Refill physical pouches, preserving loaded magazines, chambers and reload progress. */
export function resupplyEquipment(states: WeaponState[], specs: readonly WeaponSpec[], carried: readonly number[], supplies: Record<string, number>, stock: EquipmentStock, carrierAvailable = true) {
  let rounds = 0, items = 0;
  const inventory = states[carried[0]]?.magazineInventory;
  if (stock.ammunition && inventory) {
    rounds = refillPouches(states, specs, carried, inventory);
    if (inventory.carrier && (inventory.carrier.kind === 'pack' || carrierAvailable)) rounds += refillCarrier(inventory.carrier, specs, carried);
  }
  for (const [id, amount] of Object.entries(stock.supplies)) {
    const item = itemById(id); if (item?.category !== 'consumable' || !Number.isFinite(amount) || amount < 0) continue;
    const goal = Math.min(consumableLimit(item), Math.floor(amount)), held = supplies[id] ?? 0;
    if (held < goal) { items += goal - held; supplies[id] = goal; }
  }
  return { rounds, items };
}
