import { itemById } from './armory-catalog';
import { DEFAULT_VARIANTS, validWeaponIndex } from './fps-rules';
import { physicalWeaponFamilies, primaryWeaponFamily, withWeaponModes } from './weapon-modes';
import type { WorldZoneId } from './world-zones';
import type { FieldLoot } from './expedition-loot';

export const MATCH_DROP_LIFETIME = 45;
export const MAX_MATCH_DROPS = 24;
export interface MatchWeaponDrop { id: string; catalogId: string; x: number; y: number; z: number; expires: number }
/** Persistent receipt: later snapshots recover the entire current-life kit. */
export interface MatchWeaponPickup { serial: number; catalogId: string; carried: number[]; variants: string[] }
export function matchPickupCarry(carried: readonly number[], family: number, active: number) {
  const physical = physicalWeaponFamilies(carried);
  const replaced = physical.includes(family) ? family : family === 2 ? 2
    : physical.includes(primaryWeaponFamily(active)) && primaryWeaponFamily(active) !== 2 ? primaryWeaponFamily(active) : physical.find(f => f !== 2)!;
  return withWeaponModes(physical.map(f => f === replaced ? family : f));
}
export function matchDropLoot(drop: MatchWeaponDrop, zoneId: WorldZoneId): FieldLoot {
  const item = itemById(drop.catalogId)!;
  return { id: drop.id, catalogId: item.id, kind: 'weapon', name: item.name, tier: item.tier, amount: 1,
    zoneId, x: drop.x, y: drop.y, z: drop.z, dropped: true };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const matchWeaponItem = (id: unknown) => typeof id === 'string' && id.length <= 40 && itemById(id)?.category === 'weapon'
  && validWeaponIndex(itemById(id)?.family) && primaryWeaponFamily(itemById(id)!.family!) === itemById(id)!.family;
export function validMatchDrop(v: unknown, elapsed: number): v is MatchWeaponDrop {
  return record(v) && typeof v.id === 'string' && /^match-drop-\d+$/.test(v.id) && v.id.length <= 40 && matchWeaponItem(v.catalogId)
    && ['x','y','z','expires'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
    && (v.y as number) >= 0 && (v.y as number) <= 124 && (v.expires as number) > elapsed && (v.expires as number) <= elapsed + MATCH_DROP_LIFETIME;
}
export function validMatchPickup(v: unknown): v is MatchWeaponPickup {
  if (!record(v) || !Number.isSafeInteger(v.serial) || (v.serial as number) <= 0 || !matchWeaponItem(v.catalogId)
    || !Array.isArray(v.carried) || v.carried.length < 2 || v.carried.length > 5 || !v.carried.every(validWeaponIndex)
    || new Set(v.carried).size !== v.carried.length || !v.carried.includes(2)
    || !Array.isArray(v.variants) || v.variants.length !== DEFAULT_VARIANTS.length) return false;
  const physical = physicalWeaponFamilies(v.carried);
  return physical.length >= 2 && physical.length <= 3 && JSON.stringify(withWeaponModes(physical)) === JSON.stringify(v.carried)
    && v.variants.every((id, family) => typeof id === 'string' && itemById(id)?.family === family && itemById(id)?.category === 'weapon')
    && v.carried.includes(itemById(v.catalogId as string)!.family!);
}
