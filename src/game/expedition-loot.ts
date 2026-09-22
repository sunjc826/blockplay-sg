import { ARMORY_CATALOG, itemById, type ShopItem } from './armory-catalog';
import { resolveLoadout, type ArmoryProfile, type GunEquipment } from './armory-state';
import type { Obstacle } from './marina-collision';
import type { WorldZoneId, ZonePosition } from './world-zones';
import type { ZoneSector } from './zone-sectors';
import { expeditionNpcs } from './expedition-npcs';

export type FieldLootKind = 'weapon' | 'ammo' | 'medical' | 'armor';
export interface FieldLoot {
  id: string; zoneId: WorldZoneId; kind: FieldLootKind; catalogId?: string;
  name: string; tier: ShopItem['tier']; x: number; z: number; amount: number;
  /** Food is a recovery pickup, but only this placement may use a stall anchor. */
  placement?: 'food-stall' | 'field';
  /** The sector it came to rest in, for the HUD and the pickup callout. */
  sectorId?: string;
}
export interface LootZoneGeometry {
  id: WorldZoneId; spawn: ZonePosition;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacles: readonly Obstacle[]; anchors?: readonly ZonePosition[];
  /** Named sub-areas. Absent leaves placement exactly as it was before sectors. */
  sectors?: readonly ZoneSector[];
}
export interface ZoneLootRules {
  eliteChance: number; fieldChance: number; weaponCount: number; ammoCount: number;
  medicalCount: number; armorCount: number; ammoAmount: number; medicalAmount: number;
}
/**
 * A sector's `tierBias` leans the roll without ever guaranteeing an outcome:
 * the exposed ground a player has to cross for a crate is worth better odds,
 * not a better item. Elite moves most because it is the rarest.
 */
export function biasedChances(rules: ZoneLootRules, tierBias: -1 | 0 | 1 = 0) {
  const elite = Math.min(1, Math.max(0, rules.eliteChance * (tierBias > 0 ? 1.8 : tierBias < 0 ? 0.35 : 1)));
  const field = Math.min(1 - elite, Math.max(0, rules.fieldChance * (tierBias < 0 ? 0.7 : 1)));
  return { elite, field };
}

/** Tier probabilities apply to each weapon crate, independently. CBD means Raffles Place. */
export const ZONE_LOOT_RULES: Readonly<Record<WorldZoneId, Readonly<ZoneLootRules>>> = {
  queenstown: { eliteChance: 0.05, fieldChance: 0.3, weaponCount: 2, ammoCount: 2, medicalCount: 1, armorCount: 1, ammoAmount: 45, medicalAmount: 25 },
  'marina-bay': { eliteChance: 0.15, fieldChance: 0.55, weaponCount: 3, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 60, medicalAmount: 40 },
  'raffles-place': { eliteChance: 0.5, fieldChance: 0.4, weaponCount: 4, ammoCount: 3, medicalCount: 1, armorCount: 2, ammoAmount: 90, medicalAmount: 60 },
  chinatown: { eliteChance: 0.12, fieldChance: 0.5, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 1, ammoAmount: 55, medicalAmount: 35 },
  'kampong-glam': { eliteChance: 0.08, fieldChance: 0.38, weaponCount: 2, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 50, medicalAmount: 30 },
  'jurong-lake': { eliteChance: 0.18, fieldChance: 0.46, weaponCount: 3, ammoCount: 2, medicalCount: 2, armorCount: 2, ammoAmount: 65, medicalAmount: 45 },
  'upper-thomson': { eliteChance: 0.06, fieldChance: 0.34, weaponCount: 2, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 48, medicalAmount: 30 },
  punggol: { eliteChance: 0.14, fieldChance: 0.44, weaponCount: 3, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 55, medicalAmount: 38 },
  harbourfront: { eliteChance: 0.38, fieldChance: 0.44, weaponCount: 4, ammoCount: 3, medicalCount: 2, armorCount: 2, ammoAmount: 80, medicalAmount: 52 },
  sentosa: { eliteChance: 0.34, fieldChance: 0.46, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 2, ammoAmount: 72, medicalAmount: 50 },
  geylang: { eliteChance: 0.16, fieldChance: 0.5, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 1, ammoAmount: 58, medicalAmount: 38 },
  tuas: { eliteChance: 0.36, fieldChance: 0.42, weaponCount: 4, ammoCount: 3, medicalCount: 1, armorCount: 2, ammoAmount: 78, medicalAmount: 45 },
  woodlands: { eliteChance: 0.22, fieldChance: 0.46, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 2, ammoAmount: 62, medicalAmount: 42 },
  tampines: { eliteChance: 0.15, fieldChance: 0.47, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 1, ammoAmount: 58, medicalAmount: 40 },
  'toa-payoh': { eliteChance: 0.07, fieldChance: 0.35, weaponCount: 2, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 48, medicalAmount: 30 },
  'bukit-timah': { eliteChance: 0.18, fieldChance: 0.44, weaponCount: 3, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 55, medicalAmount: 38 },
  bishan: { eliteChance: 0.08, fieldChance: 0.36, weaponCount: 2, ammoCount: 2, medicalCount: 2, armorCount: 1, ammoAmount: 50, medicalAmount: 32 },
  orchard: { eliteChance: 0.2, fieldChance: 0.48, weaponCount: 3, ammoCount: 3, medicalCount: 2, armorCount: 1, ammoAmount: 60, medicalAmount: 40 },
  changi: { eliteChance: 0.42, fieldChance: 0.44, weaponCount: 4, ammoCount: 3, medicalCount: 2, armorCount: 2, ammoAmount: 85, medicalAmount: 55 },
};
const finitePosition = (p: ZonePosition) => Number.isFinite(p.x) && Number.isFinite(p.z);
const hash = (text: string) => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
};
function randomFor(seed: string) {
  let value = hash(seed);
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function clearGround(point: ZonePosition, geometry: LootZoneGeometry, radius = 0.65) {
  if (!finitePosition(point)) return false;
  const b = geometry.bounds;
  if (point.x - radius < b.minX || point.x + radius > b.maxX || point.z - radius < b.minZ || point.z + radius > b.maxZ) return false;
  return !geometry.obstacles.some(o => point.x + radius > o.minX && point.x - radius < o.maxX && point.z + radius > o.minZ && point.z - radius < o.maxZ);
}
function choose<T>(items: readonly T[], random: () => number): T { return items[Math.floor(random() * items.length)]; }
export function rollZoneWeapon(zoneId: WorldZoneId, random: () => number, tierBias: -1 | 0 | 1 = 0): ShopItem {
  const rules = ZONE_LOOT_RULES[zoneId];
  const { elite, field } = biasedChances(rules, tierBias);
  const roll = random();
  const tier: ShopItem['tier'] = roll < elite ? 'Elite' : roll < elite + field ? 'Field' : 'Issued';
  return choose(ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.tier === tier && (item.family === 0 || item.family === 1)), random);
}

function rollTier(rules: ZoneLootRules, random: () => number, tierBias: -1 | 0 | 1): ShopItem['tier'] {
  const { elite, field } = biasedChances(rules, tierBias), roll = random();
  return roll < elite ? 'Elite' : roll < elite + field ? 'Field' : 'Issued';
}

function rollFood(rules: ZoneLootRules, random: () => number, tierBias: -1 | 0 | 1) {
  const tier = rollTier(rules, random, tierBias);
  return choose(ARMORY_CATALOG.filter(item => item.category === 'consumable' && item.supplyType === 'food' && item.tier === tier), random);
}

/** One instance belongs to one expedition. Re-entry returns cached crates, never new rolls. */
export function createExpeditionLoot(seed: string | number) {
  const seedText = String(seed); const zones = new Map<WorldZoneId, FieldLoot[]>(); const collected = new Set<string>();
  function enterZone(geometry: LootZoneGeometry): FieldLoot[] {
    if (zones.has(geometry.id)) return remaining(geometry.id);
    if (!ZONE_LOOT_RULES[geometry.id] || !finitePosition(geometry.spawn) || !Object.values(geometry.bounds).every(Number.isFinite) ||
      geometry.bounds.minX >= geometry.bounds.maxX || geometry.bounds.minZ >= geometry.bounds.maxZ) return [];
    // Content and positions have separate streams: adding cover cannot change which gear was rolled.
    const random = randomFor(`${seedText}:${geometry.id}:contents`);
    const positionRandom = randomFor(`${seedText}:${geometry.id}:positions`);
    const rules = ZONE_LOOT_RULES[geometry.id];
    const kinds: FieldLootKind[] = [
      ...Array<FieldLootKind>(rules.weaponCount).fill('weapon'), ...Array<FieldLootKind>(rules.ammoCount).fill('ammo'),
      ...Array<FieldLootKind>(rules.medicalCount).fill('medical'), ...Array<FieldLootKind>(rules.armorCount).fill('armor'),
    ];
    // NPCs reserve their authored position before any random crate is drawn.
    // They do not consume a loot slot; they only prevent visual overlap.
    const occupied: ZonePosition[] = expeditionNpcs(geometry.id, geometry.sectors ?? []).map(npc => ({ x: npc.x, z: npc.z }));
    const shuffle = <T,>(list: T[]) => {
      // Fisher-Yates keeps curated safe anchors random without moving them into scenery.
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(positionRandom() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      return list;
    };
    const slots = kinds.map((kind, index) => ({ kind, index, point: null as ZonePosition | null, food: false }));
    function accept(slot: typeof slots[number], point: ZonePosition) {
      if (!clearGround(point, geometry) || occupied.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 3)) return false;
      slot.point = { ...point }; occupied.push(point); return true;
    }
    // Sector choice runs on its own stream, so a district gaining sectors cannot
    // disturb the gear an existing expedition seed already rolled.
    const sectorRandom = randomFor(`${seedText}:${geometry.id}:sectors`);
    const sectors = (geometry.sectors ?? []).filter(sector => sector.lootWeight > 0 && sector.anchors.length);
    const queues = new Map(sectors.map(sector =>
      [sector.id, shuffle(sector.anchors.filter(p => clearGround(p, geometry)).map(p => ({ ...p })))]));
    const pickSector = <T extends { lootWeight: number }>(pool: readonly T[]) => {
      const weightTotal = pool.reduce((total, sector) => total + sector.lootWeight, 0);
      let roll = sectorRandom() * weightTotal;
      for (const sector of pool) { roll -= sector.lootWeight; if (roll <= 0) return sector; }
      return pool[pool.length - 1];
    };

    // One existing recovery slot may become food. It still consumes that
    // district's medicalCount, and its sector is selected by the same loot
    // weights as every other crate. With no valid stall anchor it remains a
    // medical utility; food never spills onto the road-ring fallback.
    const foodSectors = sectors.filter(sector => sector.foodAnchors?.some(point => clearGround(point, geometry)));
    const recoverySlot = slots.find(slot => slot.kind === 'medical');
    if (recoverySlot && foodSectors.length) {
      const foodQueues = new Map(foodSectors.map(sector => [sector.id,
        shuffle((sector.foodAnchors ?? []).filter(point => clearGround(point, geometry)).map(point => ({ ...point })))]));
      for (let attempt = 0; attempt < foodSectors.length * 3 && !recoverySlot.point; attempt++) {
        const queue = foodQueues.get(pickSector(foodSectors).id);
        while (queue?.length && !recoverySlot.point) accept(recoverySlot, queue.shift()!);
      }
      recoverySlot.food = !!recoverySlot.point;
    }

    // Draw every remaining crate's home sector by weight, then take an anchor
    // from it. A sector that runs out simply loses its turn; fallbacks still
    // preserve the district's declared total count.
    for (const slot of slots.filter(candidate => !candidate.point)) if (sectors.length) {
      for (let attempt = 0; attempt < sectors.length * 3 && !slot.point; attempt++) {
        const queue = queues.get(pickSector(sectors).id);
        while (queue?.length && !slot.point) accept(slot, queue.shift()!);
      }
    }
    for (const candidate of shuffle((geometry.anchors ?? []).filter(p => clearGround(p, geometry)).map(p => ({ ...p })))) {
      const slot = slots.find(candidate => !candidate.point); if (!slot) break;
      accept(slot, candidate);
    }
    for (let attempt = 0; slots.some(slot => !slot.point) && attempt < 1000; attempt++) {
      const angle = positionRandom() * Math.PI * 2; const distance = 15 + positionRandom() * 30;
      const slot = slots.find(candidate => !candidate.point)!;
      accept(slot, { x: Math.round((geometry.spawn.x + Math.cos(angle) * distance) * 100) / 100, z: Math.round((geometry.spawn.z + Math.sin(angle) * distance) * 100) / 100 });
    }
    /** Smallest containing sector wins, matching `sectorAt`. */
    const sectorOf = (point: ZonePosition) => (geometry.sectors ?? [])
      .filter(s => point.x >= s.bounds.minX && point.x <= s.bounds.maxX && point.z >= s.bounds.minZ && point.z <= s.bounds.maxZ)
      .sort((a, b) => (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxZ - a.bounds.minZ)
        - (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxZ - b.bounds.minZ))[0] ?? null;
    const loot: FieldLoot[] = slots.flatMap(slot => {
      const point = slot.point; if (!point) return [];
      const { kind, index } = slot;
      // Bias follows where the crate ended up, not how it got there, so a
      // fallback position in an exposed sector is rewarded the same way.
      const sector = sectorOf(point);
      const bias = sector?.tierBias ?? 0;
      const common = { id: `loot-${hash(seedText).toString(36)}-${geometry.id}-${index}`, zoneId: geometry.id, kind, sectorId: sector?.id, ...point };
      if (kind === 'weapon') {
        const item = rollZoneWeapon(geometry.id, random, bias);
        return { ...common, catalogId: item.id, name: item.name, tier: item.tier, amount: 1 };
      }
      if (kind === 'armor') {
        const elite = random() < biasedChances(rules, bias).elite;
        const item = itemById(elite ? 'plate-elite' : random() < 0.55 ? 'plate-soft' : 'plate-ceramic')!;
        return { ...common, catalogId: item.id, name: item.name, tier: item.tier, amount: 1 };
      }
      if (kind === 'ammo') {
        const item = itemById('kit-ammo')!;
        return { ...common, catalogId: item.id, name: item.name, tier: item.tier, amount: rules.ammoAmount, placement: 'field' as const };
      }
      const item = slot.food ? rollFood(rules, random, bias) : itemById(random() < biasedChances(rules, bias).elite ? 'kit-trauma' : 'kit-dressing')!;
      return { ...common, catalogId: item.id, name: item.name, tier: item.tier, amount: rules.medicalAmount, placement: slot.food ? 'food-stall' as const : 'field' as const };
    });
    zones.set(geometry.id, loot);
    return remaining(geometry.id);
  }
  function remaining(zoneId: WorldZoneId): FieldLoot[] { return (zones.get(zoneId) ?? []).filter(item => !collected.has(item.id)).map(item => ({ ...item })); }
  function nearest(zoneId: WorldZoneId, player: ZonePosition, radius = 2.8): FieldLoot | null {
    if (!finitePosition(player) || !Number.isFinite(radius) || radius <= 0) return null;
    return remaining(zoneId).filter(item => Math.hypot(item.x - player.x, item.z - player.z) <= Math.min(radius, 2.8))
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0] ?? null;
  }
  function collect(zoneId: WorldZoneId, lootId: string, player: ZonePosition): FieldLoot | null {
    if (!finitePosition(player)) return null;
    const item = (zones.get(zoneId) ?? []).find(candidate => candidate.id === lootId);
    if (!item || collected.has(item.id) || Math.hypot(item.x - player.x, item.z - player.z) > 2.8) return null;
    collected.add(item.id); return { ...item };
  }
  function snapshot() {
    return { seed: seedText, zones: [...zones.entries()].map(([id, loot]) => ({ id, loot: loot.map(item => ({ ...item })) })), collected: [...collected] };
  }
  return { enterZone, remaining, nearest, collect, snapshot };
}
export type ExpeditionLoot = ReturnType<typeof createExpeditionLoot>;

export interface FieldEquipment { weapons: Partial<Record<0 | 1, string>>; plate?: string }
export const createFieldEquipment = (): FieldEquipment => ({ weapons: {} });
/** Gear found in the field never modifies owned items, currencies or shop unlocks. */
export function equipFieldLoot(equipment: FieldEquipment, loot: FieldLoot): FieldEquipment {
  const item = loot.catalogId ? itemById(loot.catalogId) : undefined;
  if (loot.kind === 'weapon' && item?.category === 'weapon' && (item.family === 0 || item.family === 1)) {
    return { ...equipment, weapons: { ...equipment.weapons, [item.family]: item.id } };
  }
  if (loot.kind === 'armor' && item?.category === 'plate' && (item.protection ?? 0) > 0) return { ...equipment, weapons: { ...equipment.weapons }, plate: item.id };
  return equipment;
}
export function resolveExpeditionLoadout(profile: ArmoryProfile, equipment: FieldEquipment) {
  const guns = profile.guns.map((gun, family) => {
    const item = itemById(equipment.weapons[family as 0 | 1] ?? '');
    return { ...gun, attachments: { ...gun.attachments }, ...(item?.category === 'weapon' && item.family === family ? { variant: item.id } : {}) };
  }) as [GunEquipment, GunEquipment];
  const plate = itemById(equipment.plate ?? '');
  return resolveLoadout({ ...profile, guns, plate: plate?.category === 'plate' ? plate.id : profile.plate });
}
