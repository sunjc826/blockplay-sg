import { validWeaponIndex } from './fps-rules';
import type { WeaponSpec, WeaponState, WeaponFeed } from './fps-rules';

export interface RigMagazine {
  group: string; capacity: number; family: number; caliberMm: number; feed: WeaponFeed;
}
export interface MagazineInventory { slots: (RigMagazine | null)[]; heldSlots?: number[]; pouchCount?: number }
// Front addresses remain compatible with existing saves. Rear addresses never
// move when a different rig adds side pouches.
export const REAR_MAGAZINE_OFFSET = 9;
export const doubleStackMagazine = (mag: RigMagazine | undefined | null) => mag?.family === 12 && mag.caliberMm === 10.36 && mag.feed === 'magazine';
export const inventoryPouches = (inventory: MagazineInventory) => inventory.pouchCount ?? Math.min(9, inventory.slots.length);
export const magazinePouch = (slot: number) => slot >= REAR_MAGAZINE_OFFSET ? slot - REAR_MAGAZINE_OFFSET : slot;
export function magazineSlotOrder(inventory: MagazineInventory) {
  return [0, 1, 2, 3, 4, 5, 8, 6, 7].filter(i => i < inventoryPouches(inventory))
    .flatMap(i => i + REAR_MAGAZINE_OFFSET < inventory.slots.length ? [i, i + REAR_MAGAZINE_OFFSET] : [i]);
}
/** Rear pockets accept only Intervention magazines; a pouch never mixes feeds. */
export function magazineSlotFits(inventory: MagazineInventory, slot: number, mag: RigMagazine) {
  const pouch = magazinePouch(slot), rear = slot >= REAR_MAGAZINE_OFFSET;
  if (pouch < 0 || pouch >= inventoryPouches(inventory) || slot >= inventory.slots.length) return false;
  const other = inventory.slots[rear ? pouch : pouch + REAR_MAGAZINE_OFFSET];
  return rear ? doubleStackMagazine(mag) && (!other || doubleStackMagazine(other))
    : !other || doubleStackMagazine(mag) && doubleStackMagazine(other);
}
export function availableMagazineSlots(state: WeaponState, mag = state.reserveMagazine) {
  const inventory = state.magazineInventory;
  if (!inventory || !mag) return [];
  return magazineSlotOrder(inventory).filter(slot => inventory.slots[slot] === null &&
    !inventory.heldSlots?.some(held => magazinePouch(held) === magazinePouch(slot)) && magazineSlotFits(inventory, slot, mag));
}
export type MagazineSpec = Pick<WeaponSpec, 'capacity' | 'caliberMm'> & Partial<Pick<WeaponSpec, 'feed' | 'rigSlots'>>;
export const magazineGroup = (spec: MagazineSpec) => `${spec.caliberMm.toFixed(2)}:${spec.feed ?? 'magazine'}`;
export const rigSlotCount = (specs: readonly MagazineSpec[]) => Math.max(6, Math.min(9, Math.floor(specs.find(s => s.rigSlots)?.rigSlots ?? 6)));
export const magazineCapacity = (state: WeaponState, spec: Pick<WeaponSpec, 'capacity'>) => state.loadedCapacity ?? spec.capacity;
export const magazineOf = (spec: MagazineSpec, family: number): RigMagazine => ({ group: magazineGroup(spec), capacity: spec.capacity,
  family, caliberMm: spec.caliberMm, feed: spec.feed ?? 'magazine' });
export function spareMagazines(state: WeaponState) {
  return state.magazineInventory?.slots.filter(mag => mag?.group === state.magazineGroup).length ?? 0;
}
export function nextMagazineSlot(state: WeaponState) {
  if (!state.magazineInventory) return -1;
  // Torso top row, torso lower row, then upper and lower side pouches.
  return magazineSlotOrder(state.magazineInventory).find(i => state.magazineInventory?.slots[i]?.group === state.magazineGroup) ?? -1;
}
export function reserveRoom(state: WeaponState) {
  return state.magazineInventory ? availableMagazineSlots(state).length > 0 : state.reserve < 999;
}
/** A grabbed magazine belongs to this gun until seated, even across interruptions. */
export function takeRigMagazine(state: WeaponState) {
  if (state.pendingMagazine) return;
  const inventory = state.magazineInventory;
  if (!inventory) return;
  let slot = state.reloadSlot ?? -1;
  if (inventory.slots[slot]?.group !== state.magazineGroup) slot = nextMagazineSlot(state);
  if (slot < 0) return;
  state.reloadSlot = slot;
  state.pendingMagazine = inventory.slots[slot]!;
  inventory.slots[slot] = null;
  (inventory.heldSlots ??= []).push(slot);
}
export function addReserveMagazines(state: WeaponState, count: number, magazine = state.reserveMagazine) {
  const inventory = state.magazineInventory;
  if (!inventory || !magazine || !Number.isFinite(count)) return 0;
  let added = 0;
  for (const i of magazineSlotOrder(inventory)) {
    if (added >= Math.max(0, Math.floor(count))) break;
    if (!availableMagazineSlots(state, magazine).includes(i)) continue;
    inventory.slots[i] = { ...magazine }; added++;
  }
  return added;
}
/** Capacity and physical positions survive saves; malformed magazines are rejected. */
export function restoreMagazine(value: unknown): RigMagazine | null {
  if (!value || typeof value !== 'object') return null;
  const mag = value as RigMagazine;
  if (!Number.isInteger(mag.capacity) || mag.capacity < 1 || mag.capacity > 200 || !validWeaponIndex(mag.family) ||
    ![5.56, 7.62, 9, 10.36, 12.7, 20].includes(mag.caliberMm) || !['magazine', 'drum', 'belt'].includes(mag.feed) || mag.group !== magazineGroup(mag)) return null;
  return { group: mag.group, capacity: mag.capacity, family: mag.family, caliberMm: mag.caliberMm, feed: mag.feed };
}
