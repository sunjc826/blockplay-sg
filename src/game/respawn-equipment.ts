import { expireRentals, type ArmoryProfile } from './armory-state';

/** Keep the expedition's accounting, but issue the equipment chosen before entry. */
export function respawnEquipment(current: ArmoryProfile, starting: ArmoryProfile): ArmoryProfile {
  return expireRentals({
    ...current,
    // Field pickups are licences for the previous life, not permanent locker ownership.
    owned: [...starting.owned],
    rentals: { ...starting.rentals },
    guns: structuredClone(starting.guns),
    carry: { ...starting.carry },
    rig: starting.rig,
    plate: starting.plate,
    vision: starting.vision,
    vehicleSkins: { ...starting.vehicleSkins },
  });
}
