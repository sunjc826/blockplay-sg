import { createLoadout, type AmmoSpec, type WeaponSpec, type WeaponState } from './fps-rules';
import { addReserveMagazines, magazineGroup, magazineOf, restoreMagazine, rigSlotCount, type MagazineInventory, type MagazineSpec } from './magazine-inventory';

/** Legacy checkpoint/pickup API. Live reserves are whole magazines in rig slots. */
export const MAX_RESERVE = 999;
type PoolSpec = AmmoSpec & MagazineSpec & Pick<WeaponSpec, 'reserve'>;
export type AmmoPools = Record<string, number>;
export const ammoCalibre = (mm: number) => mm.toFixed(2);
export const reservePoolOf = (state: WeaponState) => state.magazineInventory;
const rounds = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;

/** One physical carrying budget, including when two weapons share magazines. */
export function startingMagazineInventory(specs: readonly PoolSpec[], carried: readonly number[]): MagazineInventory {
  const limit = rigSlotCount(specs), slots: MagazineInventory['slots'] = Array.from({ length: limit }, () => null);
  const pistol = carried.find(i => specs[i].caliberMm === 9), mains = carried.filter(i => i !== pistol);
  const mainPositions = limit - (pistol === undefined ? 0 : 2);
  // Bulkier feeds start with three containers; rifles start with four. Extra
  // guns divide this allocation, while upgraded rigs add real side pouches.
  const budget = mains.length > 1 ? mainPositions : Math.min(mainPositions, (specs[mains[0]]?.feed && specs[mains[0]].feed !== 'magazine' ? 3 : 4) + limit - 6);
  let cursor = 0;
  for (; cursor < budget && mains.length; cursor++) slots[cursor] = magazineOf(specs[mains[cursor % mains.length]], mains[cursor % mains.length]);
  if (pistol !== undefined) for (let i = 0; i < 2 && cursor < limit; i++) slots[cursor++] = magazineOf(specs[pistol], pistol);
  return { slots };
}
export function startingAmmoPools(specs: readonly PoolSpec[], carried: readonly number[]): AmmoPools {
  const result: AmmoPools = {};
  for (const index of carried) result[magazineGroup(specs[index])] = 0;
  for (const mag of startingMagazineInventory(specs, carried).slots) if (mag) result[mag.group] += mag.capacity;
  return result;
}
/** Old round-valued pickups now provide whole containers; never an invisible pool. */
export function addReserveRounds(state: WeaponState, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!state.magazineInventory) {
    const added = Math.max(0, Math.min(amount, MAX_RESERVE - state.reserve)); state.reserve += added; return added;
  }
  const capacity = state.reserveMagazine!.capacity;
  return addReserveMagazines(state, Math.max(1, Math.floor(amount / capacity))) * capacity;
}
export function ammoPools(states: readonly WeaponState[], specs: readonly PoolSpec[], carried: readonly number[]): AmmoPools {
  return Object.fromEntries(carried.map(i => [magazineGroup(specs[i]), states[i].reserve]));
}
function linkReserves(states: WeaponState[], specs: readonly PoolSpec[], carried: readonly number[], inventory: MagazineInventory) {
  states.forEach((state, index) => {
    Object.defineProperty(state, 'reserve', { value: 0, writable: true, enumerable: true, configurable: true });
    delete state.magazineInventory; delete state.magazineGroup; delete state.reserveMagazine;
    if (!carried.includes(index)) { delete state.pendingMagazine; return; }
    const spec = specs[index], group = magazineGroup(spec);
    state.magazineInventory = inventory; state.magazineGroup = group; state.reserveMagazine = magazineOf(spec, index);
    Object.defineProperty(state, 'reserve', { enumerable: true, configurable: true,
      get: () => inventory.slots.reduce((sum, mag) => sum + (mag?.group === group ? mag.capacity : 0), 0),
      // Kept for debug tools and legacy fixtures. Gameplay uses explicit magazine
      // operations so changing one weapon never repacks the player's rig.
      set: (value: number) => {
        inventory.slots.forEach((mag, slot) => { if (mag?.group === group) inventory.slots[slot] = null; });
        addReserveMagazines(state, Math.floor(rounds(value) / spec.capacity));
      } });
  });
  return states;
}
export function createPooledLoadout(specs: readonly PoolSpec[], carried: readonly number[], checkpoint?: {
  ammunition: readonly WeaponState[]; ammoPools?: AmmoPools; magazineInventory?: MagazineInventory;
}): WeaponState[] {
  const states = createLoadout(specs);
  if (checkpoint) states.forEach((fresh, index) => {
    const saved = checkpoint.ammunition[index]; if (!saved) return;
    const capacity = Math.max(1, Math.min(200, rounds(saved.loadedCapacity, specs[index].capacity)));
    states[index] = { ...saved, loadedCapacity: capacity, magazine: Math.min(capacity + (specs[index].bolt === 'open' ? 0 : 1), rounds(saved.magazine, fresh.magazine)),
      reserve: 0, cooldown: 0, reloadRemaining: 0 };
    const pending = restoreMagazine(saved.pendingMagazine);
    if (pending?.group === magazineGroup(specs[index])) states[index].pendingMagazine = pending;
    else delete states[index].pendingMagazine;
  });
  const savedInventory = checkpoint?.magazineInventory ?? checkpoint?.ammunition.find(s => s.magazineInventory)?.magazineInventory;
  let inventory: MagazineInventory;
  if (savedInventory && Array.isArray(savedInventory.slots)) {
    inventory = { slots: Array.from({ length: rigSlotCount(specs) }, (_, i) => restoreMagazine(savedInventory.slots[i])) };
  } else if (checkpoint) {
    inventory = { slots: Array.from({ length: rigSlotCount(specs) }, () => null) };
    const linked = linkReserves(states, specs, carried, inventory), seen = new Set<string>();
    const legacyPools = { ...checkpoint.ammoPools };
    for (const i of carried) {
      const key = magazineGroup(specs[i]); if (seen.has(key)) continue; seen.add(key);
      const calibre = ammoCalibre(specs[i].caliberMm);
      // Consume an old shared calibre only once, never multiply it across feeds.
      const amount = legacyPools[key] ?? legacyPools[calibre] ?? carried.filter(j => magazineGroup(specs[j]) === key).reduce((sum, j) => sum + rounds(checkpoint.ammunition[j]?.reserve), 0);
      delete legacyPools[calibre];
      if (checkpoint.ammoPools && !(key in checkpoint.ammoPools) && !(calibre in checkpoint.ammoPools)) continue;
      addReserveMagazines(linked[i], Math.floor(amount / specs[i].capacity));
      if (checkpoint.ammoPools?.[calibre] !== undefined) legacyPools[calibre] = 0;
    }
  } else inventory = startingMagazineInventory(specs, carried);
  inventory.heldSlots = [];
  for (const i of carried) {
    const state = states[i], slot = state.reloadSlot;
    if (!state.pendingMagazine) continue;
    if (!Number.isInteger(slot) || slot! < 0 || slot! >= inventory.slots.length || inventory.heldSlots.includes(slot!)) { delete state.pendingMagazine; continue; }
    inventory.slots[slot!] = null; inventory.heldSlots.push(slot!);
  }
  return linkReserves(states, specs, carried, inventory);
}
/** A found weapon brings its loaded magazine. Compatible spares keep both
 * their capacity and pouch position; abandoned incompatible spares leave. */
export function replacePooledWeapon(states: WeaponState[], previous: readonly PoolSpec[], previousCarry: readonly number[],
  specs: readonly PoolSpec[], carried: readonly number[], family: number) {
  const inventory = states[previousCarry[0]]?.magazineInventory ?? startingMagazineInventory(previous, previousCarry);
  const groups = new Set(carried.map(i => magazineGroup(specs[i])));
  inventory.slots = inventory.slots.map(mag => mag && groups.has(mag.group) ? mag : null);
  states[family] = { ...createLoadout(specs)[family], loadedCapacity: specs[family].capacity };
  inventory.heldSlots = carried.flatMap(i => states[i].pendingMagazine && states[i].reloadSlot !== undefined ? [states[i].reloadSlot!] : []);
  return linkReserves(states, specs, carried, inventory);
}
