import { itemById } from './armory-catalog';
import type { FieldLoot } from './expedition-loot';
import type { LootCard } from './loot-focus';
import type { MatchWeaponDrop } from './match-weapon-drops';
import { MATCH_DROP_LIFETIME } from './match-weapon-drops';
import type { WorldZoneId } from './world-zones';

export const MATCH_REGEN_DELAY = 7;
export const MATCH_REGEN_PER_SECOND = 10;
export const MAX_MATCH_ARMOR_DROPS = 24;
export type MatchArmorDrop = MatchWeaponDrop;
/** Persists until respawn so a missed snapshot cannot lose an equipped plate. */
export interface MatchArmorPickup { serial: number; catalogId: string; plateId?: string }

export function matchRegeneratedHealth(health: number, maximum: number, lastHurt: number, elapsed: number, dt: number) {
  const seconds = Math.max(0, Math.min(dt, elapsed - lastHurt - MATCH_REGEN_DELAY));
  return health > 0 ? Math.min(maximum, health + MATCH_REGEN_PER_SECOND * seconds) : 0;
}
/** Ordinary troops drop rifle inserts; support specialists carry rated plates. */
export function matchBotArmor(role: string | undefined, rank = 2) {
  const tier = Math.max(0, Math.min(2, Math.floor(rank) - 1));
  return (role === 'tank' || role === 'heavy'
    ? ['plate-steel', 'plate-composite', 'plate-pillbox']
    : ['plate-soft', 'plate-ceramic', 'plate-elite'])[tier];
}
/** A stronger pool equips for this life; equal/weaker plates repair the current set. */
export function matchArmorGain(armor: number, capacity: number, catalogId: string) {
  const points = itemById(catalogId)?.protection ?? 0;
  const equip = points > capacity;
  return { equip, armor: equip ? points : Math.min(capacity, armor + points), blocked: !equip && armor >= capacity };
}
export function matchArmorLoot(drop: MatchArmorDrop, zoneId: WorldZoneId): FieldLoot {
  const item = itemById(drop.catalogId)!;
  return { ...drop, zoneId, kind: 'armor', name: item.name, tier: item.tier, amount: 1, dropped: true };
}
export function matchArmorCard(loot: FieldLoot, armor: number, capacity: number): LootCard {
  const item = itemById(loot.catalogId!)!, gain = matchArmorGain(armor, capacity, item.id);
  return { id: loot.id, name: item.name, tier: item.tier, kind: 'armor', type: 'Recovered armor',
    description: item.description, stats: [{ label: 'Armor', value: `${Math.ceil(gain.armor)} / ${gain.equip ? item.protection : capacity}` }],
    action: gain.equip ? 'Equip' : 'Repair', detail: gain.equip ? 'Equips stronger inserts for this life' : 'Repairs your current inserts',
    note: 'Starting armor returns on respawn', ...(gain.blocked ? { blocked: 'Armor full' } : {}) };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const matchArmorItem = (id: unknown): id is string => typeof id === 'string' && id.length <= 40 && itemById(id)?.category === 'plate' && (itemById(id)?.protection ?? 0) > 0;
export function validMatchArmorDrop(v: unknown, elapsed: number): v is MatchArmorDrop {
  return record(v) && typeof v.id === 'string' && /^match-armor-\d+$/.test(v.id) && v.id.length <= 40 && matchArmorItem(v.catalogId)
    && ['x','y','z','expires'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
    && (v.y as number) >= 0 && (v.y as number) <= 124 && (v.expires as number) > elapsed && (v.expires as number) <= elapsed + MATCH_DROP_LIFETIME;
}
export function validMatchArmorPickup(v: unknown): v is MatchArmorPickup {
  return record(v) && Number.isSafeInteger(v.serial) && (v.serial as number) > 0 && matchArmorItem(v.catalogId)
    && (v.plateId === undefined || matchArmorItem(v.plateId));
}
