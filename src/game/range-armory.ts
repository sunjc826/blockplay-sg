import { ARMORY_CATALOG, isEnemyIssue, itemById, type ShopItem } from './armory-catalog';
import { pickupSlot, restoreCarrySlots, SIDEARM_FAMILY } from './armory-slots';
import { resolveLoadout, type ArmoryProfile, type ResolvedLoadout } from './armory-state';
import { DEFAULT_VARIANTS } from './fps-rules';
import { lookLimit, type Vec3 } from './loot-focus';
import type { MapBounds } from './minimap';
import type { Obstacle } from './marina-collision';
import { hasItemAccess } from './weapon-rentals';
import { OICW_LAUNCHER, physicalWeaponFamilies } from './weapon-modes';

/**
 * The training range's armoury: a gallery wall of the Armed Forces' issued
 * weapons and everything taken from other factions, and a table of what the
 * player has bought. Taking one changes this session's equipment only. Nothing
 * here writes to the profile, so a captured weapon never reaches the save.
 */

const weapons = ARMORY_CATALOG.filter(item => item.category === 'weapon');
const issued = DEFAULT_VARIANTS.slice(0, 5).map(id => itemById(id)!);
/** The launcher is a mode of Peace Offering rather than a weapon to pick up. */
const captured = weapons.filter(item => isEnemyIssue(item) && item.family !== OICW_LAUNCHER);
const platform = (family: number) => captured.filter(item => item.family === family);
const PLATFORM_FAMILIES = [5, 6, 7];

export interface RangeWallRow { label: string; items: readonly ShopItem[] }
export const RANGE_WALL_ROWS: readonly RangeWallRow[] = [
  { label: 'ARMED FORCES ISSUE', items: issued },
  { label: 'PROXY CARGO', items: captured.filter(item => !PLATFORM_FAMILIES.includes(item.family!)) },
  { label: 'CAPTURED XM8', items: platform(5) },
  { label: 'CAPTURED G36', items: platform(6) },
  { label: 'CAPTURED MG4', items: platform(7) },
];

/** Bought or rented weapons, which the wall does not already show. */
export function rangeTableWeapons(profile: Pick<ArmoryProfile, 'owned' | 'rentals'>): ShopItem[] {
  return weapons.filter(item => !isEnemyIssue(item) && item.price > 0 && hasItemAccess(profile, item.id))
    .sort((a, b) => a.family! - b.family! || a.price - b.price || a.id.localeCompare(b.id));
}

/** Every gun in hand or slung, by catalogue id: their places on the rack stand empty. */
export function carriedVariants(equipment: Pick<ResolvedLoadout, 'weapons' | 'carriedFamilies'>) {
  return new Set(physicalWeaponFamilies(equipment.carriedFamilies).map(family => equipment.weapons[family].equipment.variant));
}

/**
 * The profile as the range session has it: the player's own, with the guns now
 * carried in place of their saved choices. Equipment outlives an engine across a
 * district crossing, so this is read back from the equipment each time.
 */
function sessionProfile(profile: ArmoryProfile, equipment: Pick<ResolvedLoadout, 'weapons' | 'carriedFamilies'>): ArmoryProfile {
  const next = structuredClone(profile);
  const mains = physicalWeaponFamilies(equipment.carriedFamilies).filter(family => family !== SIDEARM_FAMILY);
  const held = (id: string) => hasItemAccess(next, id);
  equipment.weapons.forEach((weapon, family) => {
    const variant = weapon.equipment.variant;
    if (!held(variant)) next.owned.push(variant);
    if (next.guns[family]) next.guns[family].variant = variant;
  });
  next.carry = { main: mains[0] ?? 0, extra: mains[1] ?? null };
  return next;
}

/** What the session carries after taking `id`, or null if it is not a rack weapon. */
export function takeRangeArmoryWeapon(profile: ArmoryProfile, equipment: ResolvedLoadout, id: string, active: number): ResolvedLoadout | null {
  const item = itemById(id);
  if (item?.category !== 'weapon' || item.family === undefined || item.family === OICW_LAUNCHER) return null;
  const next = sessionProfile(profile, equipment), family = item.family;
  if (!hasItemAccess(next, id)) next.owned.push(id);
  next.guns[family].variant = id;
  const access = { ...next, owned: [...next.owned, ...Object.keys(next.rentals ?? {})] };
  const slot = pickupSlot(access, family, active);
  if (slot !== 'sidearm') next.carry = { ...restoreCarrySlots(next.carry, access.owned, next.rentals), [slot]: family };
  const resolved = resolveLoadout(next, { deferRentalExpiry: true });
  return { ...equipment, carriedFamilies: resolved.carriedFamilies,
    weapons: equipment.weapons.map((weapon, index) => index === family ? resolved.weapons[index] : weapon) };
}

/** The family a rack weapon would put down, as `pickupSlot` reads it. */
export function rangeArmoryPutDown(profile: ArmoryProfile, equipment: ResolvedLoadout, family: number, active: number) {
  const next = sessionProfile(profile, equipment);
  const slot = pickupSlot({ ...next, owned: [...next.owned, ...Object.keys(next.rentals ?? {})] }, family, active);
  return slot === 'sidearm' ? family : slot === 'extra' ? next.carry?.extra ?? family : next.carry?.main ?? family;
}

/** How far from the feet a hand reaches along the rack: the wall is taller than a crate. */
export const RACK_REACH = 3.4;
export interface RackItem extends Vec3 { id: string }
/** The rack weapon the crosshair is nearest, in reach. Two side by side are told apart by the look, as loot is. */
export function focusRack<T extends RackItem>(items: readonly T[], feet: Vec3, eye: Vec3, forward: Vec3): T | null {
  const length = Math.hypot(forward.x, forward.y, forward.z);
  if (!(length > 0)) return null;
  let best: T | null = null, bestScore = Infinity;
  for (const item of items) {
    if (Math.hypot(item.x - feet.x, item.z - feet.z) > RACK_REACH || Math.abs(item.y - feet.y) > RACK_REACH) continue;
    const dx = item.x - eye.x, dy = item.y - eye.y, dz = item.z - eye.z, distance = Math.hypot(dx, dy, dz);
    if (!(distance > 0)) continue;
    const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (distance * length);
    const score = Math.acos(Math.max(-1, Math.min(1, cos))) / lookLimit(distance);
    if (score <= 1 && score < bestScore) { best = item; bestScore = score; }
  }
  return best;
}

export const WALL_WIDTH = 8.8, WALL_HEIGHT = 3.3, WALL_THICKNESS = .24;
/** Room to walk and turn between the wall and the table. */
const AISLE = 2.2;
export const TABLE_HEIGHT = .82;
export const TABLE_CELL = { width: 1.7, depth: .48 };
const TABLE_MARGIN = .1, TABLE_MAX_COLUMNS = 5;

/** The bay's shape in its own frame: the wall on the origin, facing +z, and the table in the aisle's far side. */
export interface RangeArmoryPlan {
  table: { columns: number; rows: number; width: number; depth: number; z: number } | null;
  /** Everything built, and the room needed to reach it, from the wall's back face to the front edge. */
  width: number; depth: number;
}
export function rangeArmoryPlan(tableCount: number): RangeArmoryPlan {
  const front = 1.1;
  if (tableCount <= 0) return { table: null, width: WALL_WIDTH, depth: WALL_THICKNESS / 2 + AISLE + front };
  const columns = Math.min(TABLE_MAX_COLUMNS, Math.max(1, Math.ceil(tableCount / 2))), rows = Math.ceil(tableCount / columns);
  const width = columns * TABLE_CELL.width + TABLE_MARGIN * 2, depth = rows * TABLE_CELL.depth + TABLE_MARGIN * 2;
  return { table: { columns, rows, width, depth, z: WALL_THICKNESS / 2 + AISLE + depth / 2 },
    width: WALL_WIDTH, depth: WALL_THICKNESS / 2 + AISLE + depth + front };
}

export interface RangeArmoryPlot { x: number; z: number; yaw: number }
export interface RangeArmorySite {
  spawn: { x: number; z: number; yaw: number };
  bounds: MapBounds;
  /** Solid footprints, in plan view. */
  blocks: readonly { minX: number; maxX: number; minZ: number; maxZ: number; footprint?: readonly { x: number; z: number }[] }[];
  vehicles: readonly { x: number; z: number }[];
  /** The drill targets, whose line from the spawn the bay must not stand in. */
  targets: readonly { x: number; z: number }[];
  /** The floor underfoot here, or null where no one can stand. */
  floor: (x: number, z: number) => number | null;
  canStand: (x: number, y: number, z: number) => boolean;
}

const toWorld = (plot: RangeArmoryPlot, x: number, z: number) => {
  const c = Math.cos(plot.yaw), s = Math.sin(plot.yaw);
  return { x: plot.x + x * c + z * s, z: plot.z - x * s + z * c };
};
/** A rectangle in the bay's frame, in world corners. */
export const bayRectangle = (plot: RangeArmoryPlot, minX: number, maxX: number, minZ: number, maxZ: number) =>
  [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map(([x, z]) => toWorld(plot, x, z));

type Point = { x: number; z: number };
const axesOf = (polygon: readonly Point[]) => polygon.map((p, i) => {
  const q = polygon[(i + 1) % polygon.length]; return { x: q.z - p.z, z: p.x - q.x };
});
/** Separating-axis overlap of two convex outlines. */
function overlaps(a: readonly Point[], b: readonly Point[]) {
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const project = (polygon: readonly Point[]) => polygon.map(p => p.x * axis.x + p.z * axis.z);
    const pa = project(a), pb = project(b);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}
function crosses(from: Point, to: Point, polygon: readonly Point[]) {
  const line = [from, to];
  return overlaps(line, polygon);
}

/** Whether the whole bay fits here, on level ground, with its aisle clear to walk. */
function bayFits(plot: RangeArmoryPlot, plan: RangeArmoryPlan, site: RangeArmorySite) {
  const half = plan.width / 2, back = -WALL_THICKNESS / 2;
  const outline = bayRectangle(plot, -half - .4, half + .4, back, plan.depth);
  const { bounds } = site;
  if (outline.some(p => p.x < bounds.minX || p.x > bounds.maxX || p.z < bounds.minZ || p.z > bounds.maxZ)) return false;
  if (overlaps(outline, [{ x: site.spawn.x - .6, z: site.spawn.z - .6 }, { x: site.spawn.x + .6, z: site.spawn.z - .6 }, { x: site.spawn.x + .6, z: site.spawn.z + .6 }, { x: site.spawn.x - .6, z: site.spawn.z + .6 }])) return false;
  for (const block of site.blocks) {
    const shape = block.footprint?.length ? block.footprint : [{ x: block.minX, z: block.minZ }, { x: block.maxX, z: block.minZ }, { x: block.maxX, z: block.maxZ }, { x: block.minX, z: block.maxZ }];
    if (overlaps(outline, shape)) return false;
  }
  if (site.vehicles.some(vehicle => overlaps(outline, [{ x: vehicle.x - 3, z: vehicle.z - 3 }, { x: vehicle.x + 3, z: vehicle.z - 3 }, { x: vehicle.x + 3, z: vehicle.z + 3 }, { x: vehicle.x - 3, z: vehicle.z + 3 }]))) return false;
  if (site.targets.some(target => crosses(site.spawn, target, outline))) return false;
  const floor = site.floor(plot.x, plot.z);
  if (floor === null) return false;
  const aisle = WALL_THICKNESS / 2 + AISLE / 2;
  for (const u of [-1, -.5, 0, .5, 1]) for (const z of [back, aisle, plan.depth - .5]) {
    const at = toWorld(plot, u * half, z), here = site.floor(at.x, at.z);
    if (here === null || Math.abs(here - floor) > .22) return false;
    if (z !== back && !site.canStand(at.x, here, at.z)) return false;
  }
  return true;
}

/**
 * Somewhere near the spawn for the bay, facing back at it: to the sides or
 * behind rather than downrange, so it never stands in front of a drill.
 */
export function findRangeArmoryPlot(plan: RangeArmoryPlan, site: RangeArmorySite): RangeArmoryPlot | null {
  const turns = [Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI, Math.PI * .35, -Math.PI * .35];
  for (const radius of [plan.depth + 2, plan.depth + 5, plan.depth + 9, plan.depth + 14, plan.depth + 20, plan.depth + 28, plan.depth + 38, plan.depth + 50]) {
    for (const turn of turns) {
      const angle = site.spawn.yaw + turn, x = site.spawn.x - Math.sin(angle) * radius, z = site.spawn.z - Math.cos(angle) * radius;
      const facing = Math.atan2(site.spawn.x - x, site.spawn.z - z);
      // Streets and plazas run on a grid more often than they face the spawn.
      for (const yaw of [facing, Math.round(facing / (Math.PI / 2)) * (Math.PI / 2)]) {
        const plot = { x, z, yaw };
        if (bayFits(plot, plan, site)) return plot;
      }
    }
  }
  return null;
}

/** The wall and table as solid things, in world space, at this floor height. */
export function rangeArmoryObstacles(plot: RangeArmoryPlot, plan: RangeArmoryPlan, floor: number): Obstacle[] {
  const solid = (minX: number, maxX: number, minZ: number, maxZ: number, height: number, supportsTop: boolean): Obstacle => {
    const footprint = bayRectangle(plot, minX, maxX, minZ, maxZ);
    return { minX: Math.min(...footprint.map(p => p.x)), maxX: Math.max(...footprint.map(p => p.x)),
      minZ: Math.min(...footprint.map(p => p.z)), maxZ: Math.max(...footprint.map(p => p.z)),
      minY: floor, maxY: floor + height, footprint, supportsTop };
  };
  const half = WALL_WIDTH / 2, thick = WALL_THICKNESS / 2, list = [solid(-half, half, -thick, thick, WALL_HEIGHT, false)];
  if (plan.table) list.push(solid(-plan.table.width / 2, plan.table.width / 2, plan.table.z - plan.table.depth / 2, plan.table.z + plan.table.depth / 2, TABLE_HEIGHT, true));
  return list;
}
