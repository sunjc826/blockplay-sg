import type { ArmoryProfile } from './armory-state';

/** Keep the expedition's accounting, but issue the equipment chosen before entry. */
export function respawnEquipment(current: ArmoryProfile, starting: ArmoryProfile): ArmoryProfile {
  return {
    ...current,
    guns: structuredClone(starting.guns),
    carry: { ...starting.carry },
    rig: starting.rig,
    plate: starting.plate,
    vision: starting.vision,
  };
}
