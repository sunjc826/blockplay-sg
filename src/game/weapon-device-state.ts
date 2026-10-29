import { hasLaser, hasLight, type WeaponAccessories } from './weapon-accessories';

export const createWeaponDevices = () => ({ laser: true, light: true });
export type WeaponDeviceState = ReturnType<typeof createWeaponDevices>;

export function fittedWeaponDevices(state: WeaponDeviceState, accessories?: WeaponAccessories) {
  return { laser: hasLaser(accessories) && state.laser, light: hasLight(accessories) && state.light };
}

/** B and L operate independent emitters, including when they share a housing. */
export function toggleWeaponDevice(state: WeaponDeviceState, accessories: WeaponAccessories | undefined, device: 'laser' | 'light') {
  if (!(device === 'laser' ? hasLaser(accessories) : hasLight(accessories))) return false;
  state[device] = !state[device];
  return true;
}

/** The existing touch/pilot API switches all fitted emitters together. */
export function toggleWeaponRail(state: WeaponDeviceState, accessories?: WeaponAccessories) {
  if (!accessories?.rail) return false;
  const active = fittedWeaponDevices(state, accessories), next = !(active.laser || active.light);
  if (hasLaser(accessories)) state.laser = next;
  if (hasLight(accessories)) state.light = next;
  return true;
}
