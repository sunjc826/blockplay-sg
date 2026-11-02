import { fullLoad, type AmmoSpec, type WeaponState } from './fps-rules';
import { addReserveMagazines, magazineCapacity, reserveRoom } from './magazine-inventory';

/** Full means ready to fire, including after an interrupted reload. */
export function needsAmmoRefill(state: WeaponState, spec: AmmoSpec) {
  return state.magazine < fullLoad({ ...spec, capacity: magazineCapacity(state, spec) })
    || state.magazineOut === true || state.chambered === false
    || !!state.pendingMagazine || !!state.reloadRemaining || !!state.reloadSaved
    || !!state.magazineInventory && reserveRoom(state);
}

/** Restock only vacant pouches; preserve extended magazines and other calibres. */
export function refillAmmo(state: WeaponState, spec: AmmoSpec) {
  if (!needsAmmoRefill(state, spec)) return false;
  const inventory = state.magazineInventory;
  if (state.pendingMagazine && inventory && state.reloadSlot !== undefined) {
    inventory.slots[state.reloadSlot] = state.pendingMagazine;
    inventory.heldSlots = inventory.heldSlots?.filter(slot => slot !== state.reloadSlot);
  }
  state.magazine = fullLoad({ ...spec, capacity: magazineCapacity(state, spec) });
  state.chambered = true; state.magazineOut = false;
  state.reloadRemaining = 0; state.reloadSaved = 0; state.reloadEmpty = false;
  delete state.pendingMagazine; delete state.reloadSlot; delete state.reloadCapacity;
  if (inventory) addReserveMagazines(state, inventory.slots.length);
  return true;
}
