import type { ArmoryProfile } from './armory-state';
import { itemById } from './armory-catalog';
import { pickupSlot } from './armory-slots';
import { PROXY_REWARDS } from './proxy-operations';

/** Equip the crate's already selected reward, preserving the player's other main slot. */
export function recoverProxyWeapon(profile: ArmoryProfile, rewardId: string, active: number): ArmoryProfile {
  if (!Object.values(PROXY_REWARDS).some(pool => (pool as readonly string[]).includes(rewardId))) return profile;
  const item = itemById(rewardId)!, family = item.family!;
  const next = structuredClone(profile);
  next.owned = [...new Set([...next.owned, item.id])];
  next.guns[family].variant = item.id;
  const slot = pickupSlot(next, family, active);
  if (slot !== 'sidearm') next.carry = { ...next.carry, [slot]: family };
  return next;
}
