import { validWeaponIndex } from './fps-rules';

export const SIDEARM_FAMILY = 2;
export const EXTRA_SLOT_ID = 'slot-extra';
export interface CarrySlots { main: number; extra: number | null }
export const isMainWeapon = (family: unknown): family is number => validWeaponIndex(family) && family !== SIDEARM_FAMILY;
export function restoreCarrySlots(value: unknown, owned: readonly string[]): CarrySlots {
  const raw = value && typeof value === 'object' ? value as Partial<CarrySlots> : {};
  const main = isMainWeapon(raw.main) ? raw.main : 0;
  const extra = owned.includes(EXTRA_SLOT_ID) && isMainWeapon(raw.extra) && raw.extra !== main ? raw.extra : null;
  return { main, extra };
}
/** Keyboard slots are main, sidearm, then the optional second main. Family IDs stay stable. */
export function carriedFamilies(profile: { carry?: CarrySlots; owned: readonly string[] }): number[] {
  const carry = restoreCarrySlots(profile.carry, profile.owned);
  return [carry.main, SIDEARM_FAMILY, ...(carry.extra === null ? [] : [carry.extra])];
}

/** A found main replaces the held main slot; when holding a pistol, use main. */
export function pickupSlot(profile: { carry?: CarrySlots; owned: readonly string[] }, family: number, active: number): 'main' | 'extra' | 'sidearm' {
  if (family === SIDEARM_FAMILY) return 'sidearm';
  const carry = restoreCarrySlots(profile.carry, profile.owned);
  if (family === carry.main) return 'main';
  if (family === carry.extra || active === carry.extra) return 'extra';
  return 'main';
}
