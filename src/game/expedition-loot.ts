import { FPS_WEAPONS, validWeaponIndex } from './fps-rules';
import { ARMORY_CATALOG, isEnemyIssue, itemById, type ShopItem } from './armory-catalog';
import { resolveLoadout, type ArmoryProfile, type GunEquipment } from './armory-state';
import type { Obstacle } from './marina-collision';
import type { WorldZoneId, ZonePosition } from './world-zones';
import type { ZoneSector } from './zone-sectors';
import { expeditionNpcs } from './expedition-npcs';
import type { ArenaSide } from './arena-factions';
import type { RegionBounds } from './region-collision';

export type FieldLootKind = 'weapon' | 'ammo' | 'medical' | 'armor';
/** Resting height on the rendered geometry below an item's release position. */
export type LootGround = (x: number, z: number, height: number) => number;
const onGround = (at: ZonePosition & { y?: number }, ground?: LootGround) => ({
  ...at, y: ground ? ground(at.x, at.z, at.y ?? 0) : Math.max(0, at.y ?? 0),
});
export interface FieldLoot {
  id: string; zoneId: WorldZoneId; kind: FieldLootKind; catalogId?: string;
  name: string; tier: ShopItem['tier']; x: number; z: number; y?: number; amount: number;
  /** Food is a recovery pickup, but only this placement may use a stall anchor. */
  placement?: 'food-stall' | 'field';
  /** The sector it came to rest in, for the HUD and the pickup callout. */
  sectorId?: string;
  /** Dropped by a fallen enemy rather than placed in a crate; drawn as the weapon itself. */
  dropped?: boolean;
  /** Ammunition only: the calibre of the rounds, which only a gun firing it can take. */
  caliberMm?: number;
  /** Set out beside another item (a weapon crate's rounds beside it), so drawn as a kit rather than a crate. */
  beside?: string;
}
/**
 * Loose ammunition by calibre. A weapon comes with its magazine loaded and
 * its rounds lie beside it as a separate pickup; loose crates hold one
 * calibre each, mostly the 5.56 mm nearly every rifle fires. `scale` sets a
 * crate's rounds against the district's `ammoAmount`.
 */
export interface Calibre { mm: number; name: string; weight: number; scale: number }
export const CALIBRES: readonly Calibre[] = [
  { mm: 5.56, name: '5.56 mm rounds', weight: .55, scale: 1 },
  { mm: 9, name: '9 mm rounds', weight: .2, scale: .7 },
  { mm: 7.62, name: '7.62 mm link', weight: .15, scale: .8 },
  { mm: 12.7, name: '12.7 mm link', weight: .1, scale: .4 },
];
export const calibreOf = (mm: number | undefined) => CALIBRES.find(calibre => mm !== undefined && Math.abs(calibre.mm - mm) < .01);
/** The calibre a catalogue weapon fires. */
export const weaponCalibre = (item: ShopItem | undefined) =>
  item?.category === 'weapon' && validWeaponIndex(item.family) ? calibreOf(FPS_WEAPONS[item.family].caliberMm) : undefined;
/** The share of a weapon's issued reserve left beside it: a crate is a stash, a body only what was in the pouches. */
export const WEAPON_AMMO = { crate: 1, fallen: .5 };
/** Dropped weapons kept per district; the oldest goes when another falls. */
export const MAX_FIELD_DROPS = 6;
/** Dropped dressings, plates and pouches kept per district, apart from the weapons. */
export const MAX_FIELD_KITS = 12;

/** A soldier who has just fallen, as far as their kit is concerned. */
export interface FallenSoldier {
  /** Unique to this life (actor id and death count), so the same body always leaves the same kit. */
  key: string;
  side: ArenaSide;
  /** Arena rank grade, 1 (recruit) to 3 (veteran); absent counts as a regular. */
  rank?: number;
  grenade?: string;
  /** The enemy-issue variant in their hands. */
  variant?: string;
  /** Friendlies carry no variant, only the issued weapon of this family. */
  family?: number;
}
type Weighted = readonly (readonly [string, number])[];
/**
 * What a fallen soldier leaves beside their weapon, by rank grade. It follows
 * the kit arena-ranks hands out: recruits go without plates, regulars
 * sometimes wear soft inserts, veterans ceramic and now and then Aegis, and
 * the better the soldier the better the dressing in their pouch.
 */
export const FALLEN_KIT: Readonly<Record<1 | 2 | 3, { medical: number; medicalItems: Weighted; plate: number; plateItems: Weighted }>> = {
  1: { medical: .35, medicalItems: [['kit-bandage', 1]], plate: 0, plateItems: [] },
  2: { medical: .5, medicalItems: [['kit-dressing', .7], ['kit-first-aid', .3]], plate: .3, plateItems: [['plate-soft', 1]] },
  3: { medical: .75, medicalItems: [['kit-first-aid', .7], ['kit-trauma', .3]], plate: .7, plateItems: [['plate-ceramic', .8], ['plate-elite', .2]] },
};
/** The issued weapon a friendly of `family` carries: the shop's free tier, never enemy issue. */
export const forcesIssue = (family: number | undefined) => ARMORY_CATALOG.find(item =>
  item.category === 'weapon' && item.family === family && item.tier === 'Issued' && item.price === 0 && !isEnemyIssue(item));
export interface LootZoneGeometry {
  id: WorldZoneId; spawn: ZonePosition;
  bounds: RegionBounds;
  obstacles: readonly Obstacle[]; anchors?: readonly ZonePosition[];
  /** Actual standing clearance at street level, including elevated-route foundations. */
  canStand?: (x: number, z: number, radius: number) => boolean;
  /** Valid standing positions on authored, connected upper floors. */
  elevatedAnchors?: readonly (ZonePosition & { y: number })[];
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
  if (geometry.obstacles.some(o => point.x + radius > o.minX && point.x - radius < o.maxX && point.z + radius > o.minZ && point.z - radius < o.maxZ)) return false;
  return geometry.canStand?.(point.x, point.z, radius) ?? true;
}
function choose<T>(items: readonly T[], random: () => number): T { return items[Math.floor(random() * items.length)]; }
export function rollZoneWeapon(zoneId: WorldZoneId, random: () => number, tierBias: -1 | 0 | 1 = 0): ShopItem {
  const rules = ZONE_LOOT_RULES[zoneId];
  const { elite, field } = biasedChances(rules, tierBias);
  const roll = random();
  const tier: ShopItem['tier'] = roll < elite ? 'Elite' : roll < elite + field ? 'Field' : 'Issued';
  // Enemy issue is taken from the enemy, never found in a crate.
  return choose(ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.tier === tier && validWeaponIndex(item.family) && !isEnemyIssue(item)), random);
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
  // Drops live beside the rolled crates, not in them: they are not part of the
  // seed's content, and a checkpoint does not keep them.
  const drops = new Map<WorldZoneId, FieldLoot[]>(), kits = new Map<WorldZoneId, FieldLoot[]>(); let dropSerial = 0;
  // Supply-drop contents likewise: won in play, not rolled from the seed, and not kept by a checkpoint.
  const supplies = new Map<WorldZoneId, FieldLoot[]>();
  function enterZone(geometry: LootZoneGeometry): FieldLoot[] {
    if (zones.has(geometry.id)) return remaining(geometry.id);
    if (!ZONE_LOOT_RULES[geometry.id] || !finitePosition(geometry.spawn) || ![geometry.bounds.minX,geometry.bounds.maxX,geometry.bounds.minZ,geometry.bounds.maxZ].every(Number.isFinite) ||
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
      slot.point = { ...point, ...(geometry.bounds.groundHeight ? {y:geometry.bounds.groundHeight(point.x,point.z)} : {}) }; occupied.push(point); return true;
    }
    // Sector choice runs on its own stream, so a district gaining sectors cannot
    // disturb the gear an existing expedition seed already rolled.
    const sectorRandom = randomFor(`${seedText}:${geometry.id}:sectors`);
    // Calibre has its own stream too, so it cannot shift the gear already rolled.
    const calibreRandom = randomFor(`${seedText}:${geometry.id}:calibres`);
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
        let roll = calibreRandom() * CALIBRES.reduce((total, calibre) => total + calibre.weight, 0);
        const calibre = CALIBRES.find(entry => (roll -= entry.weight) <= 0) ?? CALIBRES[0];
        return { ...common, name: calibre.name, tier: 'Issued' as const, caliberMm: calibre.mm, amount: Math.round(rules.ammoAmount * calibre.scale), placement: 'field' as const };
      }
      const item = slot.food ? rollFood(rules, random, bias) : itemById(random() < biasedChances(rules, bias).elite ? 'kit-trauma' : 'kit-dressing')!;
      return { ...common, catalogId: item.id, name: item.name, tier: item.tier, amount: rules.medicalAmount, placement: slot.food ? 'food-stall' as const : 'field' as const };
    });
    // Relocate existing crates only, within their already selected sector. This
    // preserves district budgets, loot weights, tier bias and the content stream.
    const upper = [...(geometry.elevatedAnchors ?? [])].filter(p => Number.isFinite(p.y) && p.y >= 2);
    const used: typeof upper = [];
    let moved = 0;
    for (const item of shuffle([...loot])) {
      if (moved >= Math.ceil(loot.length / 3) || item.placement === 'food-stall') continue;
      const candidates = upper.filter(p => sectorOf(p)?.id === item.sectorId && !loot.some(other => other !== item && Math.hypot(other.x-p.x, (other.y??0)-p.y, other.z-p.z)<3) && !used.some(q => Math.hypot(p.x-q.x, p.y-q.y, p.z-q.z) < 3));
      if (!candidates.length) continue;
      const point = candidates[Math.floor(positionRandom() * candidates.length)];
      Object.assign(item, point); used.push(point); moved++;
    }
    // Each weapon crate's rounds sit beside it, wherever the crate ended up.
    for (const item of loot.filter(entry => entry.kind === 'weapon')) {
      const rounds = roundsBeside(item, WEAPON_AMMO.crate); if (!rounds) continue;
      const turn = (hash(item.id) % 628) / 100, raised = (item.y ?? 0) > (geometry.bounds.groundHeight?.(item.x,item.z) ?? 0)+.05;
      const place = (angle: number, distance: number) => ({ x: Math.round((item.x + Math.cos(angle) * distance) * 100) / 100, z: Math.round((item.z + Math.sin(angle) * distance) * 100) / 100 });
      const spot = raised ? place(turn, .65) : Array.from({ length: 8 }, (_, i) => place(turn + i * Math.PI / 4, .85)).find(point => clearGround(point, geometry, geometry.bounds.groundHeight ? .65 : .25)) ?? {x:item.x,z:item.z};
      const y=!raised && geometry.bounds.groundHeight ? geometry.bounds.groundHeight(spot.x,spot.z) : item.y;
      loot.push({ ...rounds, id: `${item.id}-rounds`, sectorId: item.sectorId, ...spot, ...(y !== undefined ? { y } : {}), beside: item.id });
    }
    zones.set(geometry.id, loot);
    return remaining(geometry.id);
  }
  /** The rounds that go with a weapon, as a pickup of their own, or nothing for a gun with no known calibre. */
  function roundsBeside(weapon: FieldLoot, share: number): Omit<FieldLoot, 'id' | 'x' | 'z'> | null {
    const item = itemById(weapon.catalogId ?? ''), calibre = weaponCalibre(item);
    if (!calibre || !item || !validWeaponIndex(item.family)) return null;
    return { zoneId: weapon.zoneId, kind: 'ammo', name: calibre.name, tier: 'Issued', caliberMm: calibre.mm, amount: Math.max(1, Math.round(FPS_WEAPONS[item.family].reserve * share)), placement: 'field' };
  }
  const allLoot = (zoneId: WorldZoneId) => [...zones.get(zoneId) ?? [], ...drops.get(zoneId) ?? [], ...kits.get(zoneId) ?? [], ...supplies.get(zoneId) ?? []];
  function remaining(zoneId: WorldZoneId): FieldLoot[] { return allLoot(zoneId).filter(item => !collected.has(item.id)).map(item => ({ ...item })); }
  /**
   * What a supply crate held: a weapon rolled a tier up for the district, a
   * full reserve of its calibre and a medical kit, set out round the crate at `at`.
   * `key` (the drop's event id) makes the same crate hold the same things.
   */
  function supply(zoneId: WorldZoneId, key: string, at: ZonePosition & { y?: number }, ground?: LootGround): FieldLoot[] {
    const rules = ZONE_LOOT_RULES[zoneId];
    if (!rules || !finitePosition(at) || !Number.isFinite(at.y ?? 0)) return [];
    const random = randomFor(`${seedText}:${zoneId}:supply:${key}`);
    const weapon = rollZoneWeapon(zoneId, random, 1), medical = itemById(random() < .5 ? 'kit-trauma' : 'kit-dressing')!;
    const around = (index: number) => onGround({ x: at.x + Math.cos(index * 2.1) * 1.2, z: at.z + Math.sin(index * 2.1) * 1.2, y: at.y }, ground);
    const gun: FieldLoot = { id: `supply-${zoneId}-${++dropSerial}`, zoneId, kind: 'weapon', catalogId: weapon.id, name: weapon.name, tier: weapon.tier, ...around(0), amount: 1, placement: 'field', dropped: true };
    const rounds = roundsBeside(gun, WEAPON_AMMO.crate);
    const items: FieldLoot[] = [gun, ...(rounds ? [{ ...rounds, id: `supply-${zoneId}-${++dropSerial}`, ...around(1), dropped: true }] : []),
      { id: `supply-${zoneId}-${++dropSerial}`, zoneId, kind: 'medical', catalogId: medical.id, name: medical.name, tier: medical.tier, ...around(2), amount: rules.medicalAmount, placement: 'field', dropped: true }];
    supplies.set(zoneId, [...(supplies.get(zoneId) ?? []).filter(item => !collected.has(item.id)), ...items]);
    return items.map(item => ({ ...item }));
  }
  /** Adds to a district's drops of one kind, keeping the newest `cap`; returns the ids that made room. */
  function lay(store: Map<WorldZoneId, FieldLoot[]>, zoneId: WorldZoneId, items: readonly FieldLoot[], cap: number) {
    const list = [...(store.get(zoneId) ?? []).filter(entry => !collected.has(entry.id)), ...items];
    const evicted = list.splice(0, Math.max(0, list.length - cap)).map(entry => entry.id);
    store.set(zoneId, list); return evicted;
  }
  const dropped = (zoneId: WorldZoneId, kind: FieldLootKind, item: ShopItem, at: ZonePosition & { y?: number }, amount = 1): FieldLoot => ({
    id: `drop-${zoneId}-${++dropSerial}`, zoneId, kind, catalogId: item.id, name: item.name, tier: item.tier,
    x: at.x, z: at.z, y: at.y ?? 0, amount, placement: 'field', dropped: true });
  /**
   * A fallen enemy's weapon, left where they fell. Only enemy issue drops, and
   * a district keeps the newest `MAX_FIELD_DROPS`; `evicted` names the ones
   * that made room so the world can stop drawing them.
   */
  function drop(zoneId: WorldZoneId, catalogId: string, at: ZonePosition & { y?: number }, ground?: LootGround): { loot: FieldLoot; evicted: string[] } | null {
    const item = itemById(catalogId);
    if (!ZONE_LOOT_RULES[zoneId] || item?.category !== 'weapon' || !isEnemyIssue(item) || !validWeaponIndex(item.family) || !finitePosition(at) || !Number.isFinite(at.y ?? 0)) return null;
    const loot = dropped(zoneId, 'weapon', item, onGround(at, ground));
    return { loot: { ...loot }, evicted: lay(drops, zoneId, [loot], MAX_FIELD_DROPS) };
  }
  /**
   * Everything a fallen soldier leaves: their weapon where they fell (enemy
   * issue from the opposition, the issued rifle or Ultimax from a friendly)
   * with its magazine, the rounds from their pouches as a pickup of its own,
   * and round it what `FALLEN_KIT` gives their rank. The rolls are seeded by
   * the soldier's `key`. Weapons and
   * kit are capped apart, so a district full of dressings never pushes out a gun.
   */
  function fallen(zoneId: WorldZoneId, soldier: FallenSoldier, at: ZonePosition & { y?: number }, ground?: LootGround): { loot: FieldLoot[]; evicted: string[] } {
    const rules = ZONE_LOOT_RULES[zoneId];
    if (!rules || !finitePosition(at) || !Number.isFinite(at.y ?? 0)) return { loot: [], evicted: [] };
    const random = randomFor(`${seedText}:${zoneId}:fallen:${soldier.key}`);
    const pick = (table: Weighted) => {
      let roll = random() * table.reduce((total, [, weight]) => total + weight, 0);
      return itemById(table.find(([, weight]) => (roll -= weight) <= 0)?.[0] ?? table[table.length - 1][0]);
    };
    const kit = FALLEN_KIT[soldier.rank === 1 || soldier.rank === 3 ? soldier.rank : 2];
    const weapon = soldier.side === 'forces' ? forcesIssue(soldier.family) : itemById(soldier.variant ?? '');
    const armed = weapon?.category === 'weapon' && validWeaponIndex(weapon.family) && (soldier.side === 'forces' || isEnemyIssue(weapon)) ? [dropped(zoneId, 'weapon', weapon, onGround(at, ground))] : [];
    // Each roll is drawn whether or not it is used, so one outcome never shifts the next.
    const medicalRoll = random(), medical = pick(kit.medicalItems), plateRoll = random(), plate = kit.plateItems.length ? pick(kit.plateItems) : undefined;
    const carried: [FieldLootKind, ShopItem, number][] = [];
    const grenade = itemById(soldier.grenade ?? ''); if (soldier.side !== 'forces' && grenade?.grenade && ['grenade-frag', 'grenade-smoke'].includes(grenade.id)) carried.push(['medical', grenade, 1]);
    if (medicalRoll < kit.medical && medical?.category === 'consumable') carried.push(['medical', medical, medical.effect?.health ?? rules.medicalAmount]);
    if (plateRoll < kit.plate && plate?.category === 'plate') carried.push(['armor', plate, 1]);
    // Set out round the body, inside reach of where it lies.
    const turn = (hash(soldier.key) % 628) / 100;
    const round = (index: number) => onGround({ x: at.x + Math.cos(turn + index * 2.1) * .8, z: at.z + Math.sin(turn + index * 2.1) * .8, y: at.y }, ground);
    const rounds = armed[0] && roundsBeside(armed[0], WEAPON_AMMO.fallen);
    const items = [...(rounds ? [{ ...rounds, id: `drop-${zoneId}-${++dropSerial}`, ...round(0), dropped: true }] : []),
      ...carried.map(([kind, item, amount], index) => dropped(zoneId, kind, item, round(index + 1), amount))];
    const evicted = [...lay(drops, zoneId, armed, MAX_FIELD_DROPS), ...lay(kits, zoneId, items, MAX_FIELD_KITS)];
    return { loot: [...armed, ...items].map(item => ({ ...item })), evicted };
  }
  function nearest(zoneId: WorldZoneId, player: ZonePosition & { y?: number }, radius = 2.8): FieldLoot | null {
    if (!finitePosition(player) || !Number.isFinite(player.y ?? 0) || !Number.isFinite(radius) || radius <= 0) return null;
    return remaining(zoneId).filter(item => Math.abs((item.y ?? 0) - (player.y ?? 0)) <= 1.2 && Math.hypot(item.x - player.x, (item.y ?? 0) - (player.y ?? 0), item.z - player.z) <= Math.min(radius, 2.8))
      .sort((a, b) => Math.hypot(a.x - player.x, (a.y ?? 0) - (player.y ?? 0), a.z - player.z) - Math.hypot(b.x - player.x, (b.y ?? 0) - (player.y ?? 0), b.z - player.z))[0] ?? null;
  }
  function collect(zoneId: WorldZoneId, lootId: string, player: ZonePosition & { y?: number }): FieldLoot | null {
    if (!finitePosition(player) || !Number.isFinite(player.y ?? 0)) return null;
    const item = allLoot(zoneId).find(candidate => candidate.id === lootId);
    if (!item || collected.has(item.id) || Math.abs((item.y ?? 0) - (player.y ?? 0)) > 1.2 || Math.hypot(item.x - player.x, (item.y ?? 0) - (player.y ?? 0), item.z - player.z) > 2.8) return null;
    collected.add(item.id); return { ...item };
  }
  function snapshot() {
    return { seed: seedText, zones: [...zones.entries()].map(([id, loot]) => ({ id, loot: loot.map(item => ({ ...item })) })), collected: [...collected].filter(id => !id.startsWith('drop-') && !id.startsWith('supply-')) };
  }
  return { enterZone, remaining, nearest, collect, drop, fallen, supply, snapshot };
}
export type ExpeditionLoot = ReturnType<typeof createExpeditionLoot>;

export interface FieldEquipment { weapons: Partial<Record<number, string>>; plate?: string }
export const createFieldEquipment = (): FieldEquipment => ({ weapons: {} });
/** Gear found in the field never modifies owned items, currencies or shop unlocks. */
export function equipFieldLoot(equipment: FieldEquipment, loot: FieldLoot): FieldEquipment {
  const item = loot.catalogId ? itemById(loot.catalogId) : undefined;
  if (loot.kind === 'weapon' && item?.category === 'weapon' && validWeaponIndex(item.family)) {
    return { ...equipment, weapons: { ...equipment.weapons, [item.family]: item.id } };
  }
  if (loot.kind === 'armor' && item?.category === 'plate' && (item.protection ?? 0) > 0) return { ...equipment, weapons: { ...equipment.weapons }, plate: item.id };
  return equipment;
}
export function resolveExpeditionLoadout(profile: ArmoryProfile, equipment: FieldEquipment) {
  const guns = profile.guns.map((gun, family) => {
    const item = itemById(equipment.weapons[family] ?? '');
    return { ...gun, attachments: { ...gun.attachments }, ...(item?.category === 'weapon' && item.family === family ? { variant: item.id } : {}) };
  }) as GunEquipment[];
  const plate = itemById(equipment.plate ?? '');
  return resolveLoadout({ ...profile, guns, plate: plate?.category === 'plate' ? plate.id : profile.plate });
}
