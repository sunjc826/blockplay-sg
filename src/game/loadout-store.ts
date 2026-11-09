import { ARMORY_CATALOG, consumableLimit, isEnemyIssue, isShopFamily, itemById, type ShopItem } from './armory-catalog';
import { equip, isSupplyCarried, purchase, resolveLoadout, selectCarryWeapon, setSupplyCarried, type ArmoryProfile } from './armory-state';
import { EXTRA_SLOT_ID, SIDEARM_FAMILY, isMainWeapon, restoreCarrySlots } from './armory-slots';
import { hasItemAccess, type WeaponTerm } from './weapon-rentals';
import type { MotorVehicleKind } from './vehicle-rules';

export type LoadoutSlot = 'main' | 'extra' | 'sidearm' | 'rig' | 'plate' | 'vision' | 'supplies' | 'skin' | 'vehicleSkin';
export type LoadoutTarget = { slot: LoadoutSlot; family: number; vehicle: MotorVehicleKind };
export const LOADOUT_SLOTS: readonly { id: LoadoutSlot; label: string }[] = [
  { id: 'main', label: 'Main weapon' }, { id: 'extra', label: 'Extra main' }, { id: 'sidearm', label: 'Sidearm' },
  { id: 'rig', label: 'Carrying rig' }, { id: 'plate', label: 'Armor inserts' }, { id: 'vision', label: 'Vision device' },
  { id: 'supplies', label: 'Supplies' }, { id: 'skin', label: 'Weapon skins' }, { id: 'vehicleSkin', label: 'Vehicle skins' },
];
export const slotLabel = (slot: LoadoutSlot) => LOADOUT_SLOTS.find(s => s.id === slot)!.label;
export const weaponSlot = (slot: LoadoutSlot) => slot === 'main' || slot === 'extra' || slot === 'sidearm';
export function itemFitsSlot(item: ShopItem, target: LoadoutTarget) {
  if (isEnemyIssue(item)) return false;
  if (weaponSlot(target.slot)) return item.category === 'weapon' && item.family !== undefined && isShopFamily(item.family)
    && (target.slot === 'sidearm' ? item.family === SIDEARM_FAMILY : isMainWeapon(item.family));
  return item.category === (target.slot === 'supplies' ? 'consumable' : target.slot);
}
export function slotItem(profile: ArmoryProfile, target: LoadoutTarget): ShopItem | undefined {
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const family = target.slot === 'main' ? carry.main : target.slot === 'extra' ? carry.extra : target.slot === 'sidearm' ? SIDEARM_FAMILY : target.family;
  const id = weaponSlot(target.slot) ? family === null ? undefined : profile.guns[family]?.variant
    : target.slot === 'skin' ? profile.guns[target.family]?.skin : target.slot === 'vehicleSkin' ? profile.vehicleSkins[target.vehicle]
    : target.slot === 'supplies' ? undefined : profile[target.slot];
  return id ? itemById(id) : undefined;
}
/** Validate a destination before spending; equip() alone may replace the main slot. */
export function loadoutEquipError(profile: ArmoryProfile, item: ShopItem, target: LoadoutTarget): string | null {
  if (!itemFitsSlot(item, target)) return 'This item does not fit the selected slot.';
  if (target.slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID)) return 'Rent the extra main slot first. Weapon rental is separate.';
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  if ((target.slot === 'main' && item.family === carry.extra) || (target.slot === 'extra' && item.family === carry.main)) return 'That weapon platform is already in your other main slot. Choose a different platform.';
  if (target.slot === 'skin' && !isShopFamily(target.family)) return 'Choose an available weapon platform.';
  return null;
}
export function equipLoadoutItem(profile: ArmoryProfile, id: string, target: LoadoutTarget) {
  const item = itemById(id);
  const error = item ? loadoutEquipError(profile, item, target) : 'Item unavailable.';
  if (!item || error) return { profile, message: error ?? 'Item unavailable.' };
  if (item.category === 'consumable') {
    if (!(profile.consumables[id] > 0)) return { profile, message: 'Buy this supply before packing it.' };
    return { profile: setSupplyCarried(profile, id, true), message: `${item.name} packed. All owned stock will come with you.` };
  }
  if (!hasItemAccess(profile, id)) return { profile, message: 'Rent this item before equipping it.' };
  let next: ArmoryProfile;
  if (item.category === 'weapon') {
    const family = item.family!;
    const guns = profile.guns.map((gun, i) => i === family ? { ...gun, variant: id, attachments: {} } : gun);
    next = { ...profile, guns };
    if (target.slot === 'main' || target.slot === 'extra') next = selectCarryWeapon(next, target.slot, family);
  } else next = equip(profile, id, target.family, target.vehicle);
  return { profile: next, message: `${item.name} equipped in ${slotLabel(target.slot).toLowerCase()}.` };
}
/** A purchase and its requested destination either both succeed, or spend nothing. */
export function purchaseLoadoutItem(profile: ArmoryProfile, id: string, term: WeaponTerm | undefined, target?: LoadoutTarget, quantity = 1) {
  const item = itemById(id);
  if (!item) return { profile, message: 'Item unavailable.' };
  if (!Number.isInteger(quantity) || quantity < 1 || (item.category !== 'consumable' && quantity !== 1)) return { profile, message: 'Choose a valid quantity.' };
  if (item.category === 'consumable' && quantity + (profile.consumables[id] ?? 0) > consumableLimit(item)) return { profile, message: `You can hold at most ${consumableLimit(item)} of this supply.` };
  if (target) {
    const error = loadoutEquipError(profile, item, target);
    if (error) return { profile, message: error };
  }
  let next = profile, message = '';
  for (let n = 0; n < quantity; n++) {
    const result = purchase(next, id, term);
    if (result.profile === next) return { profile, message: result.message };
    next = result.profile; message = result.message;
  }
  if (target) {
    const equipped = equipLoadoutItem(next, id, target);
    if (equipped.profile === next) return { profile, message: equipped.message };
    next = equipped.profile;
    message = item.category === 'consumable' ? `${quantity} × ${item.name} bought. All ${next.consumables[id]} packed.` : `${item.name} rented and equipped in ${slotLabel(target.slot).toLowerCase()}.`;
  } else if (id === EXTRA_SLOT_ID) message = `${message} Choose a different weapon for the extra main slot.`;
  else if (item.category !== 'consumable') message = `${item.name} rental ${hasItemAccess(profile, id) ? 'extended' : 'added to your locker'}. Your equipped loadout is unchanged.`;
  return { profile: next, message };
}
export const packedSupplyCount = (profile: ArmoryProfile) => Object.entries(profile.consumables).reduce((count, [id, amount]) => count + (isSupplyCarried(profile, id) ? amount : 0), 0);
/** Readiness only considers equipment carried into play, never unrelated locker rentals. */
export function deploymentRentals(profile: ArmoryProfile) {
  const loadout = resolveLoadout(profile), carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const ids = new Set([profile.rig, profile.plate, profile.vision, ...Object.values(profile.vehicleSkins),
    ...loadout.carriedFamilies.flatMap(family => [profile.guns[family].variant, profile.guns[family].skin]),
    ...(carry.extra === null ? [] : [EXTRA_SLOT_ID])]);
  return ARMORY_CATALOG.filter(item => ids.has(item.id) && !profile.owned.includes(item.id) && profile.rentals[item.id] > 0);
}
