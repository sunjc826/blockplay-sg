import type { WeaponSpec, WeaponState, WeaponFeed } from './fps-rules';

export interface RigMagazine {
  group: string; capacity: number; family: number; caliberMm: number; feed: WeaponFeed;
}
export interface MagazineInventory { slots: (RigMagazine | null)[]; heldSlots?: number[] }
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
  return [0, 1, 2, 3, 4, 5, 8, 6, 7].find(i => state.magazineInventory?.slots[i]?.group === state.magazineGroup) ?? -1;
}
export function reserveRoom(state: WeaponState) {
  return state.magazineInventory ? state.magazineInventory.slots.some((mag, i) => mag === null && !state.magazineInventory!.heldSlots?.includes(i)) : state.reserve < 999;
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
  for (let i = 0; i < inventory.slots.length && added < Math.max(0, Math.floor(count)); i++) {
    if (inventory.slots[i] !== null || inventory.heldSlots?.includes(i)) continue;
    inventory.slots[i] = { ...magazine }; added++;
  }
  return added;
}
/** Capacity and physical positions survive saves; malformed magazines are rejected. */
export function restoreMagazine(value: unknown): RigMagazine | null {
  if (!value || typeof value !== 'object') return null;
  const mag = value as RigMagazine;
  if (!Number.isInteger(mag.capacity) || mag.capacity < 1 || mag.capacity > 200 || !Number.isInteger(mag.family) || mag.family < 0 || mag.family > 7 ||
    ![5.56, 7.62, 9, 12.7].includes(mag.caliberMm) || !['magazine', 'drum', 'belt'].includes(mag.feed) || mag.group !== magazineGroup(mag)) return null;
  return { group: mag.group, capacity: mag.capacity, family: mag.family, caliberMm: mag.caliberMm, feed: mag.feed };
}
