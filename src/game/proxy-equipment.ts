import type { ArmoryProfile } from './armory-state';
import { itemById } from './armory-catalog';
import { pickupSlot } from './armory-slots';
import { PROXY_REWARDS } from './proxy-operations';
import type { WeaponState } from './fps-rules';
import { addReserveMagazines, availableMagazineSlots } from './magazine-inventory';
import { launcherOf } from './weapon-modes';

/** Faction-built cargo arrives with magazines. The SAR retrofit feeds from the rig's standard rifle stock. */
export const comesWithCargoKit = (id: string) => id.startsWith('ff-') || id.startsWith('cc-');

/** Cargo includes its magazine kit. Retain two compatible rifle spares; make
 * room for launcher spares by exchanging excess rifle spares, never other gear. */
export function supplyProxyMagazines(states: WeaponState[], family: number) {
  const launcherFamily = launcherOf(family);
  if (launcherFamily === undefined) { addReserveMagazines(states[family], family === 12 ? 8 : 4); return 0; }
  const rifle = states[family], launcher = states[launcherFamily], slots = rifle.magazineInventory!.slots;
  addReserveMagazines(rifle, 2);
  let free = availableMagazineSlots(launcher).length, rifles = slots.filter(m => m?.group === rifle.magazineGroup).length, exchanged = 0;
  const needed = Math.max(0, 2 - slots.filter(m => m?.group === launcher.magazineGroup).length);
  for (let i = slots.length - 1; i >= 0 && free < needed && rifles > 2; i--) if (slots[i]?.group === rifle.magazineGroup) {
    slots[i] = null; free = availableMagazineSlots(launcher).length; rifles--; exchanged++;
  }
  addReserveMagazines(launcher, needed);
  return exchanged;
}

/** Equip the crate's already selected reward, preserving the player's other main slot. */
export function recoverProxyWeapon(profile: ArmoryProfile, rewardId: string, active: number): ArmoryProfile {
  if (!Object.values(PROXY_REWARDS).some(pool => (pool as readonly string[]).includes(rewardId))) return profile;
  const item = itemById(rewardId)!, family = item.family!;
  const next = structuredClone(profile);
  next.owned = [...new Set([...next.owned, item.id])];
  next.guns[family].variant = item.id;
  const slot = pickupSlot({ ...next, owned: [...next.owned, ...Object.keys(next.rentals)] }, family, active);
  if (slot !== 'sidearm') next.carry = { ...next.carry, [slot]: family };
  return next;
}
