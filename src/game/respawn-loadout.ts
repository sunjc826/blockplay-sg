import { itemById, isShopFamily } from './armory-catalog';
import { expireRentals, restoreProfile, type ArmoryProfile } from './armory-state';
import { EXTRA_SLOT_ID, isMainWeapon, SIDEARM_FAMILY, type CarrySlots } from './armory-slots';
import { FPS_WEAPONS } from './fps-rules';
import { hasItemAccess } from './weapon-rentals';

export interface RespawnLoadoutSelection { variants: string[]; carry: CarrySlots }
export function selectedRespawnLoadout(profile: ArmoryProfile): RespawnLoadoutSelection {
  const ready = expireRentals(profile);
  return { variants: ready.guns.map(gun => gun.variant), carry: { ...ready.carry } };
}
/** Resolve only weapon choices against the inventory already admitted to the match. */
export function applyRespawnLoadout(inventory: ArmoryProfile, selection: unknown): ArmoryProfile | null {
  if (!selection || typeof selection !== 'object') return null;
  const raw = selection as Partial<RespawnLoadoutSelection>;
  if (!Array.isArray(raw.variants) || raw.variants.length !== FPS_WEAPONS.length || !raw.carry || typeof raw.carry !== 'object') return null;
  const { main, extra } = raw.carry;
  if (!isMainWeapon(main) || !isShopFamily(main) || (extra !== null && (!isMainWeapon(extra) || !isShopFamily(extra) || extra === main || !inventory.owned.includes(EXTRA_SLOT_ID)))) return null;
  const ready = restoreProfile(JSON.stringify(inventory));
  for (const family of [main, ...(extra === null ? [] : [extra]), SIDEARM_FAMILY]) {
    const id = raw.variants[family], item = typeof id === 'string' ? itemById(id) : undefined;
    if (!item || item.category !== 'weapon' || item.family !== family || !hasItemAccess(ready, item.id)) return null;
    ready.guns[family] = { ...ready.guns[family], variant: item.id };
  }
  ready.carry = { main, extra };
  return ready;
}
