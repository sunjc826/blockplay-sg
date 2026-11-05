import { validWeaponIndex } from './fps-rules';
import { hasItemAccess } from './weapon-rentals';
import { isLauncherMode, primaryWeaponFamily, withWeaponModes } from './weapon-modes';

export const SIDEARM_FAMILY = 2;
export const EXTRA_SLOT_ID = 'slot-extra';
export interface CarrySlots { main: number; extra: number | null }
export const isMainWeapon = (family: unknown): family is number => validWeaponIndex(family) && family !== SIDEARM_FAMILY && !isLauncherMode(family);
export function restoreCarrySlots(value: unknown, owned: readonly string[], rentals?: Record<string, number>): CarrySlots {
  const raw = value && typeof value === 'object' ? value as Partial<CarrySlots> : {};
  const main = isMainWeapon(raw.main) ? raw.main : 0;
  const extra = hasItemAccess({ owned, rentals }, EXTRA_SLOT_ID) && isMainWeapon(raw.extra) && raw.extra !== main ? raw.extra : null;
  return { main, extra };
}
/** Keyboard slots are the mains side by side, then the sidearm last: 1–2–3 with the
 * optional extra main, 1–2 without. Family IDs stay stable. */
export function carriedFamilies(profile: { carry?: CarrySlots; owned: readonly string[]; rentals?: Record<string, number> }): number[] {
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  return withWeaponModes([carry.main, ...(carry.extra === null ? [] : [carry.extra]), SIDEARM_FAMILY]);
}

/** A found main replaces the held main slot; when holding a pistol, use main. */
export function pickupSlot(profile: { carry?: CarrySlots; owned: readonly string[]; rentals?: Record<string, number> }, family: number, active: number): 'main' | 'extra' | 'sidearm' {
  family = primaryWeaponFamily(family); active = primaryWeaponFamily(active);
  if (family === SIDEARM_FAMILY) return 'sidearm';
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  if (family === carry.main) return 'main';
  if (family === carry.extra || active === carry.extra) return 'extra';
  return 'main';
}
