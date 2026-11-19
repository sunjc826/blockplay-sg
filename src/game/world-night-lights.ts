import * as THREE from 'three';
import { nightFacadeAttributes } from './night-facades';
import type { Obstacle, RegionBounds } from './region-collision';
import { footprintRayInterval } from './region-collision';
import type { RegionRoad } from './regions';
import type { LightingState } from './world-lighting';
import { getTraversalObstacles, getWalkSurfaces, surfaceHeight, type WalkSurface } from './vertical-routes';
import { createMovingLights, movingLightsChunk, MOVING_LIGHTS_DECLARATIONS, type LightSource } from './moving-lights';

/**
 * The city's own light after sunset, for every district without authoring
 * any: streetlamps stood along the district's map roads, the pools they throw
 * baked into one top-down light map that every lit material samples, and lit
 * windows on the faces of anything building-sized. All of it fades in as the
 * sun nears the horizon and stays dark by day, so daylight looks as authored.
 *
 * No real lights are added: the pools are a texture lookup per fragment, so
 * hundreds of lamps cost the same as one and no shader recompiles at dusk.
 */

/** Metres between lamps along a road, alternating sides. */
export const LAMP_SPACING = 30;
/** Metres a lamp's pool reaches on the ground. */
export const LAMP_REACH = 15;
export const LAMP_HEIGHT = 7.5;
/** Park and plaza lamps: shorter, sparser, smaller pools, no arm. */
export const PATH_LAMP = { spacing: 52, height: 4.2, reach: 8.5 } as const;
const ARM = 1.7, MAX_LAMPS = 700;
/** Light-map cell, metres. */
const CELL = 1.25, MAX_MAP = 1024;
/** Height of the ground under each light-map texel is stored in [-10, 50] m. */
const HEIGHT_LOW = -10, HEIGHT_RANGE = 60;

export interface StreetLamp {
  x: number; z: number; y: number;
  /** Unit vector from the pole towards the road, along the arm; zero for a path lamp, which has none. */
  dx: number; dz: number;
  height: number; reach: number;
}

/** 0 by day, 1 once the sun is a couple of degrees under: streetlamps in Singapore come on a little before sunset. */
export function nightLevel(elevation: number) {
  const t = Math.max(0, Math.min(1, (12 - elevation) / 14));
  return t * t * (3 - 2 * t);
}

const roadSegments = (roads: readonly RegionRoad[]) => roads.flatMap(road => road.points.slice(1).map((p, i) => [road.points[i].x, road.points[i].z, p.x, p.z] as const));
/** Buckets keep the footprint test local; districts carry thousands of colliders. */
function footprints(obstacles: readonly Obstacle[]) {
  const cell = 16, grid = new Map<string, Obstacle[]>();
  for (const o of obstacles) for (let gx = Math.floor((o.minX - 3) / cell); gx <= Math.floor((o.maxX + 3) / cell); gx++)
    for (let gz = Math.floor((o.minZ - 3) / cell); gz <= Math.floor((o.maxZ + 3) / cell); gz++) {
      const key = `${gx},${gz}`, bucket = grid.get(key); if (bucket) bucket.push(o); else grid.set(key, [o]);
    }
  return (x: number, z: number, margin: number) => (grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? [])
    .some(o => x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin);
}
const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l)) : 0;
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
};

/**
 * Lamps along each road's polyline, on alternate kerbs, standing clear of
 * every footprint, every other carriageway and each other. Pure, so the
 * placement is testable without a scene.
 */
export function placeStreetLamps(roads: readonly RegionRoad[], roadWidth: number, obstacles: readonly Obstacle[], bounds: RegionBounds,
  options: { spacing?: number; ground?: (x: number, z: number) => number | null } = {}): StreetLamp[] {
  const spacing = options.spacing ?? LAMP_SPACING, offset = roadWidth / 2 + 1.4, lamps: StreetLamp[] = [];
  const segments = roadSegments(roads), blocked = footprints(obstacles);
  let side = 1;
  for (const road of roads) {
    let carry = spacing / 2;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 1e-3) continue;
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
      for (let s = carry; s < length; s += spacing) {
        side = -side;
        if (lamps.length >= MAX_LAMPS) return lamps;
        const nx = -uz * side, nz = ux * side;
        const x = a.x + ux * s + nx * offset, z = a.z + uz * s + nz * offset;
        if (x < bounds.minX + 2 || x > bounds.maxX - 2 || z < bounds.minZ + 2 || z > bounds.maxZ - 2) continue;
        if (blocked(x, z, .9) || segments.some(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz) < roadWidth / 2 + .6)) continue;
        if (lamps.some(l => Math.hypot(l.x - x, l.z - z) < spacing * .45)) continue;
        const y = options.ground ? options.ground(x, z) : 0;
        if (y === null) continue;
        lamps.push({ x, z, y, dx: -nx, dz: -nz, height: LAMP_HEIGHT, reach: LAMP_REACH });
      }
      carry = ((carry - length) % spacing + spacing) % spacing;
    }
  }
  return lamps;
}

/**
 * Plazas, parks and courtyards get sparse short lamps with gaps of moonlit
 * ground between them, instead of a blanket of overlapping light.
 */
export function placePathLamps(existing: readonly StreetLamp[], roads: readonly RegionRoad[], roadWidth: number, obstacles: readonly Obstacle[], bounds: RegionBounds,
  options: { ground?: (x: number, z: number) => number | null } = {}): StreetLamp[] {
  const { spacing, height, reach } = PATH_LAMP, segments = roadSegments(roads), blocked = footprints(obstacles);
  const placed = [...existing], lamps: StreetLamp[] = [];
  const jitter = (i: number, j: number, salt: number) => { const n = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453; return (n - Math.floor(n) - .5) * spacing * .5; };
  for (let i = 0, x0 = bounds.minX + spacing / 2; x0 < bounds.maxX; i++, x0 += spacing)
    for (let j = 0, z0 = bounds.minZ + spacing / 2; z0 < bounds.maxZ; j++, z0 += spacing) {
      if (placed.length >= MAX_LAMPS) return lamps;
      const x = x0 + jitter(i, j, 1), z = z0 + jitter(i, j, 2);
      if (x < bounds.minX + 6 || x > bounds.maxX - 6 || z < bounds.minZ + 6 || z > bounds.maxZ - 6) continue;
      if (blocked(x, z, 2.5) || segments.some(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz) < roadWidth / 2 + 1.5)) continue;
      if (placed.some(l => Math.hypot(l.x - x, l.z - z) < (l.reach + reach) * .85)) continue;
      const y = options.ground ? options.ground(x, z) : 0;
      if (y === null) continue;
      const lamp = { x, z, y, dx: 0, dz: 0, height, reach };
      lamps.push(lamp); placed.push(lamp);
    }
  return lamps;
}

type LampBlocker = Obstacle & { minY?: number };
/** Clips the lamp-to-ground segment against solid walls, decks and authored convex footprints. Bake time only. */
function blocksLamp(o: LampBlocker, cx: number, cy: number, cz: number, x: number, y: number, z: number) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  let near = .001, far = .999;
  if (Math.abs(dx) < 1e-8) { if (cx < o.minX || cx > o.maxX) return false; }
  else { const a = (o.minX - cx) / dx, b = (o.maxX - cx) / dx; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (Math.abs(dz) < 1e-8) { if (cz < o.minZ || cz > o.maxZ) return false; }
  else { const a = (o.minZ - cz) / dz, b = (o.maxZ - cz) / dz; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  // Every sample lies below its lamp head, so dy is negative.
  near = Math.max(near, ((o.maxY ?? 12) - cy) / dy);
  far = Math.min(far, ((o.minY ?? -Infinity) - cy) / dy);
  if (near > far) return false;
  if (o.footprint) [near, far] = footprintRayInterval(o.footprint, { x: cx, z: cz }, { x: dx, z: dz }, near, far);
  return near <= far;
}

/** Top-down lamp light, one texel per `CELL`: R is the visible pools' brightness, G their ground height. */
export function bakeLampMap(lamps: readonly StreetLamp[], bounds: RegionBounds, obstacles: readonly LampBlocker[] = []) {
  const width = Math.max(1, Math.min(MAX_MAP, Math.ceil((bounds.maxX - bounds.minX) / CELL)));
  const height = Math.max(1, Math.min(MAX_MAP, Math.ceil((bounds.maxZ - bounds.minZ) / CELL)));
  const sx = width / (bounds.maxX - bounds.minX), sz = height / (bounds.maxZ - bounds.minZ);
  const light = new Float32Array(width * height), ground = new Float32Array(width * height);
  for (const lamp of lamps) {
    const cx = lamp.x + lamp.dx * ARM, cz = lamp.z + lamp.dz * ARM, reach = lamp.reach;
    const headY = lamp.y + lamp.height;
    const blockers = obstacles.filter(o => o.maxX >= cx - reach && o.minX <= cx + reach && o.maxZ >= cz - reach && o.minZ <= cz + reach
      && (o.maxY ?? 12) > lamp.y + .15 && (o.minY ?? -Infinity) < headY);
    const x0 = Math.max(0, Math.floor((cx - reach - bounds.minX) * sx)), x1 = Math.min(width - 1, Math.ceil((cx + reach - bounds.minX) * sx));
    const z0 = Math.max(0, Math.floor((cz - reach - bounds.minZ) * sz)), z1 = Math.min(height - 1, Math.ceil((cz + reach - bounds.minZ) * sz));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const x = bounds.minX + (i + .5) / sx, z = bounds.minZ + (j + .5) / sz;
      const d = Math.hypot(x - cx, z - cz) / reach;
      if (d >= 1) continue;
      if (blockers.some(o => blocksLamp(o, cx, headY, cz, x, lamp.y + .05, z))) continue;
      // A soft pool with a brighter hot spot under the head.
      const k = j * width + i, value = (1 - d * d) ** 2 * .75 + Math.exp(-d * d * 18) * .25;
      if (value > light[k] * .5) ground[k] = lamp.y;
      light[k] += value;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let k = 0; k < light.length; k++) {
    data[k * 4] = Math.round(Math.min(1, light[k]) * 255);
    data[k * 4 + 1] = Math.round(Math.max(0, Math.min(1, (ground[k] - HEIGHT_LOW) / HEIGHT_RANGE)) * 255);
    data[k * 4 + 3] = 255;
  }
  return { data, width, height, light, ground };
}

/** Windows start this far above a building's foot; the storey below it is the shopfront's. */
export const GROUND_STOREY = 2.6;
/**
 * The ground storey drawn on building-sized walls. Bays are the window columns above (about 3.1 m).
 * Widths are shares of a bay, heights metres above the foot. A facade narrower than `minFacade`, or a
 * building whose foot is more than `maxLift` above the ground under it (a tower on a podium, a block on
 * stilts), gets none.
 */
export const STOREFRONT = { minFacade: 6, maxLift: .9, blank: .17, door: .25, frontWidth: .8, doorWidth: .4, riser: .5, head: 2.2, plinth: .3 } as const;
/**
 * Interior mapping behind glass: rooms `depth` to `depth + depthRange` metres deep behind a wall `reveal`
 * metres thick (which shows as a frame round the opening), furnished and lit by one ceiling lamp; how much of a room's
 * colour a shopfront shows by day (the rest of the light is the street's), and how brightly lit shopfronts
 * and lit windows show their rooms at night. A home is at least `homeHeight` tall with its window `sill` off the floor; a hanging lampshade's foot is `shadeDrop` under the ceiling.
 */
export const INTERIOR = { depth: 3.4, depthRange: 1.8, reveal: .18, dayShare: .85, nightShopfront: .38, nightWindow: .8, homeHeight: 2.7, sill: .95, shadeDrop: .7 } as const;
/**
 * Where a view ray entering a room's glass at `p` (metres from its left wall and floor) first meets the room:
 * the surface and the distance. `d` is the direction along the facade, up and inwards. Mirrors `nightRoom`.
 */
export function interiorHit(p: [number, number], size: [number, number], d: [number, number, number], depth: number) {
  const dz = Math.max(d[2], .02);
  const x = d[0] > 0 ? (size[0] - p[0]) / d[0] : -p[0] / Math.min(d[0], -1e-4), y = d[1] > 0 ? (size[1] - p[1]) / d[1] : -p[1] / Math.min(d[1], -1e-4), z = depth / dz;
  const t = Math.min(x, y, z);
  return { t, surface: t === z ? 'back' as const : t === y ? d[1] > 0 ? 'ceiling' as const : 'floor' as const : 'side' as const, point: [p[0] + d[0] * t, p[1] + d[1] * t, dz * t] as [number, number, number] };
}
/** A length inside a room: metres plus a share of the room's width (across) or depth (inwards). */
type RoomSpan = readonly [number, number];
/** A piece of furniture: a box from `x[0]`..`x[1]` across the room, `y` off the floor, and `z[0]`..`z[1]` in from the inside of the wall. */
export type RoomBox = { name: string; x: readonly [RoomSpan, RoomSpan]; y: readonly [number, number]; z: readonly [RoomSpan, RoomSpan] };
/**
 * What stands in the homes behind lit windows, three boxes a room. Each layout keeps something tall against a
 * wall, because a window above the street is looked up into and anything under the sill is out of sight. Rooms
 * are authored one way round and half are mirrored. The third box gives way to a curtain in a share of rooms.
 */
export const HOME_LAYOUTS = {
  living: [
    { name: 'display cabinet', x: [[0, .45], [-.25, 1]], y: [0, 2], z: [[-.42, 1], [0, 1]] },
    { name: 'sofa', x: [[.05, 0], [.95, 0]], y: [0, .78], z: [[.9, 0], [-.7, 1]] },
    { name: 'coffee table', x: [[1.35, 0], [1.35, .2]], y: [0, .42], z: [[1.2, 0], [-1.3, 1]] },
  ],
  bedroom: [
    { name: 'wardrobe', x: [[0, 0], [0, .3]], y: [0, 2.2], z: [[-.6, 1], [0, 1]] },
    { name: 'bed', x: [[-1.55, 1], [-.05, 1]], y: [0, .5], z: [[-2.1, 1], [0, 1]] },
    { name: 'bedside table', x: [[-2.1, 1], [-1.65, 1]], y: [0, .55], z: [[-.5, 1], [0, 1]] },
  ],
  kitchen: [
    { name: 'counter', x: [[0, 0], [-.8, 1]], y: [0, .9], z: [[-.6, 1], [0, 1]] },
    { name: 'wall cabinets', x: [[0, 0], [-.8, 1]], y: [1.5, 2.2], z: [[-.35, 1], [0, 1]] },
    { name: 'fridge', x: [[-.72, 1], [-.02, 1]], y: [0, 1.85], z: [[-.7, 1], [0, 1]] },
  ],
  study: [
    { name: 'bookshelf', x: [[0, 0], [.35, 0]], y: [0, 2.05], z: [[.8, 0], [-.2, 1]] },
    { name: 'desk', x: [[0, .45], [-.15, 1]], y: [0, .75], z: [[-.65, 1], [0, 1]] },
    { name: 'armchair', x: [[-1, 1], [-.2, 1]], y: [0, .85], z: [[.9, 0], [1.7, 0]] },
  ],
} as const satisfies Record<string, readonly [RoomBox, RoomBox, RoomBox]>;
/**
 * What stands in the offices behind lit windows. `openPlan` and `meeting` are the towers of the business
 * district: rows of partitioned desks or a long table, under a grid of ceiling panels behind clear glass.
 * `clerical` and `stockroom` are the offices everywhere else: filing cabinets, a copier, shelves of cartons,
 * under fluorescent tubes behind slatted blinds.
 */
export const OFFICE_LAYOUTS = {
  openPlan: [
    { name: 'desk row by the glass', x: [[.3, 0], [-.3, 1]], y: [0, 1.15], z: [[.9, 0], [1.6, 0]] },
    { name: 'desk row behind', x: [[.3, 0], [-.3, 1]], y: [0, 1.15], z: [[2.1, 0], [2.8, 0]] },
    { name: 'storage wall', x: [[0, 0], [0, .4]], y: [0, 2], z: [[-.45, 1], [0, 1]] },
  ],
  meeting: [
    { name: 'table', x: [[0, .25], [0, .75]], y: [0, .74], z: [[1, 0], [-1, 1]] },
    { name: 'credenza', x: [[0, 0], [.45, 0]], y: [0, .8], z: [[1, 0], [-.6, 1]] },
    { name: 'plant', x: [[-.6, 1], [-.15, 1]], y: [0, 1.8], z: [[-.6, 1], [-.15, 1]] },
  ],
  clerical: [
    { name: 'filing cabinets', x: [[0, 0], [0, .5]], y: [0, 1.9], z: [[-.5, 1], [0, 1]] },
    { name: 'desk', x: [[0, .55], [-.2, 1]], y: [0, .75], z: [[-1.6, 1], [-.9, 1]] },
    { name: 'copier', x: [[-.7, 1], [-.1, 1]], y: [0, 1.1], z: [[.8, 0], [1.5, 0]] },
  ],
  stockroom: [
    { name: 'side shelving', x: [[0, 0], [.5, 0]], y: [0, 2.1], z: [[.8, 0], [-.6, 1]] },
    { name: 'back shelving', x: [[0, 0], [-.2, 1]], y: [0, 2.1], z: [[-.5, 1], [0, 1]] },
    { name: 'desk', x: [[-1.5, 1], [-.3, 1]], y: [0, .75], z: [[.9, 0], [1.6, 0]] },
  ],
} as const satisfies Record<string, readonly [RoomBox, RoomBox, RoomBox]>;
/**
 * Upper floors that are neither homes nor offices, two layouts apiece. A hotel room is seen from its window
 * wall: beds with their heads to one side wall, a wardrobe in the far corner. A factory floor has a machine or
 * a conveyor under racking. A school has a classroom, its desks in files facing a board on the side wall, and
 * a laboratory. `DISTRICT_INTERIORS` gives a district its share of each; a wall material marked
 * `userData.nightRooms` is all one kind.
 */
export const SPECIAL_LAYOUTS = {
  hotel: {
    twin: [
      { name: 'bed by the window', x: [[0, 0], [2, 0]], y: [0, .55], z: [[.9, 0], [1.8, 0]] },
      { name: 'second bed', x: [[0, 0], [2, 0]], y: [0, .55], z: [[2.2, 0], [3.1, 0]] },
      { name: 'wardrobe', x: [[-1, 1], [0, 1]], y: [0, 2.1], z: [[-.6, 1], [0, 1]] },
    ],
    king: [
      { name: 'bed', x: [[0, 0], [2.05, 0]], y: [0, .55], z: [[1.1, 0], [2.9, 0]] },
      { name: 'armchair', x: [[-.9, 1], [-.15, 1]], y: [0, .8], z: [[.7, 0], [1.45, 0]] },
      { name: 'wardrobe', x: [[-1, 1], [0, 1]], y: [0, 2.1], z: [[-.6, 1], [0, 1]] },
    ],
  },
  factory: {
    machineHall: [
      { name: 'machine', x: [[.3, 0], [-1.2, 1]], y: [0, 1.9], z: [[-1.6, 1], [-.4, 1]] },
      { name: 'workbench', x: [[.3, 0], [-.3, 1]], y: [0, .9], z: [[.8, 0], [1.45, 0]] },
      { name: 'drums on a pallet', x: [[-1, 1], [-.1, 1]], y: [0, 1.1], z: [[-1.4, 1], [-.3, 1]] },
    ],
    assembly: [
      { name: 'conveyor', x: [[0, 0], [0, 1]], y: [0, .85], z: [[1.3, 0], [2, 0]] },
      { name: 'racking', x: [[0, 0], [-.9, 1]], y: [0, 2.2], z: [[-.55, 1], [0, 1]] },
      { name: 'control cabinet', x: [[-.7, 1], [-.1, 1]], y: [0, 1.8], z: [[-.5, 1], [0, 1]] },
    ],
  },
  classroom: {
    classroom: [
      { name: 'file of desks', x: [[0, .42], [.5, .42]], y: [0, .74], z: [[.8, 0], [-.6, 1]] },
      { name: 'second file of desks', x: [[0, .74], [.5, .74]], y: [0, .74], z: [[.8, 0], [-.6, 1]] },
      { name: 'cupboard', x: [[0, 0], [.45, 0]], y: [0, 1.9], z: [[-1, 1], [0, 1]] },
    ],
    laboratory: [
      { name: 'bench', x: [[.9, 0], [-.9, 1]], y: [0, .92], z: [[1.2, 0], [2, 0]] },
      { name: 'glassware cabinets', x: [[0, 0], [-.9, 1]], y: [0, 2.1], z: [[-.45, 1], [0, 1]] },
      { name: 'fume cupboard', x: [[-.8, 1], [0, 1]], y: [0, 2.1], z: [[-.75, 1], [0, 1]] },
    ],
  },
} as const satisfies Record<string, Record<string, readonly [RoomBox, RoomBox, RoomBox]>>;
/** A kind of upper floor that is neither home nor office; the shader numbers them from 4 in this order. */
export type RoomKind = keyof typeof SPECIAL_LAYOUTS;
/** How often each special room's third box gives way to a curtain (hotel) or a blind. */
export const SPECIAL_HUNG = { twin: .5, king: .5, machineHall: .1, assembly: .1, classroom: .3, laboratory: .25 } as const;
/**
 * The shop windows of a shopping street, three boxes a shop, numbered from 1 in this order in the shader. Each
 * is authored one way round and half are mirrored. A box that starts within a metre of the glass is the window
 * display; a bay that is a doorway leaves those out. Flat cut-outs stand on some of them: mannequins on the
 * fashion and sports plinths, lamps over the cafe's window table, bouquets in the florist's back row of
 * buckets, a bag on the bag shop's stand.
 */
export const SHOP_LAYOUTS = {
  fashion: [
    { name: 'window plinth', x: [[.4, 0], [-.4, 1]], y: [0, .25], z: [[.25, 0], [1, 0]] },
    { name: 'clothes rail', x: [[0, 0], [.5, 0]], y: [.85, 1.8], z: [[1.4, 0], [-.3, 1]] },
    { name: 'till', x: [[-1.7, 1], [-.4, 1]], y: [0, 1], z: [[-1.4, 1], [-.8, 1]] },
  ],
  jeweller: [
    { name: 'showcase', x: [[.35, 0], [1.1, 0]], y: [0, 1.05], z: [[.4, 0], [1.1, 0]] },
    { name: 'second showcase', x: [[-1.1, 1], [-.35, 1]], y: [0, 1.05], z: [[.4, 0], [1.1, 0]] },
    { name: 'counter case', x: [[.4, 0], [-.4, 1]], y: [0, .95], z: [[-1.5, 1], [-.9, 1]] },
  ],
  electronics: [
    { name: 'demo table', x: [[.45, 0], [-.9, 1]], y: [0, .9], z: [[.7, 0], [1.5, 0]] },
    { name: 'second demo table', x: [[.45, 0], [-.9, 1]], y: [0, .9], z: [[2.1, 0], [2.9, 0]] },
    { name: 'accessory wall', x: [[-.3, 1], [0, 1]], y: [0, 2.2], z: [[.6, 0], [-.2, 1]] },
  ],
  bookshop: [
    { name: 'side shelves', x: [[0, 0], [.35, 0]], y: [0, 2.2], z: [[.6, 0], [-.5, 1]] },
    { name: 'back shelves', x: [[0, 0], [-.3, 1]], y: [0, 2.2], z: [[-.35, 1], [0, 1]] },
    { name: 'table of new titles', x: [[0, .4], [0, .8]], y: [0, .8], z: [[.45, 0], [1.5, 0]] },
  ],
  cafe: [
    { name: 'counter and cake case', x: [[.3, 0], [0, .62]], y: [0, 1.15], z: [[-1.75, 1], [-1.15, 1]] },
    { name: 'window table', x: [[0, .5], [-.35, 1]], y: [.68, .76], z: [[.35, 0], [1, 0]] },
    { name: 'coffee machine', x: [[0, .68], [-.2, 1]], y: [0, 1.45], z: [[-.6, 1], [0, 1]] },
  ],
  sports: [
    { name: 'shoe wall', x: [[0, 0], [.3, 0]], y: [.35, 2.2], z: [[.6, 0], [-.2, 1]] },
    { name: 'bench', x: [[0, .42], [0, .72]], y: [0, .45], z: [[1.5, 0], [2.7, 0]] },
    { name: 'window plinth', x: [[0, .45], [-.4, 1]], y: [0, .3], z: [[.25, 0], [1, 0]] },
  ],
  beauty: [
    { name: 'island', x: [[0, .32], [0, .68]], y: [0, .95], z: [[.9, 0], [2.1, 0]] },
    { name: 'lit shelves', x: [[0, 0], [.3, 0]], y: [0, 2.2], z: [[.6, 0], [-.4, 1]] },
    { name: 'lit back shelves', x: [[.5, 0], [-.3, 1]], y: [0, 2.2], z: [[-.3, 1], [0, 1]] },
  ],
  toys: [
    { name: 'stack of boxes', x: [[.35, 0], [0, .48]], y: [0, 1.32], z: [[.3, 0], [.96, 0]] },
    { name: 'shelves', x: [[-.4, 1], [0, 1]], y: [0, 2.2], z: [[.7, 0], [-.2, 1]] },
    { name: 'till', x: [[.3, 0], [1.5, 0]], y: [0, 1], z: [[-1.3, 1], [-.7, 1]] },
  ],
  florist: [
    { name: 'front buckets', x: [[.3, 0], [-.3, 1]], y: [0, .45], z: [[.3, 0], [.9, 0]] },
    { name: 'back buckets', x: [[.3, 0], [-.3, 1]], y: [0, .9], z: [[.9, 0], [1.5, 0]] },
    { name: 'wrapping counter', x: [[-1.6, 1], [-.4, 1]], y: [0, .95], z: [[-1.3, 1], [-.7, 1]] },
  ],
  bags: [
    { name: 'wall of niches', x: [[.4, 0], [-.4, 1]], y: [0, 2.2], z: [[-.35, 1], [0, 1]] },
    { name: 'stand', x: [[-.3, .5], [.3, .5]], y: [0, .9], z: [[.45, 0], [1.05, 0]] },
    { name: 'sofa', x: [[.3, 0], [1, 0]], y: [0, .7], z: [[1.5, 0], [-.8, 1]] },
  ],
  // The heritage streets' shops follow, from 11.
  medicineHall: [
    { name: 'wall of drawers', x: [[.3, 0], [-.3, 1]], y: [0, 2.2], z: [[-.4, 1], [0, 1]] },
    { name: 'rosewood counter', x: [[.4, 0], [-.4, 1]], y: [0, 1], z: [[-1.6, 1], [-1, 1]] },
    { name: 'window table of jars', x: [[0, .15], [0, .6]], y: [0, .6], z: [[.3, 0], [.9, 0]] },
  ],
  teaMerchant: [
    { name: 'shelves of tins', x: [[0, 0], [.35, 0]], y: [0, 2.2], z: [[.6, 0], [-.3, 1]] },
    { name: 'tasting table', x: [[0, .4], [-.5, 1]], y: [0, .75], z: [[1.3, 0], [2.3, 0]] },
    { name: 'tea chest', x: [[0, .5], [-.4, 1]], y: [0, .5], z: [[.3, 0], [.9, 0]] },
  ],
  driedGoods: [
    { name: 'front sacks', x: [[.3, 0], [-.3, 1]], y: [0, .5], z: [[.3, 0], [1, 0]] },
    { name: 'back sacks', x: [[.3, 0], [-.3, 1]], y: [0, .95], z: [[1, 0], [1.6, 0]] },
    { name: 'shelves of jars', x: [[.3, 0], [-.3, 1]], y: [0, 2.2], z: [[-.4, 1], [0, 1]] },
  ],
  textiles: [
    { name: 'side wall of bolts', x: [[0, 0], [.45, 0]], y: [0, 2.2], z: [[.7, 0], [-.45, 1]] },
    { name: 'back wall of bolts', x: [[.45, 0], [-.2, 1]], y: [0, 2.2], z: [[-.45, 1], [0, 1]] },
    { name: 'cutting counter', x: [[0, .45], [-.4, 1]], y: [0, .9], z: [[1.4, 0], [2.1, 0]] },
  ],
  garlands: [
    { name: 'flower counter', x: [[.3, 0], [-.3, 1]], y: [0, .85], z: [[.35, 0], [.95, 0]] },
    { name: 'shelf of lamps and fruit', x: [[.3, 0], [-.3, 1]], y: [0, 1.4], z: [[-.5, 1], [0, 1]] },
    { name: 'banana crate', x: [[0, 0], [.5, 0]], y: [0, .9], z: [[1.4, 0], [2.4, 0]] },
  ],
  spices: [
    { name: 'sacks of spice', x: [[.3, 0], [-.3, 1]], y: [0, .45], z: [[.3, 0], [1, 0]] },
    { name: 'shelves of packets', x: [[0, 0], [.35, 0]], y: [0, 2.2], z: [[1.2, 0], [-.2, 1]] },
    { name: 'counter and scale', x: [[0, .4], [-.3, 1]], y: [0, .95], z: [[-1.3, 1], [-.7, 1]] },
  ],
  carpets: [
    { name: 'stack of rugs', x: [[.3, 0], [0, .55]], y: [0, .7], z: [[.4, 0], [1.4, 0]] },
    { name: 'rolled rugs', x: [[-.9, 1], [-.2, 1]], y: [0, 1.7], z: [[-.9, 1], [-.2, 1]] },
    { name: 'cushioned seat', x: [[.3, 0], [1.6, 0]], y: [0, .4], z: [[-1.2, 1], [-.3, 1]] },
  ],
  perfumery: [
    { name: 'island', x: [[0, .32], [0, .68]], y: [0, .95], z: [[.9, 0], [2.1, 0]] },
    { name: 'lit shelves', x: [[0, 0], [.3, 0]], y: [0, 2.2], z: [[.6, 0], [-.4, 1]] },
    { name: 'lit back shelves', x: [[.5, 0], [-.3, 1]], y: [0, 2.2], z: [[-.3, 1], [0, 1]] },
  ],
  kopitiam: [
    { name: 'drinks counter', x: [[.3, 0], [0, .6]], y: [0, 1.1], z: [[-1.5, 1], [-.9, 1]] },
    { name: 'marble table', x: [[0, .5], [.9, .5]], y: [.7, .76], z: [[.5, 0], [1.4, 0]] },
    { name: 'second marble table', x: [[.3, 0], [1.1, 0]], y: [.7, .76], z: [[1, 0], [1.7, 0]] },
  ],
  kueh: [
    { name: 'kueh counter', x: [[.3, 0], [-.3, 1]], y: [0, 1.05], z: [[.5, 0], [1.1, 0]] },
    { name: 'biscuit jars', x: [[.3, 0], [-.3, 1]], y: [0, 2], z: [[-.4, 1], [0, 1]] },
    { name: 'bamboo steamers', x: [[-.9, 1], [-.3, 1]], y: [0, 1.2], z: [[1.6, 0], [2.2, 0]] },
  ],
  tailor: [
    { name: 'cutting table', x: [[0, .35], [-.3, 1]], y: [0, .85], z: [[1.3, 0], [2.1, 0]] },
    { name: 'wall of cloth', x: [[.3, 0], [-.3, 1]], y: [0, 2.2], z: [[-.4, 1], [0, 1]] },
    { name: 'sewing table', x: [[.3, 0], [1.2, 0]], y: [0, .75], z: [[.35, 0], [.85, 0]] },
  ],
  // The housing towns' shops follow, from 22; the kopitiam serves them too.
  provisionShop: [
    { name: 'crates and cartons', x: [[.3, 0], [0, .45]], y: [0, 1], z: [[.3, 0], [.9, 0]] },
    { name: 'packed shelves', x: [[-.4, 1], [0, 1]], y: [0, 2.2], z: [[.7, 0], [-.2, 1]] },
    { name: 'counter of sweet jars', x: [[.3, 0], [1.6, 0]], y: [0, 1], z: [[-1.3, 1], [-.7, 1]] },
  ],
  clinic: [
    { name: 'row of chairs', x: [[.4, 0], [0, .62]], y: [0, .45], z: [[.5, 0], [1, 0]] },
    { name: 'reception counter', x: [[0, .45], [-.3, 1]], y: [0, 1.1], z: [[-1.6, 1], [-1, 1]] },
    { name: 'medicine shelves', x: [[0, .45], [-.3, 1]], y: [0, 2], z: [[-.35, 1], [0, 1]] },
  ],
  salon: [
    { name: 'mirror counter', x: [[0, 0], [.4, 0]], y: [0, .8], z: [[1.1, 0], [-.5, 1]] },
    { name: 'wash basin', x: [[-1.2, 1], [-.3, 1]], y: [0, .9], z: [[-1, 1], [-.2, 1]] },
    { name: 'waiting sofa', x: [[0, .5], [-.4, 1]], y: [0, .45], z: [[.35, 0], [.95, 0]] },
  ],
  tuition: [
    { name: 'front desks', x: [[.4, 0], [-.4, 1]], y: [0, .72], z: [[.7, 0], [1.2, 0]] },
    { name: 'back desks', x: [[.4, 0], [-.4, 1]], y: [0, .72], z: [[1.8, 0], [2.3, 0]] },
    { name: 'bookshelf', x: [[0, 0], [.3, 0]], y: [0, 1.8], z: [[-.9, 1], [-.1, 1]] },
  ],
  bakery: [
    { name: 'bread counter', x: [[.3, 0], [-.3, 1]], y: [0, 1.05], z: [[.5, 0], [1.1, 0]] },
    { name: 'racks of loaves', x: [[.3, 0], [-.3, 1]], y: [0, 2], z: [[-.4, 1], [0, 1]] },
    { name: 'tray trolley', x: [[-.9, 1], [-.3, 1]], y: [0, 1.2], z: [[1.6, 0], [2.2, 0]] },
  ],
  // The rest of the island's trades follow, from 27: Geylang's fruit and lamps, Thomson's plants, the resort's keepsakes and boards, Ubin's bicycles.
  fruitStall: [
    { name: 'tiers of fruit', x: [[.3, 0], [-.3, 1]], y: [0, .9], z: [[.3, 0], [1, 0]] },
    { name: 'crates', x: [[.3, 0], [0, .55]], y: [0, 1.1], z: [[-.9, 1], [-.2, 1]] },
    { name: 'weighing counter', x: [[0, .62], [-.3, 1]], y: [0, 1], z: [[-1.3, 1], [-.7, 1]] },
  ],
  lighting: [
    { name: 'table of lamps', x: [[.4, 0], [-.4, 1]], y: [0, .7], z: [[.3, 0], [.95, 0]] },
    { name: 'shelves of lamps', x: [[0, 0], [.4, 0]], y: [0, 2.1], z: [[1.3, 0], [-.3, 1]] },
    { name: 'counter', x: [[-1.6, 1], [-.4, 1]], y: [0, 1], z: [[-1.2, 1], [-.6, 1]] },
  ],
  nursery: [
    { name: 'tiered plant stand', x: [[.3, 0], [-1.3, 1]], y: [0, 1.3], z: [[-.8, 1], [-.1, 1]] },
    { name: 'bench of pots', x: [[.3, 0], [-.3, 1]], y: [0, .6], z: [[.3, 0], [1, 0]] },
    { name: 'sacks of soil', x: [[-1.1, 1], [-.3, 1]], y: [0, .8], z: [[-1.4, 1], [-.5, 1]] },
  ],
  souvenirs: [
    { name: 'table of trinkets', x: [[.4, 0], [-.4, 1]], y: [0, .8], z: [[.3, 0], [.95, 0]] },
    { name: 'wall of folded shirts', x: [[-.35, 1], [0, 1]], y: [0, 2.2], z: [[1.2, 0], [-.3, 1]] },
    { name: 'counter', x: [[.3, 0], [1.5, 0]], y: [0, 1], z: [[-1.3, 1], [-.7, 1]] },
  ],
  surfShop: [
    { name: 'window deck', x: [[.4, 0], [-.4, 1]], y: [0, .45], z: [[.3, 0], [.95, 0]] },
    { name: 'rail of swimwear', x: [[-.5, 1], [0, 1]], y: [.85, 1.8], z: [[1.4, 0], [-.3, 1]] },
    { name: 'till', x: [[.3, 0], [1.5, 0]], y: [0, 1], z: [[-1.2, 1], [-.6, 1]] },
  ],
  bicycles: [
    { name: 'rubber mat', x: [[.3, 0], [-.3, 1]], y: [0, .08], z: [[.3, 0], [.95, 0]] },
    { name: 'workbench', x: [[.3, 0], [0, .55]], y: [0, .9], z: [[-.8, 1], [-.2, 1]] },
    { name: 'helmet shelves', x: [[-.4, 1], [0, 1]], y: [0, 2.1], z: [[1.2, 0], [-.3, 1]] },
  ],
} as const satisfies Record<string, readonly [RoomBox, RoomBox, RoomBox]>;
export type ShopName = keyof typeof SHOP_LAYOUTS;
/** The shopping belt's ten: what a district's designed shop windows are when it names no shops of its own. */
/** What trades under the flats of a housing town. */
export const HEARTLAND_SHOPS: readonly ShopName[] = ['kopitiam', 'provisionShop', 'clinic', 'salon', 'tuition', 'bakery'];
export const MALL_SHOPS: readonly ShopName[] = ['fashion', 'jeweller', 'electronics', 'bookshop', 'cafe', 'sports', 'beauty', 'toys', 'florist', 'bags'];
/**
 * Designed shop windows: how deep into a shop a box may start and still be the window display (left out of a
 * doorway), the share that carry a promotion strip across the glass, the share lit after dark, how brightly
 * against `INTERIOR.nightShopfront`, how much of their own light they show by day, and the `stride` by which
 * bays step through the shops. A glazed wall of shop units (a material whose `userData.nightShopWindow` is true
 * or a list of SHOP_LAYOUTS names) has bays about `bay` wide, glazed from a `rail` off the floor to `head`. The shop's name is `sign[1]` tall at
 * `sign[0]` up the back wall, and `decal[1]` tall in vinyl `decal[0]` above the foot of the glass.
 */
export const SHOP_WINDOWS = { display: 1, strip: .3, lit: .88, night: .62, day: .16, stride: 3, bay: 3, rail: .2, head: 2.8, sign: [2.36, .2], decal: [.2, .12] } as const;
/**
 * Which shop the designed shop window in bay `bay` of a building shows, for the building's own whole-number
 * offset: bays step through the shops by `stride`, so no two neighbours match. Mirrors the GLSL.
 */
export const shopWindow = (bay: number, building: number, shops: readonly ShopName[] = MALL_SHOPS) => shops[(bay * shopStride(shops.length) + building) % shops.length];
/** `stride`, unless it shares a factor with the number of shops, when bays simply take them in turn. */
export const shopStride = (count: number) => count % SHOP_WINDOWS.stride ? SHOP_WINDOWS.stride : 1;
/** How often an office's third box gives way to a blind lowered part of the way down the glass. */
export const BLINDS = { openPlan: .45, meeting: .5, clerical: .7, stockroom: .4 } as const;
/**
 * What a building's upper floors hold: homes, or offices in `offices` of the district's buildings (0-1), and
 * whether those offices are the business district's (`cbd`) or the plainer kind found everywhere else.
 * `boutiques` is the share of its shopfronts that are designed shop windows (SHOP_LAYOUTS) rather than the
 * plain corner shop; none when left out. `shops` names which ones (MALL_SHOPS when left out). `rooms` is the
 * share of buildings that are hotels, factories or schools instead (SPECIAL_LAYOUTS), taken before the offices.
 */
export type NightInteriors = { offices: number; cbd: boolean; boutiques?: number; shops?: readonly ShopName[]; rooms?: Partial<Record<RoomKind, number>> };
/** The sky glass reflects, in scene values: the district look's uniforms have this shape. */
export type NightSky = Record<'lookHorizon' | 'lookZenith' | 'lookGround', { value: THREE.Vector3 }>;
/** How often a home's third box gives way to a curtain, by layout: a kitchen keeps its fridge. Of those, `drawn` are pulled right across. */
export const CURTAINS = { living: .6, bedroom: .7, kitchen: 0, study: .5, drawn: .18 } as const;
/** A furniture box in metres for a room this wide and deep: low and high corners (across, up, in from the inside of the wall). */
export function roomBox(box: RoomBox, width: number, depth: number) {
  const at = (s: RoomSpan, size: number) => s[0] + s[1] * size;
  return { low: [at(box.x[0], width), box.y[0], at(box.z[0], depth)] as const, high: [at(box.x[1], width), box.y[1], at(box.z[1], depth)] as const };
}
const glslSpan = (s: RoomSpan, size: string, offset = '') => `${offset}${s[0].toFixed(2)}${s[1] ? ` + ${s[1].toFixed(2)} * ${size}` : ''}`;
const glslBox = (box: RoomBox, name: string) => `${name}Low = vec3(${glslSpan(box.x[0], 'size.x')}, ${box.y[0].toFixed(2)}, ${glslSpan(box.z[0], 'depth', 'reveal + ')}); ${name}High = vec3(${glslSpan(box.x[1], 'size.x')}, ${box.y[1].toFixed(2)}, ${glslSpan(box.z[1], 'depth', 'reveal + ')});`;
/** The GLSL that sets the three furniture boxes for `plan` (0-7, in ROOM_PLANS order) and its curtain share. */
/** Every plan a window can show, in the order the shader numbers them: four homes, two business-district offices, two plain ones, then two each of hotel, factory and school. */
const ROOM_PLANS: readonly { boxes: readonly [RoomBox, RoomBox, RoomBox]; hung: number }[] = [
  ...(Object.keys(HOME_LAYOUTS) as (keyof typeof HOME_LAYOUTS)[]).map(key => ({ boxes: HOME_LAYOUTS[key], hung: CURTAINS[key] })),
  ...(Object.keys(OFFICE_LAYOUTS) as (keyof typeof OFFICE_LAYOUTS)[]).map(key => ({ boxes: OFFICE_LAYOUTS[key], hung: BLINDS[key] })),
  ...Object.values(SPECIAL_LAYOUTS).flatMap(kind => Object.entries(kind).map(([key, boxes]) => ({ boxes, hung: SPECIAL_HUNG[key as keyof typeof SPECIAL_HUNG] }))),
];
/** The shader's number for a special kind of room: 4 a hotel, 5 a factory, 6 a school. */
export const roomUse = (kind: RoomKind) => 4 + Object.keys(SPECIAL_LAYOUTS).indexOf(kind);
const HOME_BOXES_GLSL = ROOM_PLANS.map((plan, i, all) =>
  `${i ? 'else ' : ''}${i < all.length - 1 ? `if (plan < ${i}.5) ` : ''}{ ${plan.boxes.map((box, n) => glslBox(box, 'abc'[n])).join(' ')} curtainShare = ${plan.hung.toFixed(2)}; }`).join('\n              ');
/**
 * Made-up brands, two a shop: none is a real company's name or mark. A digit is the brand's mark, drawn from
 * `SHOP_FONT` like a letter. Each shop shows its name on the back wall and in vinyl on the glass, and some stock
 * carries the mark: the bag on its stand, the toy boxes, the sports mannequins' shirts.
 */
export const SHOP_BRANDS = {
  fashion: ['0 NYELLE', '0 ATELIA'], jeweller: ['1 AURELINE', '1 KARATI'], electronics: ['2 VOLTARA', '2 PIXELO'],
  bookshop: ['3 PAGEWELL', '3 INKLEAF'], cafe: ['4 BREWLAH', '4 KOPIKAT'], sports: ['5 SPRYNT', '5 ZEPHRA'],
  beauty: ['6 PETALLE', '6 GLOSSA'], toys: ['7 WOBBLO', '7 TOYOYO'], florist: ['8 BLOOMERY', '8 FLEURA'], bags: ['1 ORLAINE', '0 MAISONVU'],
  medicineHall: ['3 HERBWELL', '8 GINSENGO'], teaMerchant: ['4 PEKOELAH', '4 OOLONGA'], driedGoods: ['3 LARDERLY', '7 SUNDRYCO'],
  textiles: ['0 SILKARA', '1 WEAVELY'], garlands: ['8 MALLIPOO', '8 JASMINA'], spices: ['1 MASALAJI', '5 SPICERY'],
  carpets: ['1 KILIMAH', '3 RUGSOUK'], perfumery: ['6 ATTARIA', '1 OUDELLE'], kopitiam: ['4 KOPIJOO', '4 KAYALAH'],
  kueh: ['8 KUEHLALA', '7 KUEHBOX'], tailor: ['0 STITCHLY', '0 KEBAYANA'],
  provisionShop: ['7 MAMAMART', '3 KEDAIKU'], clinic: ['9 FAMCARE', '9 WELLDOC'], salon: ['0 SNIPPY', '5 HAIRLAH'],
  tuition: ['7 ACEKIDS', '2 MINDSPRO'], bakery: ['4 BUNLAH', '6 LOAFERY'],
  fruitStall: ['7 DURILAH', '8 FRUTERA'], lighting: ['2 LUMIGLO', '1 LAMPARIA'], nursery: ['8 LEAFLAH', '8 POTTERRA'],
  souvenirs: ['6 TRINKETO', '1 ISLEMEMO'], surfShop: ['5 WAVELAH', '5 SANDORA'], bicycles: ['2 PEDALAH', '5 KAYUHGO'],
} as const satisfies Record<keyof typeof SHOP_LAYOUTS, readonly [string, string]>;
/** Capitals and brand marks three blocks wide and five tall, rows from the top: the signs are as blocky as the city. */
export const SHOP_FONT: Record<string, string> = {
  A: '010 101 111 101 101', B: '110 101 110 101 110', C: '011 100 100 100 011', D: '110 101 101 101 110', E: '111 100 110 100 111',
  F: '111 100 110 100 100', G: '011 100 101 101 011', H: '101 101 111 101 101', I: '111 010 010 010 111', J: '001 001 001 101 010',
  K: '101 101 110 101 101', L: '100 100 100 100 111', M: '101 111 111 101 101', N: '110 101 101 101 101', O: '010 101 101 101 010',
  P: '110 101 110 100 100', Q: '010 101 101 111 011', R: '110 101 110 101 101', S: '011 100 010 001 110', T: '111 010 010 010 010',
  U: '101 101 101 101 111', V: '101 101 101 101 010', W: '101 101 111 111 101', X: '101 101 010 101 101', Y: '101 101 010 010 010',
  Z: '111 001 010 100 111', ' ': '000 000 000 000 000',
  // Marks: a slash, a diamond, a bolt, a frame, a cup, a chevron, a heart, a block, a flower, a cross.
  0: '001 001 010 100 100', 1: '010 111 111 111 010', 2: '001 010 111 010 100', 3: '111 101 101 101 111', 4: '000 111 111 010 111',
  5: '100 010 001 010 100', 6: '101 111 111 111 010', 7: '111 111 111 111 111', 8: '101 010 111 010 101', 9: '010 010 111 010 010',
};
const SHOP_GLYPHS = Object.keys(SHOP_FONT), BRAND_LENGTH = 10;
const SHOP_BRAND_LIST = Object.values(SHOP_BRANDS).flat();
const SHOP_SIGN_GLSL = `
          // Shop signs: capitals and marks three blocks by five, a bit a block, and the brands spelt in them.
          const int nightFont[${SHOP_GLYPHS.length}] = int[${SHOP_GLYPHS.length}](${SHOP_GLYPHS.map(c => parseInt(SHOP_FONT[c].replace(/ /g, ''), 2)).join(', ')});
          const int nightBrand[${SHOP_BRAND_LIST.length * BRAND_LENGTH}] = int[${SHOP_BRAND_LIST.length * BRAND_LENGTH}](${SHOP_BRAND_LIST.flatMap(name => [...name.padEnd(BRAND_LENGTH)].map(c => SHOP_GLYPHS.indexOf(c))).join(', ')});
          const int nightBrandLength[${SHOP_BRAND_LIST.length}] = int[${SHOP_BRAND_LIST.length}](${SHOP_BRAND_LIST.map(name => name.length).join(', ')});
          float nightGlyph(int glyph, vec2 uv) {
            ivec2 at = ivec2(floor(vec2(uv.x * 4.0, (1.0 - uv.y) * 5.0)));
            if (uv.x < 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y > 1.0 || at.x > 2) return 0.0;
            return float((nightFont[glyph] >> (14 - at.y * 3 - at.x)) & 1);
          }
          // A brand's name h tall, centred on a point of a wall or the glass. The facade coordinate grows to the
          // viewer's left, so the letters are laid out against it, except in a room that is itself mirrored.
          float nightSign(int brand, vec2 q, vec2 centre, float h, float mirrored) {
            int count = nightBrandLength[brand];
            vec2 uv = (q - centre) / vec2(float(count) * h * .8, h) + .5;
            if (mirrored < .5) uv.x = 1.0 - uv.x;
            if (uv.x < 0.0 || uv.x >= 1.0) return 0.0;
            float along = uv.x * float(count);
            return nightGlyph(nightBrand[brand * ${BRAND_LENGTH} + int(along)], vec2(fract(along), uv.y));
          }`;
/**
 * Cuts from a shader the shop designs it will never draw. The shader source holds every shop (SHOP_LAYOUTS),
 * but a district shows a handful, and a program that carried all of them took several times as long to compile:
 * long enough on some GPUs to hold up the whole browser while a district loaded. Every block opened by a test on
 * `shopKind` alone is emptied unless one of its numbers is in `used`; chains of else-ifs stay well formed.
 */
export function pruneShopBranches(source: string, used: readonly number[]) {
  return pruneBlocks(source, /if \(((?:shopKind == \d+)(?: \|\| shopKind == \d+)*)\) \{/g, match => [...match[1].matchAll(/\d+/g)].some(n => used.includes(+n[0])));
}
/**
 * Cuts the rooms a program will never draw (the same saving as `pruneShopBranches`): every block whose test names
 * a hotel, a factory or a school, unless `kinds` has it, and every block for designed shops when there are none.
 */
export function pruneRoomBranches(source: string, kinds: readonly RoomKind[], shops: boolean) {
  if (!kinds.includes('hotel')) source = pruneBlocks(source, /if \([^(){};]*hotel > \.5[^(){};]*\) \{/g, () => false);
  if (!kinds.includes('classroom')) source = pruneBlocks(source, /if \([^(){};]*plan > 1[12]\.5[^(){};]*\) \{/g, () => false);
  if (!kinds.includes('factory')) source = pruneBlocks(source, /if \([^(){};]*plan > 9\.5[^(){};]*\) \{/g, () => false);
  if (!shops) source = pruneBlocks(source, /if \(shop > \.5[^(){};]*\) \{/g, () => false);
  return source;
}
/** Empties every block `test` opens unless `keep` says otherwise; an else-if chain stays well formed. */
function pruneBlocks(source: string, test: RegExp, keep: (match: RegExpExecArray) => boolean) {
  let out = '', from = 0;
  for (let match = test.exec(source); match; match = test.exec(source)) {
    if (keep(match)) continue;
    let depth = 1, at = match.index + match[0].length;
    for (; depth && at < source.length; at++) depth += source[at] === '{' ? 1 : source[at] === '}' ? -1 : 0;
    if (depth) break;
    out += `${source.slice(from, match.index)}if (false) {}`;
    from = test.lastIndex = at;
  }
  return out + source.slice(from);
}
const SHOP_BOXES_GLSL = Object.values(SHOP_LAYOUTS).map((boxes, i, all) =>
  `${i ? 'else ' : ''}${i < all.length - 1 ? `if (shopKind == ${i + 1}) ` : ''}{ ${boxes.map((box, n) => glslBox(box, 'abc'[n])).join(' ')} }`).join('\n              ');
/**
 * Reflection in glass. `headOn` is the share reflected looking straight at a pane, rising to all of it at a
 * glance by `power`; `strength` scales what generated windows and shopfronts add, `authored` what modelled
 * panes add; the reflected skyline has `blocks` buildings round the horizon between `skylineLow` and
 * `skylineHigh` (tangent of elevation), and the sun's glint is `glint` sharp. `dayRoom` is how much of an
 * unlit room shows through the glass by day.
 */
export const REFLECTION = { headOn: .2, power: 3, strength: .9, authored: .55, blocks: 36, skylineLow: .05, skylineHigh: .7, glint: 260, dayRoom: .3 } as const;
/** The share of a pane's view that is reflection, for the cosine of the angle between the view and the glass's normal. Mirrors `nightFresnel`. */
export const glassReflection = (facing: number) => REFLECTION.headOn + (1 - REFLECTION.headOn) * (1 - Math.max(0, Math.min(1, facing))) ** REFLECTION.power;
/** Rain streaks under the roof edge of building-sized walls: column width and lengths in metres, the share of columns streaked, and how much they darken. */
export const STREAKS = { width: .55, share: .5, shortest: 1.2, longest: 9, darken: .11 } as const;
/** How far down from the roof edge a streak with this seed runs, metres. Mirrors the GLSL. */
export const streakLength = (seed: number) => STREAKS.shortest + seed * seed * (STREAKS.longest - STREAKS.shortest);
/** What a bay holds for a seed in 0-1. Mirrors the GLSL. */
export function storefrontBay(seed: number): 'blank' | 'door' | 'shopfront' {
  return seed < STOREFRONT.blank ? 'blank' : seed <= STOREFRONT.blank + STOREFRONT.door ? 'door' : 'shopfront';
}
/** A box, prism or tower at least two storeys tall and a room deep: worth windows. */
export function buildingSized(box: THREE.Box3) {
  const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
  return h >= 7 && Math.min(w, d) >= 4.5 && Math.max(w, d) <= 260 && box.max.y >= 7;
}
const WINDOW_SHAPES = new Set(['BoxGeometry', 'ExtrudeGeometry', 'CylinderGeometry']);
const uprightAxis = new THREE.Vector3();
/**
 * Square to the ground, with one of its own axes plumb: a pitched roof slab is
 * tall enough to pass for a building, but its ends are no facades.
 */
export function upright(matrix: THREE.Matrix4) {
  return [0, 1, 2].some(column => Math.abs(uprightAxis.setFromMatrixColumn(matrix, column).normalize().y) > .995);
}
/** Groups whose contents are terrain, decks or windowless boundary scenery. */
const NO_WINDOWS = new Set(['Connected elevated places', 'Walkable elevated routes', 'district-boundaries']);

/**
 * Adds colour, and covers the sky behind it by its own brightness: the world
 * view composites the scene over a separately cleared sky, so plain additive
 * blending would leave dark fringes against it.
 */
const GLOW_BLENDING = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor } as const;

type Lit = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
const lit = (m: THREE.Material): m is Lit => m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial;
/** Planting, water and glass panes keep their own look at night. */
function windowable(m: Lit) {
  if (m.transparent || m.userData.fpsWater) return false;
  const { r, g, b } = m.color;
  return !(g > r * 1.15 && g > b * 1.05);
}

export function createNightLights(scene: THREE.Scene, options: { roads: readonly RegionRoad[]; roadWidth: number; bounds: RegionBounds; obstacles: readonly Obstacle[]; interiors?: NightInteriors }) {
  const { bounds } = options;
  const surfaces = getWalkSurfaces(scene);
  scene.updateMatrixWorld(true);
  // Water and raised decks: a lamp is never stood in the bay or under a bridge.
  const water: THREE.Box3[] = [];
  scene.traverse(o => { if (o instanceof THREE.Mesh && o.userData.fpsWater) water.push(new THREE.Box3().setFromObject(o)); });
  const ground = (x: number, z: number) => {
    if (water.some(b => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y < 2)) return null;
    const base=bounds.groundHeight?.(x,z)??0;
    let y = base, raised = false;
    for (const s of surfaces as readonly WalkSurface[]) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
      if (s.solidBelow) y = Math.max(y, surfaceHeight(s, x, z)); else raised = true;
    }
    return raised && y === base ? null : y;
  };
  const streets = placeStreetLamps(options.roads, options.roadWidth, options.obstacles, bounds, { ground });
  const lamps = [...streets, ...placePathLamps(streets, options.roads, options.roadWidth, options.obstacles, bounds, { ground })];
  const baked = bakeLampMap(lamps, bounds, [...options.obstacles, ...getTraversalObstacles(scene)]);
  const map = new THREE.DataTexture(baked.data, baked.width, baked.height, THREE.RGBAFormat);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearFilter; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
  const uniforms = {
    nightLevel: { value: 0 },
    /** Pools only read once the sky has dimmed, so they follow the night more steeply than the lamps themselves. */
    nightPool: { value: 0 },
    nightMap: { value: map },
    nightBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)) },
    nightLampColor: { value: new THREE.Color('#ffd9a6').multiplyScalar(4.5) },
    nightWindowShare: { value: .48 },
    /** Seconds, wrapped every 21 minutes: drives windows switching and screen flicker. */
    nightClock: { value: 0 },
    /** 0 with reduced motion: no flicker, no switching. */
    nightMotion: { value: 1 },
    /** Share of buildings whose upper floors are offices, and 1 where those are the business district's. */
    nightOffice: { value: new THREE.Vector2(options.interiors?.offices ?? 0, options.interiors?.cbd ? 1 : 0) },
    /** Share of buildings that are hotels, factories and schools. */
    nightRooms: { value: new THREE.Vector3(options.interiors?.rooms?.hotel ?? 0, options.interiors?.rooms?.factory ?? 0, options.interiors?.rooms?.classroom ?? 0) },
    /** Share of shopfronts that are designed shop windows. */
    nightShops: { value: options.interiors?.boutiques ?? 0 },
    /** What glass reflects: the sky at the horizon and overhead and the ground under it, the direction of the sun or moon, and its colour at its present strength. */
    nightSky: { value: new THREE.Vector3(.72, .86, .92) },
    nightZenith: { value: new THREE.Vector3(.5, .7, .9) },
    nightGround: { value: new THREE.Vector3(.4, .42, .42) },
    nightSun: { value: new THREE.Vector3(0, 1, 0) },
    nightSunColor: { value: new THREE.Color(0, 0, 0) },
  };
  const sunColor = new THREE.Color();
  const reducedMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const moving = createMovingLights();

  // Lamp furniture: instanced poles and arms, emissive heads, and soft halos.
  const root = new THREE.Group(); root.name = 'night-lights'; root.userData.fpsEffect = true; scene.add(root);
  const poleGeometry = new THREE.CylinderGeometry(.07, .11, 1, 6), armGeometry = new THREE.BoxGeometry(1, 1, 1), headGeometry = new THREE.BoxGeometry(1, 1, 1);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: '#6c7377', roughness: .6, metalness: .4 });
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#4d5256' });
  const count = Math.max(1, lamps.length);
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, count), arms = new THREE.InstancedMesh(armGeometry, poleMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const haloPositions = new Float32Array(count * 3), haloSizes = new Float32Array(count);
  lamps.forEach((lamp, i) => {
    const yaw = Math.atan2(-lamp.dz, lamp.dx), path = !lamp.dx && !lamp.dz; rotation.setFromAxisAngle(up, yaw);
    poles.setMatrixAt(i, matrix.compose(position.set(lamp.x, lamp.y + lamp.height / 2, lamp.z), rotation, scale.set(path ? .8 : 1, lamp.height, path ? .8 : 1)));
    arms.setMatrixAt(i, matrix.compose(position.set(lamp.x + lamp.dx * ARM / 2, lamp.y + lamp.height - .05, lamp.z + lamp.dz * ARM / 2), rotation, path ? scale.set(0, 0, 0) : scale.set(ARM, .09, .09)));
    const hx = lamp.x + lamp.dx * ARM, hz = lamp.z + lamp.dz * ARM, hy = lamp.y + lamp.height + (path ? .2 : -.16);
    // A street head is a flat luminaire under the arm; a path lamp a lantern on top of its post.
    heads.setMatrixAt(i, matrix.compose(position.set(hx, hy, hz), rotation, path ? scale.set(.34, .48, .34) : scale.set(.95, .14, .38)));
    haloPositions.set([hx, hy - (path ? 0 : .1), hz], i * 3);
    haloSizes[i] = path ? 2.2 : 3.2;
  });
  for (const mesh of [poles, arms, heads]) { mesh.count = lamps.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh); }
  const haloGeometry = new THREE.BufferGeometry(); haloGeometry.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
  haloGeometry.setAttribute('size', new THREE.BufferAttribute(haloSizes, 1));
  haloGeometry.setDrawRange(0, lamps.length);
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, color: { value: new THREE.Color('#ffd49a') }, scale: { value: 600 }, fogNear: { value: 150 }, fogFar: { value: 700 } },
    vertexShader: `uniform float scale; attribute float size; varying float vDepth;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); vDepth = -view.z; gl_Position = projectionMatrix * view; gl_PointSize = clamp(scale * size / max(1.0, vDepth), 2.0, 160.0); }`,
    fragmentShader: `uniform float level, fogNear, fogFar; uniform vec3 color; varying float vDepth;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; if (r > 1.0) discard;
        float glow = pow(1.0 - r, 2.2) * .55 + exp(-r * r * 40.0) * .9;
        float fade = 1.0 - smoothstep(fogNear, fogFar, vDepth);
        vec3 c = color * glow * level * fade; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const halos = new THREE.Points(haloGeometry, haloMaterial); halos.frustumCulled = false; halos.renderOrder = 2; root.add(halos);

  // A night sky: stars over the upper dome and the moon where the key light comes from, both at infinity and thinned by cloud.
  const starCount = 1100, starPositions = new Float32Array(starCount * 3), starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const r1 = Math.abs(Math.sin(i * 91.7) * 43758.5453) % 1, r2 = Math.abs(Math.sin(i * 47.3 + 1.3) * 24634.6345) % 1, r3 = Math.abs(Math.sin(i * 13.1 + 7.7) * 9151.73) % 1;
    const y = .06 + .94 * Math.sqrt(r1), ring = Math.sqrt(1 - y * y), angle = r2 * Math.PI * 2;
    starPositions.set([Math.cos(angle) * ring, y, Math.sin(angle) * ring], i * 3);
    starSizes[i] = r3 > .97 ? 2.6 : r3 > .85 ? 1.8 : 1.2;
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3)); starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const skyVertex = `attribute float size; uniform float pixel; varying float vSize;
    void main() { vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0); gl_Position = clip.xyww; gl_PointSize = size * pixel; vSize = size; }`;
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, pixel: { value: 1 } },
    vertexShader: skyVertex,
    fragmentShader: `uniform float level; varying float vSize;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; if (r > 1.0) discard;
        vec3 c = vec3(.85, .9, 1.0) * (1.0 - r * r) * level * (.35 + .25 * vSize); gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const stars = new THREE.Points(starGeometry, starMaterial); stars.frustumCulled = false; stars.renderOrder = -1; root.add(stars);
  const moonGeometry = new THREE.BufferGeometry(); moonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0]), 3)); moonGeometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array([34]), 1));
  const moonMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, pixel: { value: 1 } },
    vertexShader: skyVertex,
    fragmentShader: `uniform float level;
      void main() { vec2 p = (gl_PointCoord - .5) * 2.0; float r = length(p);
        float disc = 1.0 - smoothstep(.36, .4, r), glow = pow(max(0.0, 1.0 - r), 3.0) * .35;
        float mare = .86 + .14 * sin(p.x * 9.0 + 1.3) * sin(p.y * 7.0 - .4);
        vec3 c = (vec3(1.0, .97, .88) * 1.6 * disc * mare + vec3(.55, .65, .9) * glow) * level; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const moon = new THREE.Points(moonGeometry, moonMaterial); moon.frustumCulled = false; moon.renderOrder = -1; root.add(moon);
  const moonPosition = moonGeometry.getAttribute('position') as THREE.BufferAttribute;
  root.traverse(object => { object.raycast = () => {}; object.userData.fpsEffect = true; });

  // Every lit material in the district samples the lamp map; building-sized meshes also get windows.
  const patched = new WeakMap<THREE.Material, { compile: Lit['onBeforeCompile']; key: Lit['customProgramCacheKey'] }>();
  const windowed = new Map<THREE.Material, Lit>();
  const swaps: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; attributes: THREE.BufferAttribute[] }[] = [];
  const shopNames = Object.keys(SHOP_LAYOUTS);
  /** The district's designed shop windows on generated shopfronts, as shader numbers. */
  const frontShops = (options.interiors?.shops ?? MALL_SHOPS).map(name => shopNames.indexOf(name) + 1);
  /** The designed shops this district's generated shopfronts can show: none where it has no share of them. */
  /** The special rooms the district gives a share of its buildings. */
  const roomKindsUsed = (Object.keys(SPECIAL_LAYOUTS) as RoomKind[]).filter(kind => (options.interiors?.rooms?.[kind] ?? 0) > 0);
  const frontUsed = (options.interiors?.boutiques ?? 0) > 0 ? frontShops : [];
  function patch(material: Lit, windows: boolean, panes = false, shops: readonly number[] | null = null, rooms = 0) {
    if (patched.has(material)) return;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    patched.set(material, { compile, key });
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms, moving.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vNightWorld, vNightNormal;${windows ? '\nattribute vec2 nightSpan, nightEdge;\nattribute vec3 nightTangent;\nvarying vec2 vNightSpan, vNightEdge;\nvarying float vNightSeed;' : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 nightWorld = vec4(transformed, 1.0); vec3 nightNormal = objectNormal;
          #ifdef USE_INSTANCING
            nightWorld = instanceMatrix * nightWorld; nightNormal /= vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
            nightNormal = mat3(instanceMatrix) * nightNormal;
          #endif
          vNightWorld = (modelMatrix * nightWorld).xyz; nightNormal /= vec3(dot(modelMatrix[0].xyz, modelMatrix[0].xyz), dot(modelMatrix[1].xyz, modelMatrix[1].xyz), dot(modelMatrix[2].xyz, modelMatrix[2].xyz));
          vNightNormal = mat3(modelMatrix) * nightNormal;${windows ? `
vNightSpan = nightSpan;
vec3 nightT = nightTangent; vec4 nightSeed = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  nightT = mat3(instanceMatrix) * nightT; nightSeed = instanceMatrix * nightSeed;
#endif
vNightEdge = nightEdge * length(mat3(modelMatrix) * nightT);
vec3 nightCenter = (modelMatrix * nightSeed).xyz;
// Hash once per vertex; hashing interpolated world coordinates in the fragment
// shader amplifies rounding into stripes across an otherwise constant pane.
vNightSeed = fract(sin(dot(nightCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453);` : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float nightLevel, nightPool, nightWindowShare; uniform sampler2D nightMap; uniform vec4 nightBounds; uniform vec3 nightLampColor;
          varying vec3 vNightWorld, vNightNormal;${windows ? `
          varying vec2 vNightSpan, vNightEdge;
          varying float vNightSeed;
          uniform float nightClock, nightMotion, nightShops;
          uniform vec2 nightOffice; uniform vec3 nightRooms; uniform vec3 nightSky, nightZenith, nightGround, nightSun, nightSunColor;
          // What glass reflects, for a direction: a cube map worked out rather than stored. The sky as it is
          // drawn now, paler at the horizon; a skyline of blocks round the horizon; the ground below; and a glint where the direction meets the sun.
          float nightSkyHash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
          vec3 nightSkyBox(vec3 dir) {
            float flat_ = max(length(dir.xz), 1e-3), rise = dir.y / flat_;
            vec3 sky = mix(nightSky, nightZenith, pow(clamp(dir.y, 0.0, 1.0), .55));
            float turn = atan(dir.z, dir.x) * ${(REFLECTION.blocks / (2 * Math.PI)).toFixed(3)};
            float block = floor(turn), tall = ${REFLECTION.skylineLow.toFixed(2)} + ${(REFLECTION.skylineHigh - REFLECTION.skylineLow).toFixed(2)} * nightSkyHash(vec2(block, 3.0)) * nightSkyHash(vec2(floor(turn * .31), 7.0));
            vec3 city = nightGround * (.45 + .4 * nightSkyHash(vec2(block, 11.0)));
            vec3 ground = nightGround * .55;
            vec3 seen = rise < 0.0 ? ground : rise < tall ? city : sky;
            return seen + nightSunColor * (pow(max(dot(dir, nightSun), 0.0), ${REFLECTION.glint.toFixed(1)}) * 6.0 * step(tall, rise));
          }
          // How much of what it faces glass gives back, by the cosine of the angle of view: some head on, nearly all at a glance.
          float nightFresnel(float facing) { return mix(${REFLECTION.headOn.toFixed(2)}, 1.0, pow(1.0 - clamp(facing, 0.0, 1.0), ${REFLECTION.power.toFixed(1)})); }
          // About one window in six belongs to someone who comes and goes: it is
          // decided afresh every two and a half minutes, each on its own schedule.
          float nightWindowLit(float h) {
            float restless = step(.83, fract(h * 5.31)) * nightMotion;
            float epoch = floor(nightClock / 150.0 + fract(h * 17.3));
            float roll = fract(sin(epoch * 91.7 + h * 311.7) * 43758.5453);
            return step(1.0 - nightWindowShare, mix(h, roll, restless));
          }
          // A few lit rooms have a screen on: a cool, unsteady glow rather than lamplight.
          vec3 nightWindowTint(float h, vec3 tint) {
            float screen = step(.965, fract(h * 11.7)) * nightMotion, t = nightClock + h * 50.0;
            float flicker = .6 + .25 * sin(t * 5.1) * sin(t * 2.3 + 1.7) + .15 * sin(t * 13.7 + h * 9.0);
            return mix(tint, vec3(.5, .66, 1.0) * flicker, screen);
          }
          // Interior mapping: a room seen through a point on its glass, with no geometry behind it: a shop
          // behind a shopfront (home 0), someone's home behind a lit window (home 1).
          // p is metres from the room's left wall and floor, size its width and height, open the glazed
          // opening in the same metres (left, bottom, right, top), d the view direction along the facade, up
          // and into the wall. The ray first crosses the wall's own thickness, where it may meet the frame;
          // then it is carried to the furniture or the room's shell, and the hit is lit from a ceiling lamp.
          // Returns colour and, in alpha, 1 for the room and 0 for the frame. Mirrors interiorHit for the shell.
          float nightRoomHash(float v) { return fract(sin(v * 91.345) * 47453.5453); }
          float nightBoxHit(vec3 from, vec3 dir, vec3 low, vec3 high, out vec3 normal) {
            vec3 a = (low - from) / dir, b = (high - from) / dir, near = min(a, b), far = max(a, b);
            float enter = max(near.x, max(near.y, near.z)), leave = min(far.x, min(far.y, far.z));
            normal = -sign(dir) * step(near.yzx, near.xyz) * step(near.zxy, near.xyz);
            return enter > leave || enter < 0.0 ? 1e9 : enter;
          }
          // How far a point is from the line between two others.
          float nightSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
          float nightRect(vec2 q, vec2 low, vec2 high) { return step(low.x, q.x) * step(q.x, high.x) * step(low.y, q.y) * step(q.y, high.y); }
          vec3 nightPicture(vec3 under, vec2 q, vec2 low, vec2 high, vec3 art) {
            return mix(under, mix(vec3(.16, .13, .11), art * (.7 + .3 * step(.5, fract((q.x + q.y) * 2.3))), nightRect(q, low + .06, high - .06)), nightRect(q, low, high));
          }
${SHOP_SIGN_GLSL}
          // Bright stock: toys, trainers, book covers, flowers.
          vec3 nightPalette(float h) { h = fract(h) * 6.0; return h < 1.0 ? vec3(.86, .22, .2) : h < 2.0 ? vec3(.95, .72, .16) : h < 3.0 ? vec3(.2, .5, .8) : h < 4.0 ? vec3(.22, .62, .4) : h < 5.0 ? vec3(.9, .45, .62) : vec3(.93, .92, .88); }
          // What clothes and bags come in: black, white, camel, denim, red, olive.
          vec3 nightGarment(float h) { h = fract(h); return h < .25 ? vec3(.12) : h < .45 ? vec3(.9, .89, .86) : h < .6 ? vec3(.76, .64, .46) : h < .75 ? vec3(.25, .35, .52) : h < .88 ? vec3(.7, .2, .22) : vec3(.4, .45, .28); }
          // Rug dyes, and a rug: a border, a field of small motifs and a medallion.
          vec3 nightCarpetColor(float h) { h = fract(h); return h < .3 ? vec3(.6, .12, .12) : h < .5 ? vec3(.12, .18, .4) : h < .7 ? vec3(.8, .6, .25) : h < .85 ? vec3(.88, .82, .68) : vec3(.1, .4, .42); }
          vec3 nightCarpet(vec2 uv, float h) {
            vec3 field = nightCarpetColor(h), figure = nightCarpetColor(h + .37);
            vec2 c = abs(uv - .5), motif = abs(fract(uv * vec2(6.0, 8.0)) - .5);
            float edge = max(c.x, c.y);
            vec3 rug = mix(field, figure, step(motif.x + motif.y, .2));
            rug = mix(rug, figure, step(c.x * 1.4 + c.y, .2));
            rug = mix(rug, vec3(.88, .82, .68), step(c.x * 1.4 + c.y, .1));
            return mix(mix(rug, figure, step(.4, edge)), vec3(.88, .82, .68), step(.435, edge) * step(edge, .455));
          }
          // A patterned floor tile: a diamond, a ring and corner dots on white.
          vec3 nightTile(vec2 uv, vec3 a, vec3 b) {
            vec2 c = abs(fract(uv) - .5);
            vec3 tile = mix(vec3(.93, .91, .86), a, step(abs(length(c) - .33), .045));
            tile = mix(tile, b, step(c.x + c.y, .17));
            return mix(tile, a, step(.62, c.x + c.y)) * (1.0 - .2 * step(.48, max(c.x, c.y)));
          }
          // Bottles and jars: black, blush, gold, teal, red.
          vec3 nightBottle(float h) { h = fract(h); return h < .22 ? vec3(.1) : h < .5 ? vec3(.93, .62, .68) : h < .7 ? vec3(.86, .7, .4) : h < .85 ? vec3(.45, .75, .72) : vec3(.75, .15, .25); }
          vec4 nightRoom(vec2 p, vec2 size, vec4 open, vec3 d, float seed, float use) {
            // use: 0 a plain shop, 1 a home, 2 an office in the business district, 3 an office anywhere else,
            // 4 a hotel room, 5 a factory floor, 6 a school; -1 and below a designed shop window, numbered in SHOP_LAYOUTS order.
            // A hotel room is furnished and lit like a home, a factory and a school like a plain office.
            float home = step(.5, use), hotel = step(3.5, use) * step(use, 4.5), office = step(1.5, use) * (1.0 - hotel), cbd = office * step(use, 2.5), shop = max(-use, 0.0);
            int shopKind = int(shop + .5), brand = max(shopKind - 1, 0) * 2 + int(step(.5, nightRoomHash(seed * 83.1)));
            float mirrored = 0.0;
            float doorway = step(open.y, .1);
            d = vec3(abs(d.x) < 1e-3 ? 1e-3 : d.x, abs(d.y) < 1e-3 ? 1e-3 : d.y, max(d.z, .03));
            float reveal = ${INTERIOR.reveal.toFixed(2)}, depth = ${INTERIOR.depth.toFixed(1)} + ${INTERIOR.depthRange.toFixed(1)} * nightRoomHash(seed * 7.7);
            float flip = step(.5, nightRoomHash(seed * 11.3));
            // A home is authored one way round; half of them are seen mirrored.
            if (max(home, step(.5, shop)) * flip > .5) { p.x = size.x - p.x; d.x = -d.x; open = vec4(size.x - open.z, open.y, size.x - open.x, open.w); flip = 0.0; mirrored = 1.0; }
            vec3 wall = mix(vec3(.84, .78, .68), vec3(.66, .76, .82), step(.5, nightRoomHash(seed * 3.1)));
            wall = mix(wall, vec3(.88, .82, .58), step(.8, nightRoomHash(seed * 5.3)));
            if (home > .5) {
              // Where floors are modelled as shallow bands the cell is squatter than a room: stand a full-height
              // room behind it with the sill at waist height, or only a strip of mid-wall would ever show.
              if (size.y < ${INTERIOR.homeHeight.toFixed(1)}) { float lift = ${INTERIOR.sill.toFixed(2)} - open.y; p.y += lift; open.y += lift; open.w += lift; size.y = ${INTERIOR.homeHeight.toFixed(1)}; }
              // Homes are painted paler, and their windows are two leaves with a bar between. A tower's office
              // is white behind one sheet of glass; a plain office is cream or pale green.
              wall = mix(wall, vec3(.92, .9, .84), .5);
              if (office > .5) wall = cbd > .5 ? vec3(.9, .91, .93) : mix(vec3(.88, .86, .76), vec3(.78, .86, .78), step(.5, nightRoomHash(seed * 3.1)));
              if (hotel > .5) wall = mix(vec3(.9, .86, .78), vec3(.84, .84, .8), step(.5, nightRoomHash(seed * 3.1)));
              if (use > 4.5) wall = use < 5.5 ? vec3(.8, .81, .8) : vec3(.92, .9, .8);
              if (cbd < .5 && hotel < .5 && abs(p.x - .5 * (open.x + open.z)) < .03) return vec4(.4, .42, .44, 0.0);
            }
            // The wall is a hand deep: a ray that leaves the opening inside that thickness has met the frame.
            vec3 from = vec3(p, 0.0) + d * (reveal / d.z);
            if (from.x < open.x || from.x > open.z || from.y < open.y || from.y > open.w) {
              float side = from.y > open.w ? .5 : from.y < open.y ? 1.0 : .72;
              return vec4(vec3(.5, .52, .54) * side, 0.0);
            }
            // The shop's name in white vinyl low on the glass.
            if (shop > .5 && nightSign(brand, p, vec2(.5 * (open.x + open.z), open.y + ${SHOP_WINDOWS.decal[0].toFixed(2)}), ${SHOP_WINDOWS.decal[1].toFixed(2)}, mirrored) > .5) return vec4(vec3(.97), 1.0);
            if (shop > .5 && shopKind < 11 && doorway < .5 && nightRoomHash(seed * 71.3) < ${SHOP_WINDOWS.strip.toFixed(2)}) {
              // A promotion strip of vinyl across the top of the glass, with blocks for its lettering; not on the heritage streets.
              float down = open.w - p.y, across = p.x - .5 * (open.x + open.z);
              if (down > .12 && down < .4) {
                float letter = step(abs(across), .7) * step(.17, down) * step(down, .35) * step(.3, fract(across * 5.5)) * step(.25, nightRoomHash(floor(across * 5.5) + seed));
                return vec4(mix(nightRoomHash(seed * 73.9) < .6 ? vec3(.82, .12, .14) : vec3(.1), vec3(.97), letter), 1.0);
              }
            }
            vec3 low = vec3(0.0, 0.0, reveal), high = vec3(size, reveal + depth);
            vec3 reach = vec3(d.x > 0.0 ? (high.x - from.x) / d.x : (low.x - from.x) / d.x, d.y > 0.0 ? (high.y - from.y) / d.y : (low.y - from.y) / d.y, (high.z - from.z) / d.z);
            float t = min(reach.x, min(reach.y, reach.z));
            vec3 normal = t == reach.z ? vec3(0.0, 0.0, -1.0) : t == reach.y ? vec3(0.0, -sign(d.y), 0.0) : vec3(-sign(d.x), 0.0, 0.0);
            float kind = 0.0, far = high.z, curtain = 0.0, curtainShare = 0.0;
            float plan = use > 1.5 ? 4.0 + (use - 2.0) * 2.0 + floor(nightRoomHash(seed * 23.1) * 1.999) : floor(nightRoomHash(seed * 23.1) * 3.999);
            // Furniture, each a real box in the room so it slides against the walls as the viewer moves.
            vec3 aLow, aHigh, bLow, bHigh, cLow, cHigh;
            // The lamp sits nearer the glass in a home, where a window over the street is looked up into and
            // shows mostly ceiling. Under it: a fan in some living rooms and bedrooms, a hanging shade, or a flush lamp.
            vec2 lampAt = vec2(size.x * .5, reveal + depth * mix(.45, .33, home));
            float lampKind = nightRoomHash(seed * 53.9), fan = home * (1.0 - office) * step(plan, 1.5) * step(lampKind, .6), shade = home * (1.0 - office) * (1.0 - hotel) * (1.0 - fan) * step(.3, lampKind);
            if (shop > .5) {
              // A designed shop window (SHOP_LAYOUTS); a doorway keeps the window display out of the way.
              ${SHOP_BOXES_GLSL}
              float display = reveal + ${SHOP_WINDOWS.display.toFixed(1)};
              if (doorway > .5) {
                if (aLow.z < display) aLow.y = aHigh.y = -5.0;
                if (bLow.z < display) bLow.y = bHigh.y = -5.0;
                if (cLow.z < display) cLow.y = cHigh.y = -5.0;
              }
            } else if (home < .5) {
              // A shop: a counter across the back, shelving down one side, and a display table near the glass.
              float shelfX = mix(0.0, size.x - .42, flip), tableX = mix(size.x * .52, size.x * .14, flip);
              aLow = vec3(.35, 0.0, far - 1.75); aHigh = vec3(size.x - .35, .95, far - 1.2);
              bLow = vec3(shelfX, 0.0, reveal + .7); bHigh = vec3(shelfX + .42, min(2.05, size.y - .3), far - .25);
              cLow = vec3(tableX, 0.0, reveal + .55); cHigh = vec3(tableX + size.x * .34, .72, reveal + 1.5);
            } else {
              // A home: a living room, a bedroom, a kitchen or a study (HOME_LAYOUTS). An office: OFFICE_LAYOUTS.
              ${HOME_BOXES_GLSL}
              aHigh.y = min(aHigh.y, size.y - .2); bHigh.y = min(bHigh.y, size.y - .2); cHigh.y = min(cHigh.y, size.y - .2);
              // In a share of rooms a curtain hangs just inside the glass, part drawn or right across.
              float hung = nightRoomHash(seed * 29.3);
              if (hung < curtainShare) {
                curtain = 1.0;
                float across = hung < curtainShare * ${CURTAINS.drawn.toFixed(2)} ? 1.2 : mix(.22, .5, nightRoomHash(seed * 37.1));
                cLow = vec3(open.x - .12, open.y - .1, reveal + .05); cHigh = vec3(open.x - .12 + across * (open.z - open.x), open.w + .12, reveal + .1);
                // An office has a blind instead, let down part of the way.
                if (office > .5) { cLow = vec3(open.x - .12, open.w - mix(.25, .8, nightRoomHash(seed * 37.1)) * (open.w - open.y), reveal + .05); cHigh = vec3(open.z + .12, open.w + .12, reveal + .1); }
              }
            }
            vec3 hitNormal;
            float boxA = nightBoxHit(from, d, aLow, aHigh, hitNormal);
            if (boxA < t) { t = boxA; normal = hitNormal; kind = 1.0; }
            float boxB = nightBoxHit(from, d, bLow, bHigh, hitNormal);
            if (boxB < t) { t = boxB; normal = hitNormal; kind = 2.0; }
            float boxC = nightBoxHit(from, d, cLow, cHigh, hitNormal);
            if (boxC < t) { t = boxC; normal = hitNormal; kind = 3.0; }
            if (shade > .5) {
              float boxD = nightBoxHit(from, d, vec3(lampAt.x - .24, size.y - ${INTERIOR.shadeDrop.toFixed(2)}, lampAt.y - .24), vec3(lampAt.x + .24, size.y - ${(INTERIOR.shadeDrop - .3).toFixed(2)}, lampAt.y + .24), hitNormal);
              if (boxD < t) { t = boxD; normal = hitNormal; kind = 4.0; }
            }
            // Flat figures standing in a plane a little way in: they slide against the room like the furniture does.
            vec3 cutColor = vec3(0.0); float cutGlow = 0.0;
            if (shop > .5 && doorway < .5) {
              float cutZ = reveal + (shopKind == 10 ? .75 : shopKind == 9 ? 1.2 : shopKind == 29 ? .65 : shopKind == 27 || shopKind == 30 ? .5 : shopKind == 5 ? .68 : shopKind == 12 || shopKind == 17 || shopKind == 28 ? .7 : shopKind == 13 ? .8 : shopKind == 15 ? .5 : shopKind == 16 ? 1.1 : shopKind == 19 ? .45 : shopKind == 22 ? .5 : shopKind == 23 ? 1.03 : shopKind == 24 ? 1.6 : .62), tc = (cutZ - from.z) / d.z;
              vec2 q = from.xy + d.xy * tc;
              if (tc < t) {
                if (shopKind == 1 || shopKind == 6 || shopKind == 14 || shopKind == 21) {
                  // Mannequins on the window plinth: dressed in the fashion shop, in kit in the sports shop; saris on
                  // the textile shop's floor, and headless dress forms on poles beside the tailor's sewing table.
                  float x0 = shopKind == 1 ? aLow.x : shopKind == 6 ? cLow.x : shopKind == 14 ? .6 : cHigh.x + .3, x1 = shopKind == 1 ? aHigh.x : shopKind == 6 ? cHigh.x : size.x - .3, base = shopKind == 1 ? aHigh.y : shopKind == 6 ? cHigh.y : 0.0;
                  float n = max(1.0, floor((x1 - x0) / .95)), w = (x1 - x0) / n, id = floor((q.x - x0) / w);
                  float x = (fract((q.x - x0) / w) - .5) * w, v = q.y - base, h = nightRoomHash(id * 7.3 + seed * 61.0);
                  if (id >= 0.0 && id < n && v > 0.0 && h > .1) {
                    float dress = shopKind == 1 ? step(.55, h) : shopKind == 14 ? 1.0 : 0.0, whole = shopKind == 21 ? 0.0 : 1.0;
                    float head = whole * step(length(vec2(x, (v - 1.62) * .85)), .09), neck = step(abs(x), .035) * step(1.45, v) * step(v, 1.56);
                    float torsoW = mix(.14, .21, smoothstep(.95, 1.38, v)) * (1.0 - .45 * smoothstep(1.4, 1.5, v));
                    float torso = step(abs(x), torsoW) * step(.9, v) * step(v, 1.48), legs = mix(max(step(abs(x), .02), step(abs(x), .16) * step(v, .04)), step(abs(abs(x) - .08), .06), whole) * step(v, .9);
                    float skirt = dress * step(abs(x), mix(.26, .15, clamp((v - .4) / .5, 0.0, 1.0))) * step(.4, v) * step(v, .9);
                    float arms = whole * step(abs(abs(x) - torsoW - .04), .035) * step(.75, v) * step(v, 1.4);
                    if (shopKind == 14) skirt = step(abs(x), mix(.24, .16, clamp((v - .06) / .84, 0.0, 1.0))) * step(.06, v) * step(v, .9);
                    if (max(max(head, neck), max(max(torso, legs), max(skirt, arms))) > .5) {
                      vec3 form = nightRoomHash(seed * 67.0) < .5 ? vec3(.9, .89, .86) : vec3(.13);
                      vec3 upper = shopKind == 1 ? nightGarment(h * 9.7) : shopKind == 21 ? mix(nightGarment(h * 9.7), nightPalette(h * 5.3), step(.5, fract(h * 3.0))) : nightPalette(floor(fract(h * 5.3) * 5.0) / 6.0 + .02), lower = shopKind == 1 ? nightGarment(h * 3.3 + .4) : shopKind == 21 ? vec3(.3, .22, .16) : vec3(.14);
                      cutColor = form;
                      if (legs > .5) cutColor = dress > .5 ? form : lower;
                      if (v < .07) cutColor = shopKind == 1 ? vec3(.1) : nightPalette(h * 11.0);
                      if (torso > .5 || skirt > .5 || (arms > .5 && v > mix(1.22, .8, step(.5, fract(h * 17.0))))) cutColor = upper;
                      // A sari: a gold border at the hem and a sash across the shoulder.
                      if (shopKind == 14 && (skirt > .5 && v < .16 || torso > .5 && abs(x * 1.6 + v - 1.2) < .05)) cutColor = vec3(.88, .7, .3);
                      cutColor *= 1.0 - 1.1 * abs(x);
                      // The sports brand's mark on the chest.
                      if (shopKind == 6 && nightGlyph(nightBrand[brand * ${BRAND_LENGTH}], (vec2(x, v) - vec2(-.05, 1.2)) / vec2(.125, .125)) > .5) cutColor = vec3(.96);
                      t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                    }
                  }
                } else if (shopKind == 5) {
                  // Pendant lamps over the window table.
                  float n = max(1.0, floor((bHigh.x - bLow.x) / .8)), w = (bHigh.x - bLow.x) / n, id = floor((q.x - bLow.x) / w), x = (fract((q.x - bLow.x) / w) - .5) * w;
                  float shadeTop = size.y - .62, shadeFoot = shadeTop - .26;
                  float cord = step(abs(x), .012) * step(shadeTop, q.y), lampshade = step(abs(x), mix(.17, .05, clamp((q.y - shadeFoot) / .26, 0.0, 1.0))) * step(shadeFoot, q.y) * step(q.y, shadeTop);
                  if (id >= 0.0 && id < n && max(cord, lampshade) > .5) { cutColor = vec3(.1); cutGlow = lampshade * mix(.45, 1.0, step(q.y, shadeFoot + .08)); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                } else if (shopKind == 9 || shopKind == 29) {
                  // Bouquets standing out of the back row of buckets; at the nursery, plants in the pots on the window bench.
                  float id = floor((q.x - bLow.x) / .32), x = (fract((q.x - bLow.x) / .32) - .5) * .32, h = nightRoomHash(id * 7.3 + seed * 61.0), v = q.y - bHigh.y;
                  float bloomAt = .34 + .14 * h, r = length(vec2(x, v - bloomAt));
                  if (q.x > bLow.x && q.x < bHigh.x && v > 0.0 && (r < .15 || (v < bloomAt && abs(x) < .04 + .09 * v / bloomAt))) {
                    // Five blooms in a ruff of leaves, over a sheaf of stems.
                    vec2 b = vec2(x, v - bloomAt);
                    float bloom = min(min(length(b), length(b - vec2(.08, .05))), min(length(b + vec2(.08, -.05)), min(length(b - vec2(.04, -.08)), length(b + vec2(.05, .08)))));
                    vec3 petal = mix(nightPalette(h * 4.7), vec3(.95, .5, .2), step(.8, fract(h * 5.0)));
                    if (shopKind == 29 && fract(h * 3.0) < .65) petal = vec3(.34, .6, .28);
                    cutColor = bloom < .055 ? mix(vec3(.95, .8, .3), petal, step(.018, bloom)) : vec3(.2, .44, .22) * (r < .15 ? .85 : .8 + .4 * step(.5, fract(x * 30.0)));
                    t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
                } else if (shopKind == 11) {
                  // Jars of roots and berries on the window table, lidded in red.
                  float x = (fract((q.x - cLow.x) / .24) - .5) * .24, v = q.y - cHigh.y, h = nightRoomHash(floor((q.x - cLow.x) / .24) * 7.3 + seed * 61.0);
                  if (q.x > cLow.x && q.x < cHigh.x && v > 0.0 && v < .34 && abs(x) < .085) {
                    cutColor = (v > .28 ? vec3(.7, .15, .12) : mix(vec3(.78, .56, .24), vec3(.45, .22, .14), h)) * (1.0 - 2.5 * abs(x));
                    t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
                } else if (shopKind == 12 || shopKind == 17 || shopKind == 28) {
                  // Lamps hung in the window: red lanterns with gold bands and a tassel at the tea merchant's, coloured glass globes over the carpets and all across the lighting shop.
                  float w = shopKind == 12 ? .75 : shopKind == 28 ? .4 : .5, id = floor(q.x / w), x = (fract(q.x / w) - .5) * w, h = nightRoomHash(id * 7.3 + seed * 61.0);
                  float at = size.y - (shopKind == 12 ? .72 : shopKind == 28 ? .85 + .9 * fract(h * 7.0) : .45 + .5 * h), v = q.y - at, r = length(vec2(x / (shopKind == 12 ? .17 : .12), v / (shopKind == 12 ? .2 : .13)));
                  if (q.x > open.x + .15 && q.x < open.z - .15 && h > .2) {
                    if (r < 1.0) {
                      cutColor = shopKind == 12 ? mix(vec3(.8, .1, .1), vec3(.86, .68, .3), step(.15, abs(v))) : nightPalette(h * 7.7) * (.7 + .5 * step(.5, nightRoomHash(dot(floor(vec2(x, v) * 40.0), vec2(1.0, 7.0)))));
                      cutGlow = shopKind == 12 ? .35 : .6; if (shopKind == 28) { cutColor = mix(vec3(1.0, .9, .66), cutColor, .3); cutGlow = .9; } t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                    } else if (abs(x) < .012 && (v > 0.0 || (shopKind == 12 && v > -.45))) { cutColor = v > 0.0 ? vec3(.12) : vec3(.86, .68, .3); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                  }
                } else if (shopKind == 13 || shopKind == 15 || shopKind == 16 || shopKind == 22) {
                  // Strings hung from a rail: dried sausages, garlands of flowers, strips of packets (at the provision shop too).
                  float w = shopKind == 13 ? .22 : shopKind == 15 ? .26 : .34, id = floor(q.x / w), x = (fract(q.x / w) - .5) * w, h = nightRoomHash(id * 7.3 + seed * 61.0);
                  float hung = size.y - .28 - q.y, reach = shopKind == 13 ? .45 + .4 * h : shopKind == 15 ? .7 + .5 * h : .8 + .5 * h, link = floor(hung * (shopKind == 13 ? 7.0 : shopKind == 15 ? 16.0 : 7.0));
                  if (q.x > open.x + .1 && q.x < open.z - .1 && hung > 0.0 && hung < reach && h > .15 && abs(x) < (shopKind == 13 ? .032 : shopKind == 15 ? .04 + .03 * step(reach - .1, hung) : .07)) {
                    float bead = nightRoomHash(link + id * 3.0 + seed);
                    cutColor = shopKind == 13 ? mix(vec3(.55, .16, .12), vec3(.4, .12, .1), step(.5, bead)) * (1.0 - .4 * step(.85, fract(hung * 7.0)))
                      : shopKind == 15 ? (mod(link + floor(h * 4.0), 3.0) < 1.0 ? vec3(.96, .76, .1) : mod(link + floor(h * 4.0), 3.0) < 2.0 ? vec3(.95, .5, .1) : mix(vec3(.95, .94, .9), vec3(.8, .14, .2), step(.5, h)))
                      : nightPalette(bead) * (1.0 - .35 * step(.85, fract(hung * 7.0)));
                    t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
                } else if (shopKind == 27) {
                  // Durians hung in string from a rail across the window.
                  float id = floor(q.x / .5), x = (fract(q.x / .5) - .5) * .5, h = nightRoomHash(id * 7.3 + seed * 61.0);
                  float v = q.y - (size.y - .8 - .3 * h), r = length(vec2(x, v * .85));
                  if (q.x > open.x + .1 && q.x < open.z - .1 && h > .2) {
                    if (r < .15) { cutColor = mix(vec3(.42, .46, .18), vec3(.66, .64, .3), step(.5, fract((x + v) * 16.0)) * step(.5, fract((x - v) * 16.0))) * (1.0 - 2.0 * r * r * 9.0); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                    else if (abs(x) < .012 && v > 0.0) { cutColor = vec3(.72, .62, .42); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                  }
                } else if (shopKind == 30) {
                  // Printed T-shirts pegged to a line across the window, the shop's mark on each chest.
                  float id = floor(q.x / .72), x = (fract(q.x / .72) - .5) * .72, h = nightRoomHash(id * 7.3 + seed * 61.0), shoulder = size.y - .5, v = shoulder - q.y;
                  float shirt = max(step(abs(x), .2) * step(v, .62), step(abs(x), .32) * step(v, .2)) * step(0.0, v) * step(.075, length(vec2(x, v)));
                  if (q.x > open.x + .1 && q.x < open.z - .1) {
                    if (shirt > .5 && h > .15) {
                      cutColor = nightPalette(h * 5.3) * (1.0 - .6 * abs(x));
                      if (nightGlyph(nightBrand[brand * ${BRAND_LENGTH}], (vec2(x, q.y) - vec2(-.06, shoulder - .42)) / vec2(.16, .16)) > .5) cutColor = dot(cutColor, vec3(.333)) > .6 ? vec3(.8, .15, .15) : vec3(.96);
                      t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                    } else if (abs(v + .01) < .008) { cutColor = vec3(.2); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                  }
                } else if (shopKind == 31) {
                  // Surfboards stood on end along the window deck.
                  float x0 = aLow.x + .1, id = floor((q.x - x0) / .62), x = (fract((q.x - x0) / .62) - .5) * .62, h = nightRoomHash(id * 7.3 + seed * 61.0), v = q.y - aHigh.y;
                  float len = 1.6 + .3 * h, lean = 2.0 * v / len - 1.0;
                  if (q.x > x0 && q.x < aHigh.x - .1 && h > .25 && v > 0.0 && v < len && abs(x) < .2 * sqrt(max(0.0, 1.0 - lean * lean * abs(lean)))) {
                    vec3 deck = mix(nightPalette(h * 4.1), vec3(.95), .35);
                    cutColor = abs(x) < .012 ? vec3(.3, .22, .16) : abs(lean - .25) < .12 ? nightPalette(h * 4.1 + .5) : deck;
                    cutColor *= 1.0 - 1.2 * abs(x); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
                } else if (shopKind == 32) {
                  // Bicycles side on along the window: two wheels, a diamond frame, a saddle and bars.
                  float x0 = aLow.x + .05, n = max(1.0, floor((aHigh.x - aLow.x - .1) / 1.8)), w = (aHigh.x - aLow.x - .1) / n, id = floor((q.x - x0) / w), h = nightRoomHash(id * 7.3 + seed * 61.0);
                  vec2 b = vec2((fract((q.x - x0) / w) - .5) * w, q.y - aHigh.y);
                  if (id >= 0.0 && id < n && b.y < 1.1) {
                    float wheel = abs(length(vec2(abs(b.x) - .52, b.y - .34)) - .31);
                    vec2 seat = vec2(-.18, .85), head = vec2(.4, .85), crank = vec2(0.0, .32), rear = vec2(-.52, .34);
                    float frame = min(min(nightSeg(b, rear, crank), nightSeg(b, crank, seat)), min(min(nightSeg(b, seat, head), nightSeg(b, crank, head)), min(nightSeg(b, rear, seat), nightSeg(b, head, vec2(.52, .34)))));
                    float fittings = min(nightSeg(b, seat + vec2(-.1, .09), seat + vec2(.1, .09)), min(nightSeg(b, seat, seat + vec2(0.0, .09)), min(nightSeg(b, head, vec2(.38, 1.02)), nightSeg(b, vec2(.3, 1.02), vec2(.46, 1.02)))));
                    if (min(wheel, min(frame, fittings)) < .028) {
                      cutColor = frame < .028 && frame < wheel ? nightPalette(h * 5.0 + .1) : fittings < .028 ? vec3(.1) : vec3(.14);
                      t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                    }
                  }
                } else if (shopKind == 23) {
                  // The backs of the waiting-room chairs.
                  float seat = floor((q.x - aLow.x) / .5), x = (fract((q.x - aLow.x) / .5) - .5) * .5;
                  if (q.x > aLow.x && q.x < aHigh.x && abs(x) < .2 && q.y > .5 && q.y < .88) { cutColor = mix(vec3(.25, .5, .75), vec3(.92, .56, .2), step(.5, fract(seat * .5 + .25))) * .9; t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                } else if (shopKind == 24) {
                  // A salon chair on its chrome post, turned to the mirrors.
                  float x = q.x - aHigh.x - .75, v = q.y;
                  float chair = max(step(abs(x), .26) * step(.45, v) * step(v, .6), step(abs(x - .22), .05) * step(.6, v) * step(v, 1.2));
                  chair = max(chair, step(abs(x + .1), .16) * step(.72, v) * step(v, .77));
                  float post = max(step(abs(x), .04) * step(v, .45), step(abs(x), .22) * step(v, .05));
                  if (max(chair, post) > .5) { cutColor = chair > .5 ? vec3(.14) : vec3(.72, .74, .76); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                } else if (shopKind == 19) {
                  // A wooden chair either side of the marble table.
                  float x = min(abs(q.x - bLow.x + .32), abs(q.x - bHigh.x - .32)), v = q.y;
                  float chair = max(step(x, .2) * step(.42, v) * step(v, .47), step(abs(x - .18), .022) * step(v, .95));
                  chair = max(chair, step(x, .2) * max(step(.87, v) * step(v, .95), step(.64, v) * step(v, .7)));
                  if (chair > .5) { cutColor = vec3(.32, .2, .13); t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0; }
                } else if (shopKind == 10) {
                  // One bag on its stand.
                  float x = q.x - .5 * (bLow.x + bHigh.x), v = q.y - bHigh.y;
                  float body = step(abs(x), .2 - .04 * smoothstep(0.0, .28, v)) * step(0.0, v) * step(v, .28), handle = step(abs(length(vec2(x, v - .28)) - .11), .018) * step(.28, v);
                  if (max(body, handle) > .5) {
                    vec3 leather = nightGarment(nightRoomHash(seed * 67.0) * .99);
                    cutColor = body > .5 ? mix(leather * (1.0 - 1.5 * abs(x)), vec3(.84, .68, .32), nightGlyph(nightBrand[brand * ${BRAND_LENGTH}], (vec2(x, v) - vec2(-.055, .06)) / vec2(.14, .14))) : leather * .7;
                    t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
                }
              }
            }
            vec3 hit = from + d * t;
            // What the surface is made of.
            vec3 accent = mix(vec3(.72, .3, .24), vec3(.24, .46, .62), nightRoomHash(seed * 13.7));
            accent = mix(accent, vec3(.86, .66, .22), step(.66, nightRoomHash(seed * 17.9)));
            vec3 albedo = wall, glowColor = vec3(1.25, 1.2, 1.05);
            float glow = 0.0, sheer = 0.0;
            if (shop > .5) {
              float top = step(.5, normal.y), front = step(normal.z, -.5), flank = step(.5, abs(normal.x)), shell = 1.0 - step(.5, kind);
              // Along whichever face was hit: a side-on face runs into the room, a front one across it.
              vec2 q = flank > .5 ? vec2(hit.z - reveal, hit.y) : hit.xy;
              vec3 timber = mix(vec3(.66, .52, .36), vec3(.34, .25, .18), step(.5, nightRoomHash(seed * 41.3)));
              float pick = nightRoomHash(seed * 3.1), tileSize = .6, spots = 1.0;
              vec3 floorColor = vec3(.74, .72, .68), ceilingColor = vec3(.92);
              if (shopKind == 1) {
                // Fashion: a rail of clothes, a till, and a mirror, a fitting-room curtain and a lit sign at the back.
                wall = pick < .3 ? vec3(.17, .17, .19) : vec3(.93, .92, .9); albedo = wall;
                floorColor = pick < .3 ? vec3(.5, .47, .44) : timber * 1.1; tileSize = pick < .3 ? 1.2 : .18;
                if (kind == 1.0) albedo = vec3(.9) * mix(.8, 1.0, top);
                else if (kind == 2.0) albedo = top > .5 ? vec3(.15) : nightGarment(nightRoomHash(floor(q.x * 8.0) + seed * 31.0)) * (1.0 - .4 * step(.8, fract(q.x * 8.0)));
                else if (kind == 3.0) albedo = top > .5 ? vec3(.93) : timber;
                else if (front > .5) {
                  albedo = mix(albedo, vec3(.68, .77, .82), nightRect(hit.xy, vec2(.5, .15), vec2(1.2, 2.0)));
                  albedo = mix(albedo, accent * (.75 + .25 * abs(sin(hit.x * 24.0))), nightRect(hit.xy, vec2(1.5, 0.0), vec2(2.3, 2.05)));
                }
              } else if (shopKind == 2) {
                // Jeweller: dark walls, showcases with a lit bed of stones under glass, lit niches behind the counter.
                wall = mix(vec3(.11, .13, .2), vec3(.2, .11, .13), step(.5, pick)); albedo = wall;
                floorColor = wall * 1.5 + .04; tileSize = 6.0; ceilingColor = vec3(.2);
                vec3 gold = vec3(.86, .68, .3);
                if (kind > .5) {
                  vec2 bed = top > .5 ? hit.xz : q;
                  float gem = step(length(fract(bed * 7.0) - .5), .17) * step(.4, nightRoomHash(dot(floor(bed * 7.0), vec2(1.0, 7.0)) + seed));
                  albedo = mix(vec3(.1, .09, .09), gold, step(.72, hit.y) * step(hit.y, .78));
                  if (max(top, step(.78, hit.y)) > .5) { albedo = gold; glow = .6 + .4 * gem; glowColor = mix(vec3(1.0, .93, .8), vec3(1.5, 1.4, 1.1), gem); }
                } else if (front > .5) {
                  vec2 n = vec2(hit.x / .75, (hit.y - .85) / .5), at = abs(fract(n) - .5);
                  float niche = step(at.x, .38) * step(at.y, .36) * step(0.0, n.y) * step(n.y, 2.0) * step(.3, hit.x) * step(hit.x, size.x - .3);
                  float piece = step(length((fract(n) - vec2(.5, .36)) * vec2(.75, .5)), .07);
                  albedo = mix(albedo, gold, piece * niche); glow = niche * (1.0 - .75 * piece) * .85; glowColor = vec3(1.2, 1.05, .8);
                }
              } else if (shopKind == 3) {
                // Electronics: oak tables of devices left on, a wall of accessories, a wall of screens.
                wall = vec3(.94, .94, .95); albedo = wall; floorColor = vec3(.8, .78, .74); tileSize = .9; spots = 0.0;
                vec3 oak = mix(timber, vec3(.8, .68, .5), .6);
                if (kind == 1.0 || kind == 2.0) {
                  vec2 g = hit.xz * vec2(2.2, 2.6), at = abs(fract(g) - .5);
                  albedo = oak * mix(.7, 1.1, top);
                  glow = top * step(at.x, .34) * step(at.y, .3) * .9; glowColor = mix(vec3(.5, .75, 1.25), nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 5.0)) + seed)) + .2, .5);
                } else if (kind == 3.0) {
                  vec2 g = q * vec2(4.5, 4.0), at = abs(fract(g) - .5);
                  albedo = top > .5 ? vec3(.85) : mix(vec3(.9), nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 9.0)) + seed * 3.0)), step(at.x, .36) * step(at.y, .38) * step(.3, hit.y));
                } else if (front > .5) {
                  float cellW = size.x / max(2.0, floor(size.x / 1.45)), u = fract(hit.x / cellW) * cellW;
                  float wave = .5 + .5 * sin(nightClock * .8 * nightMotion + hit.x * 1.3 + hit.y * 2.0 + seed * 20.0);
                  albedo = mix(albedo, vec3(.05), nightRect(vec2(u, hit.y), vec2(.08, .96), vec2(cellW - .08, 1.89)));
                  glow = nightRect(vec2(u, hit.y), vec2(.12, 1.0), vec2(cellW - .12, 1.85)); glowColor = mix(vec3(.35, .6, 1.2), vec3(1.2, .6, .45), wave);
                }
              } else if (shopKind == 4) {
                // Bookshop: shelves of spines down one side and across the back, a table of covers, posters.
                wall = vec3(.86, .8, .68); albedo = wall; floorColor = timber; tileSize = .18;
                if (kind == 1.0 || kind == 2.0) {
                  float board = step(.88, fract(hit.y * 2.9)), spine = nightRoomHash(floor(q.x * 11.0) + floor(hit.y * 2.9) * 13.0 + seed * 31.0 + kind * 5.0);
                  vec3 book = mix(mix(vec3(.7, .28, .22), vec3(.24, .42, .56), step(.3, spine)), mix(vec3(.84, .74, .4), vec3(.3, .5, .34), step(.8, spine)), step(.55, spine));
                  albedo = (kind == 1.0 ? step(.5, normal.x) : front) > .5 ? mix(book * (.7 + .3 * fract(spine * 9.0)), timber * .8, board) : timber * .7;
                } else if (kind == 3.0) {
                  vec2 g = hit.xz * 4.5;
                  albedo = top > .5 ? nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)) * (.55 + .45 * step(.12, fract(g.x)) * step(.12, fract(g.y))) : timber * .8;
                } else if (flank > .5 && normal.x < 0.0) {
                  albedo = nightPicture(albedo, q, vec2(.9, 1.1), vec2(1.6, 2.0), accent);
                  albedo = nightPicture(albedo, q, vec2(1.9, 1.1), vec2(2.6, 2.0), nightPalette(pick * 3.0));
                }
              } else if (shopKind == 5) {
                // Cafe: slatted timber under dark paint, a counter with a lit cake case, a coffee machine, menu boards.
                vec3 paint = mix(vec3(.16, .26, .22), vec3(.2, .2, .22), step(.5, pick));
                wall = paint; albedo = hit.y < 1.0 ? timber * (1.0 - .2 * step(.9, fract(q.x * 7.0))) : paint;
                ceilingColor = vec3(.25); tileSize = .4;
                if (kind == 1.0) {
                  albedo = top > .5 ? vec3(.86, .85, .82) : timber * (1.0 - .25 * step(.88, fract(q.x * 7.0)));
                  if (front > .5 && hit.y > .72) {
                    vec2 g = vec2(hit.x * 5.0, (hit.y - .72) / .2);
                    albedo = mix(vec3(.95, .92, .85), nightPalette(nightRoomHash(floor(g.x) + floor(g.y) * 3.0 + seed)) * .8 + .15, step(length(fract(g) - vec2(.5, .35)), .3));
                    glow = .6; glowColor = albedo * 1.25;
                  }
                } else if (kind == 2.0) albedo = timber * mix(.5, 1.15, top);
                else if (kind == 3.0) albedo = front > .5 && hit.y > .9 ? mix(vec3(.7, .72, .74), vec3(.15), step(.5, fract(hit.x * 2.2)) * step(hit.y, 1.2)) : vec3(.18, .17, .17) * mix(1.0, 1.6, top);
                else if (front > .5) {
                  float cellW = (size.x - .6) / 3.0, u = fract((hit.x - .3) / cellW) * cellW;
                  float sheet = step(.3, hit.x) * step(hit.x, size.x - .3) * step(.06, u) * step(u, cellW - .06) * step(1.65, hit.y) * step(hit.y, 2.25);
                  float line = step(.5, fract(hit.y * 16.0)) * step(.14, u) * step(u, cellW * (.35 + .5 * nightRoomHash(floor(hit.y * 16.0) + floor((hit.x - .3) / cellW) * 9.0 + seed)));
                  glow = sheet * (1.0 - .75 * line) * .85; glowColor = vec3(1.2, 1.0, .75);
                }
              } else if (shopKind == 6) {
                // Sports: a lit wall of trainers, a bench to try them on, the shop's colour slanted across the back.
                wall = vec3(.9, .9, .91); albedo = wall; floorColor = vec3(.3, .3, .32); tileSize = 1.5;
                vec3 team = nightPalette((floor(pick * 4.99) + .5) / 6.0);
                if (kind == 1.0) {
                  vec2 g = vec2(q.x * 3.0, (hit.y - .35) / .37), c = fract(g);
                  float shoe = step(.14, c.x) * step(c.x, .86) * step(.12, c.y) * step(c.y, mix(.3, .52, step(.5, c.x)));
                  albedo = normal.x > .5 ? mix(vec3(.82, .83, .85), nightPalette(nightRoomHash(floor(g.x) + floor(g.y) * 7.0 + seed)), shoe) : vec3(.8);
                  glow = step(.5, normal.x) * step(.9, c.y) * .9; glowColor = vec3(1.25, 1.25, 1.2);
                } else if (kind == 2.0) albedo = top > .5 ? team : vec3(.15);
                else if (kind == 3.0) albedo = vec3(.92) * mix(.8, 1.0, top);
                else if (front > .5) {
                  albedo = mix(albedo, team, step(fract((hit.x + hit.y * .6) * .55 + pick), .3));
                }
              } else if (shopKind == 7 || shopKind == 18) {
                // Beauty: white and blush, an island of jars lit from under, walls of bottles on lit shelves.
                // The perfumery is the same shop in dark green and brass, its bottles amber, ruby and emerald.
                float attar = shopKind == 18 ? 1.0 : 0.0;
                wall = attar > .5 ? mix(vec3(.1, .28, .28), vec3(.28, .12, .2), step(.5, pick)) : mix(vec3(.96, .94, .93), vec3(.95, .82, .84), step(.5, pick)); albedo = wall;
                floorColor = attar > .5 ? vec3(.3, .22, .16) : vec3(.9, .89, .88); tileSize = .8; spots = attar; ceilingColor = mix(ceilingColor, vec3(.3), attar);
                if (kind == 1.0) {
                  vec2 g = hit.xz * 9.0;
                  albedo = top > .5 ? mix(vec3(.97), nightBottle(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)), step(length(fract(g) - .5), .28)) : vec3(.95);
                  if (attar > .5) albedo = top > .5 ? mix(vec3(.2, .13, .1), mix(vec3(.9, .6, .15), vec3(.86, .68, .3), step(.5, fract(g.x * .37))), step(length(fract(g) - .5), .28)) : mix(vec3(.24, .15, .11), vec3(.84, .66, .3), step(.86, hit.y));
                  glow = (1.0 - top) * step(hit.y, .07) * .8; glowColor = mix(vec3(1.2, .8, .88), vec3(1.2, .9, .5), attar);
                } else if (kind > 1.5) {
                  vec2 g = vec2(q.x * 9.0, hit.y / .4), c = fract(g);
                  float h = nightRoomHash(floor(g.x) + floor(g.y) * 7.0 + seed * 3.0 + kind);
                  float bottle = step(.2, c.x) * step(c.x, .8) * step(c.y, .25 + .5 * h) * step(.2, h);
                  if ((kind == 2.0 ? step(.5, normal.x) : front) > .5) {
                    albedo = mix(mix(vec3(.98, .95, .93), nightBottle(h * 7.3), bottle), vec3(1.0), step(.92, c.y));
                    glow = .55 * (1.0 - bottle); glowColor = vec3(1.25, 1.15, 1.1);
                    if (attar > .5) {
                      vec3 scent = h < .4 ? vec3(.9, .58, .12) : h < .6 ? vec3(.6, .1, .14) : h < .8 ? vec3(.1, .45, .3) : vec3(.86, .68, .3);
                      albedo = mix(mix(vec3(.9, .7, .4), scent, bottle), vec3(.24, .15, .11), step(.9, c.y)); glow = .5 * (1.0 - step(.9, c.y)); glowColor = albedo * 1.35;
                    }
                  } else albedo = mix(vec3(.93), vec3(.24, .15, .11), attar);
                }
              } else if (shopKind == 8) {
                // Toys: a stack of boxes in the window, shelves of more, a striped till, a rainbow on the back wall.
                wall = mix(vec3(.96, .82, .3), vec3(.45, .75, .9), step(.5, pick)); albedo = wall; tileSize = .5;
                if (kind == 1.0 || kind == 2.0) {
                  vec2 g = (top > .5 ? hit.xz : q) / .33, c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed + normal.x * 3.0 + kind);
                  float pane = step(.2, c.x) * step(c.x, .8) * step(.25, c.y) * step(c.y, .75) * step(.5, fract(h * 13.0));
                  albedo = mix(mix(nightPalette(h), vec3(.96), .55 * pane), vec3(.2), step(.94, max(c.x, c.y)));
                  // Some boxes carry the brand's block and initial.
                  albedo = mix(albedo, vec3(.16), pane * (1.0 - top) * nightGlyph(nightBrand[brand * ${BRAND_LENGTH} + (flank > .5 || fract(h * 29.0) < .5 ? 0 : 2)], vec2(mirrored < .5 ? 1.0 - c.x : c.x, c.y) * vec2(2.5, 2.0) - vec2(.75, .5)));
                } else if (kind == 3.0) albedo = top > .5 ? vec3(.95) : mix(nightPalette(pick * 3.0 + .2), vec3(.96), step(.5, fract(hit.y * 3.0)));
                else if (front > .5) {
                  float band = floor((length(hit.xy - vec2(.5 * size.x, .75)) - .45) / .15);
                  if (band >= 0.0 && band < 5.0 && hit.y > .75) albedo = nightPalette((band + .5) / 6.0);
                }
              } else if (shopKind == 9) {
                // Florist: zinc buckets in two steps, blooms seen from above, pot plants on shelves at the back.
                wall = vec3(.9, .92, .86); albedo = wall; floorColor = vec3(.5, .5, .48); tileSize = .3;
                if (kind == 1.0 || kind == 2.0) {
                  vec2 g = hit.xz * 7.0;
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = top > .5 ? mix(vec3(.2, .42, .22), mix(nightPalette(h * 4.7), vec3(.95, .5, .2), step(.8, fract(h * 5.0))), step(length(fract(g) - .5), .36) * step(.25, h))
                    : mix(vec3(.6, .63, .65), vec3(.3), step(.9, fract(q.x * 3.125))) * (1.0 - .2 * step(.85, fract(hit.y * 4.0)));
                } else if (kind == 3.0) albedo = top > .5 ? timber * 1.1 : vec3(.3, .42, .32);
                else if (front > .5) {
                  vec2 g = vec2(hit.x * 2.5, (hit.y - .9) / .45), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed), shelf = step(.9, hit.y) * step(hit.y, 2.25);
                  albedo = mix(albedo, timber, shelf * step(c.y, .06));
                  albedo = mix(albedo, vec3(.2, .45 + .2 * h, .25), shelf * step(.3, c.y) * step(length((c - vec2(.5, .55)) * vec2(1.0, 1.2)), .26 + .1 * h));
                  albedo = mix(albedo, vec3(.72, .42, .3), shelf * step(abs(c.x - .5), .18) * step(.06, c.y) * step(c.y, .3));
                }
              } else if (shopKind == 10) {
                // Bags: a wall of lit niches with a bag in each, one on a stand in the window, a sofa.
                wall = vec3(.9, .86, .78); albedo = wall; floorColor = vec3(.82, .78, .7); tileSize = 1.0;
                if (kind == 1.0) {
                  float cells = max(1.0, floor((aHigh.x - aLow.x) / .8));
                  vec2 g = vec2((hit.x - aLow.x) / (aHigh.x - aLow.x) * cells, hit.y / .55), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed), niche = step(.06, c.x) * step(c.x, .94) * step(.08, c.y) * step(c.y, .94);
                  vec2 b = (c - vec2(.5, .1)) * vec2((aHigh.x - aLow.x) / cells, .55);
                  float bag = max(step(abs(b.x), .15 - .03 * smoothstep(0.0, .2, b.y)) * step(0.0, b.y) * step(b.y, .2), step(abs(length(vec2(b.x, b.y - .2)) - .08), .015) * step(.2, b.y)) * step(.15, h);
                  albedo = front > .5 ? mix(timber * .9, mix(vec3(.95, .9, .8), nightGarment(h * 3.7), bag), niche) : timber * .8;
                  glow = front * niche * (1.0 - bag) * .7; glowColor = vec3(1.25, 1.1, .85);
                } else if (kind == 2.0) albedo = vec3(.93) * mix(.8, 1.0, top);
                else if (kind == 3.0) albedo = accent * mix(.75, 1.0, top) * (1.0 - .2 * step(.9, fract(hit.z * 2.0)));
              } else if (shopKind == 11) {
                // Medicine hall: a wall of small drawers with jars over them, a rosewood counter, jars in the window.
                wall = vec3(.9, .86, .74); albedo = wall; floorColor = vec3(.52, .6, .54); tileSize = .3;
                vec3 rosewood = vec3(.36, .2, .14);
                if (kind == 1.0) {
                  vec2 g = vec2(hit.x / .3, hit.y / .22), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = front < .5 ? rosewood * .7 : hit.y < 1.54 ? mix(rosewood * (.85 + .3 * h), vec3(.84, .66, .3), step(length((c - .5) * vec2(.3, .22)), .024)) * (1.0 - .45 * step(.9, max(c.x, c.y)))
                    : mix(rosewood * .55, mix(vec3(.8, .6, .3), vec3(.6, .25, .15), h), step(abs(c.x - .5), .3) * step(c.y, .8));
                } else if (kind == 2.0) albedo = top > .5 ? mix(rosewood * 1.2, vec3(.75, .15, .12), step(.7, nightRoomHash(dot(floor(hit.xz * 4.0), vec2(1.0, 7.0)) + seed))) : rosewood * (1.0 - .3 * step(.92, fract(q.x * 1.5)));
                else if (kind == 3.0) albedo = rosewood * mix(.8, 1.2, top);
                else if (flank > .5 && normal.x < 0.0) albedo = nightPicture(albedo, q, vec2(1.0, .9), vec2(1.5, 2.1), vec3(.9, .86, .78));
              } else if (shopKind == 12) {
                // Tea merchant: shelves of tins, a rosewood tasting table, a tea chest in the window under red lanterns, scrolls.
                wall = vec3(.84, .78, .64); albedo = wall; floorColor = vec3(.4, .27, .2); tileSize = .18;
                vec3 rosewood = vec3(.36, .2, .14);
                if (kind == 1.0) {
                  vec2 g = vec2(q.x / .26, hit.y / .3), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  vec3 tin = h < .3 ? vec3(.7, .16, .14) : h < .55 ? vec3(.2, .42, .3) : h < .8 ? vec3(.76, .77, .78) : vec3(.84, .66, .3);
                  albedo = normal.x > .5 ? mix(mix(rosewood * .5, tin, step(abs(c.x - .5), .36) * step(c.y, .78)), rosewood, step(.9, c.y)) : rosewood * .7;
                } else if (kind == 2.0) albedo = top > .5 ? mix(rosewood * 1.2, vec3(.88, .85, .78), step(length(fract(hit.xz * 5.0) - .5), .2) * step(.55, nightRoomHash(dot(floor(hit.xz * 5.0), vec2(1.0, 7.0)) + seed))) : rosewood;
                else if (kind == 3.0) albedo = top > .5 ? mix(vec3(.72, .58, .38), vec3(.3, .2, .14), step(length(fract(hit.xz * 3.5) - .5), .4)) : mix(vec3(.72, .58, .38), vec3(.5, .12, .1), nightRect(q, vec2(cLow.x + .15, .12), vec2(cLow.x + .6, .38))) * (1.0 - .25 * step(.94, fract(hit.y * 4.0)));
                else if (front > .5) {
                  albedo = nightPicture(albedo, hit.xy, vec2(.5 * size.x - .3, .7), vec2(.5 * size.x + .3, 2.15), vec3(.92, .88, .78));
                  for (float side = -1.0; side < 2.0; side += 2.0) albedo = mix(albedo, vec3(.7, .14, .12), nightRect(hit.xy, vec2(.5 * size.x + side * .62 - .1, .8), vec2(.5 * size.x + side * .62 + .1, 2.1)));
                }
              } else if (shopKind == 13 || shopKind == 16) {
                // Dried goods and spices: open sacks and baskets heaped with colour, shelves of jars and packets, strings hung overhead.
                float spice = shopKind == 16 ? 1.0 : 0.0;
                wall = spice > .5 ? mix(vec3(.36, .56, .72), vec3(.9, .62, .66), step(.5, pick)) : vec3(.88, .84, .72); albedo = wall;
                floorColor = vec3(.6, .58, .54); tileSize = .3;
                float sack = spice > .5 ? step(kind, 1.5) : step(kind, 2.5), shelves = spice > .5 ? step(1.5, kind) * step(kind, 2.5) : step(2.5, kind);
                if (kind > .5 && sack > .5) {
                  vec2 g = hit.xz / .42, c = fract(g) - .5;
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed), r = length(c);
                  vec3 heap = spice > .5 ? (h < .2 ? vec3(.9, .65, .1) : h < .4 ? vec3(.75, .16, .1) : h < .55 ? vec3(.5, .36, .2) : h < .7 ? vec3(.45, .55, .3) : h < .85 ? vec3(.92, .9, .82) : vec3(.15, .13, .12))
                    : (h < .22 ? vec3(.3, .22, .16) : h < .44 ? vec3(.55, .14, .1) : h < .62 ? vec3(.85, .5, .15) : h < .8 ? vec3(.9, .86, .74) : vec3(.75, .6, .35));
                  heap *= .82 + .3 * step(.5, nightRoomHash(dot(floor(hit.xz * 30.0), vec2(1.0, 7.0))));
                  albedo = top > .5 ? (r < .4 ? heap : r < .47 ? vec3(.74, .62, .4) : vec3(.3, .26, .22))
                    : mix(vec3(.78, .7, .52), vec3(.6, .2, .16), step(.45, fract(hit.y * 2.2)) * step(fract(hit.y * 2.2), .55)) * (1.0 - .3 * step(.93, fract(q.x / .42)));
                } else if (kind > .5 && shelves > .5) {
                  vec2 g = vec2(q.x / .28, hit.y / .36), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed * 3.0);
                  vec3 packet = spice > .5 ? nightPalette(h * 2.3) : mix(vec3(.8, .62, .34), vec3(.62, .2, .14), step(.6, h));
                  albedo = (spice > .5 ? step(.5, normal.x) : front) > .5 ? mix(mix(vec3(.3, .25, .2), packet, step(abs(c.x - .5), .36) * step(c.y, .5 + .35 * h)), vec3(.5, .4, .3), step(.9, c.y)) : vec3(.4, .32, .25);
                } else if (kind > .5) albedo = top > .5 ? vec3(.72, .74, .76) : mix(vec3(.72, .16, .14), vec3(.9), step(.8, hit.y));
              } else if (shopKind == 14) {
                // Textiles: bolts of cloth stacked to the ceiling down one side and across the back, a cutting counter, saris on forms.
                wall = vec3(.93, .9, .82); albedo = wall; floorColor = vec3(.7, .66, .58);
                if (kind == 1.0 || kind == 2.0) {
                  float h = nightRoomHash(floor(hit.y / .11) + floor(q.x / 1.1) * 13.0 + seed * 31.0 + kind);
                  vec3 cloth = mix(nightPalette(h), nightPalette(h) * nightPalette(h), .25);
                  cloth = mix(cloth, vec3(.86, .68, .3), step(.5, fract(h * 7.0)) * step(.82, fract(hit.y / .11)));
                  albedo = (kind == 1.0 ? step(.5, normal.x) : front) > .5 ? cloth * (1.0 - .5 * step(.97, fract(q.x / 1.1))) * (1.0 - .25 * step(fract(hit.y / .11), .1)) : vec3(.45, .33, .24);
                } else if (kind == 3.0) albedo = top > .5 ? mix(accent, vec3(.86, .68, .3), step(.42, abs(fract(hit.z * 1.4) - .5))) : vec3(.45, .33, .24);
              } else if (shopKind == 15) {
                // Garlands: a counter heaped with loose flowers under hanging strings of them, brass lamps and fruit on the shelf behind.
                wall = mix(vec3(.2, .46, .5), vec3(.93, .78, .32), step(.5, pick)); albedo = wall; floorColor = vec3(.62, .6, .58); tileSize = .3;
                if (kind == 1.0) {
                  vec2 g = hit.xz * 11.0;
                  float heap = nightRoomHash(dot(floor(hit.xz / .45), vec2(1.0, 7.0)) + seed);
                  vec3 flower = heap < .3 ? vec3(.96, .76, .1) : heap < .55 ? vec3(.95, .5, .1) : heap < .8 ? vec3(.95, .94, .9) : vec3(.8, .14, .2);
                  albedo = top > .5 ? mix(vec3(.24, .42, .2), flower, step(length(fract(g) - .5), .42)) : mix(vec3(.74, .76, .78), vec3(.2, .4, .6), step(.3, hit.y) * step(hit.y, .5));
                } else if (kind == 2.0) {
                  vec2 g = vec2(hit.x / .3, hit.y / .35), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = front > .5 ? mix(mix(vec3(.4, .3, .22), h < .5 ? vec3(.86, .68, .3) : h < .75 ? vec3(.95, .8, .2) : vec3(.3, .5, .25), step(length((c - vec2(.5, .38)) * vec2(1.0, 1.15)), .3)), vec3(.55, .42, .3), step(.9, c.y)) : vec3(.4, .3, .22);
                } else if (kind == 3.0) albedo = top > .5 ? vec3(.93, .8, .25) * (.8 + .2 * step(.5, fract(hit.z * 5.0))) : vec3(.3, .5, .25);
                else if (front > .5) albedo = nightPicture(albedo, hit.xy, vec2(.5 * size.x - .4, 1.55), vec2(.5 * size.x + .4, 2.2), accent);
              } else if (shopKind == 17) {
                // Carpets: a stack of folded rugs, rolled ones stood in the corner, a cushioned seat, rugs on every wall and the floor.
                wall = vec3(.85, .78, .66); albedo = wall; floorColor = vec3(.62, .56, .48);
                if (kind == 1.0) {
                  float layer = nightRoomHash(floor(hit.y / .07) + seed * 31.0);
                  albedo = top > .5 ? nightCarpet((hit.xz - aLow.xz) / (aHigh.xz - aLow.xz), pick) : nightCarpetColor(layer) * (1.0 - .3 * step(.85, fract(hit.y / .07)));
                } else if (kind == 2.0) albedo = top > .5 ? vec3(.3, .2, .16) : nightCarpetColor(nightRoomHash(floor(q.x / .23) + seed * 17.0 + normal.x)) * (1.0 - .45 * abs(fract(q.x / .23) - .5)) * (1.0 - .2 * step(.5, fract(hit.y * 6.0)));
                else if (kind == 3.0) albedo = top > .5 ? mix(nightCarpetColor(pick + .2), nightCarpetColor(pick + .6), step(.5, fract(hit.z * 2.5))) : vec3(.4, .28, .2);
                else if (front > .5) {
                  for (float side = 0.0; side < 2.0; side += 1.0) {
                    vec2 low = vec2(mix(.35, .5 * size.x + .1, side), .5), high = vec2(mix(.5 * size.x - .1, size.x - .35, side), 2.15);
                    if (nightRect(hit.xy, low, high) > .5) albedo = nightCarpet((hit.xy - low) / (high - low), pick + .31 + .4 * side);
                  }
                } else if (flank > .5 && nightRect(q, vec2(.9, .45), vec2(2.5, 2.1)) > .5) albedo = nightCarpet((q - vec2(.9, .45)) / vec2(1.6, 1.65), pick + .13 + normal.x * .2);
              } else if (shopKind == 19) {
                // Kopitiam: marble-top tables and wooden chairs, a tiled drinks counter, tins on a shelf and a menu board, tiles on the floor and half way up the walls.
                vec2 small = floor(q / .12);
                wall = vec3(.92, .88, .76); albedo = hit.y < 1.2 ? mix(vec3(.92), vec3(.35, .6, .5), mod(small.x + small.y, 2.0)) : wall; tileSize = .4;
                if (kind == 1.0) albedo = top > .5 ? vec3(.74, .76, .78) : mix(vec3(.9, .92, .93), vec3(.55, .72, .82), mod(small.x + small.y, 2.0));
                else if (kind > 1.5) albedo = top > .5 ? vec3(.92, .91, .88) * (1.0 - .12 * step(.8, nightRoomHash(dot(floor(hit.xz * 14.0), vec2(1.0, 7.0))))) : vec3(.3, .2, .14);
                else if (front > .5) {
                  vec2 g = vec2(hit.x / .16, (hit.y - 1.3) / .26), c = fract(g);
                  float row = step(1.3, hit.y) * step(hit.y, 1.56) * step(.5 * size.x, hit.x) * step(hit.x, size.x - .3);
                  albedo = mix(albedo, nightPalette(nightRoomHash(floor(g.x) + seed)), row * step(abs(c.x - .5), .36) * step(c.y, .85));
                  albedo = mix(albedo, vec3(.35, .25, .18), step(1.24, hit.y) * step(hit.y, 1.3) * step(.5 * size.x - .1, hit.x) * step(hit.x, size.x - .2));
                  float board = nightRect(hit.xy, vec2(.4, 1.7), vec2(.5 * size.x - .2, 2.15));
                  albedo = mix(albedo, mix(vec3(.62, .13, .12), vec3(.95, .92, .85), step(.55, fract(hit.y * 11.0)) * step(.5, hit.x) * step(hit.x, .5 * size.x - .3 - .4 * nightRoomHash(floor(hit.y * 11.0) + seed))), board);
                }
              } else if (shopKind == 20 || shopKind == 26) {
                // Kueh shop: trays of coloured kueh under glass over a tiled counter, jars of biscuits behind, a stack of bamboo steamers.
                // The bakery is the same shop in cream and brown: buns and loaves under the glass, a slatted counter, a trolley of trays.
                float bread = shopKind == 26 ? 1.0 : 0.0;
                wall = bread > .5 ? mix(vec3(.95, .9, .78), vec3(.5, .34, .24), step(.6, pick)) : mix(vec3(.72, .87, .78), vec3(.95, .78, .8), step(.5, pick)); albedo = wall; tileSize = .4;
                if (kind == 1.0) {
                  vec2 g = vec2(hit.x / .15, (hit.y - .55) / .16), c = fract(g);
                  float h = nightRoomHash(floor(g.y) * 3.0 + floor(hit.x / .75) * 7.0 + seed);
                  vec3 kueh = h < .17 ? vec3(.5, .75, .4) : h < .34 ? vec3(.95, .6, .7) : h < .5 ? vec3(.95, .93, .85) : h < .67 ? vec3(.5, .32, .2) : h < .84 ? vec3(.6, .45, .75) : vec3(.95, .8, .35);
                  if (bread > .5) kueh = mix(vec3(.82, .58, .28), vec3(.55, .33, .16), h) * (1.0 + .25 * step(.6, c.y));
                  albedo = top > .5 ? vec3(.85, .87, .88) : bread > .5 ? timber * (1.0 - .25 * step(.88, fract(q.x * 7.0))) : nightTile(q / .28, vec3(.2, .5, .5), vec3(.85, .4, .5));
                  if (front > .5 && hit.y > .55) { albedo = mix(vec3(.93, .92, .9), kueh, step(abs(c.x - .5), .38) * step(abs(c.y - .45), .3)); glow = .45; glowColor = albedo * 1.3; }
                } else if (kind == 2.0) {
                  vec2 g = vec2(hit.x / .3, hit.y / .4), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  float jar = step(abs(c.x - .5), .32) * step(c.y, .75);
                  albedo = front > .5 ? mix(mix(vec3(.97, .95, .9), mix(mix(vec3(.82, .64, .36), vec3(.6, .4, .22), h), vec3(.75, .14, .12), step(.6, c.y)), jar), vec3(.6, .45, .32), step(.9, c.y)) : vec3(.6, .45, .32);
                  if (bread > .5 && front > .5) albedo = mix(mix(vec3(.3, .24, .2), mix(vec3(.85, .6, .3), vec3(.6, .36, .18), h), step(length((c - vec2(.5, .3)) * vec2(1.0, 1.6)), .36)), vec3(.72, .74, .76), step(.9, c.y));
                } else if (kind == 3.0) albedo = top > .5 ? vec3(.8, .68, .44) : bread > .5 ? mix(vec3(.72, .74, .76), mix(vec3(.85, .6, .3), vec3(.3), step(.5, fract(q.x * 3.0))), step(.4, fract(hit.y / .24)) * step(fract(hit.y / .24), .8)) : mix(vec3(.74, .6, .36), vec3(.45, .33, .2), step(.85, fract(hit.y / .2)));
              } else if (shopKind == 21) {
                // Tailor: a cutting table, a wall of cloth stood on end, a sewing table and dress forms in the window, a tall mirror.
                wall = vec3(.9, .88, .82); albedo = wall; floorColor = timber; tileSize = .18;
                if (kind == 1.0) albedo = top > .5 ? mix(mix(timber * 1.2, accent, nightRect(hit.xz, aLow.xz + vec2(.2, .1), aLow.xz + vec2(1.1, .6))), vec3(.95, .82, .2), step(abs(hit.z - aHigh.z + .1), .015)) : timber * .8;
                else if (kind == 2.0) {
                  float h = nightRoomHash(floor(hit.x / .13) + floor(hit.y / .74) * 13.0 + seed * 31.0);
                  albedo = front > .5 ? mix(mix(nightGarment(h), nightPalette(h * 3.0), step(.55, fract(h * 5.0))) * (1.0 - .5 * abs(fract(hit.x / .13) - .5)), timber * .6, step(.93, fract(hit.y / .74))) : timber * .7;
                } else if (kind == 3.0) albedo = top > .5 ? mix(timber * 1.2, vec3(.1), nightRect(hit.xz, cLow.xz + vec2(.25, .1), cLow.xz + vec2(.65, .3))) : timber * .8;
                else if (flank > .5 && normal.x < 0.0) albedo = mix(albedo, mix(vec3(.3, .22, .16), vec3(.7, .78, .82), nightRect(q, vec2(1.26, .26), vec2(1.94, 2.04))), nightRect(q, vec2(1.2, .2), vec2(2.0, 2.1)));
              } else if (shopKind == 22) {
                // Provision shop: crates and cartons stacked by the door, shelves packed to the ceiling, a counter of sweet jars, tins behind it.
                wall = vec3(.93, .9, .74); albedo = wall; floorColor = vec3(.6, .58, .54); tileSize = .3; spots = 0.0;
                if (kind == 1.0) {
                  vec2 g = (top > .5 ? hit.xz : q) / vec2(.4, .33), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed + normal.x);
                  vec3 crate = (h < .2 ? vec3(.8, .16, .14) : h < .35 ? vec3(.2, .4, .75) : vec3(.93, .75, .15)) * (1.0 - .35 * step(.5, fract(c.y * 4.0)) * (1.0 - top));
                  vec3 carton = mix(vec3(.74, .58, .38), vec3(.86, .8, .66), step(abs(c.x - .5), .06));
                  albedo = mix(h < .5 ? crate : carton, vec3(.25, .2, .16), step(.95, max(c.x, c.y)));
                } else if (kind == 2.0) {
                  vec2 g = vec2(q.x / .2, hit.y / .3), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed * 3.0);
                  albedo = normal.x < -.5 ? mix(mix(vec3(.3, .26, .22), nightPalette(h * 2.3), step(abs(c.x - .5), .4) * step(c.y, .55 + .3 * h)), vec3(.8, .78, .7), step(.9, c.y)) : vec3(.7, .68, .6);
                } else if (kind == 3.0) {
                  vec2 g = hit.xz * 6.0;
                  albedo = top > .5 ? mix(vec3(.8, .78, .72), mix(vec3(.85, .2, .2), nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)), .6), step(length(fract(g) - .5), .36)) : mix(vec3(.25, .45, .7), vec3(.9), step(.5, fract(hit.y * 2.5)));
                } else if (front > .5) {
                  vec2 g = vec2(hit.x / .18, (hit.y - 1.1) / .22), c = fract(g);
                  float rows = step(1.1, hit.y) * step(hit.y, 2.2) * step(.3, hit.x) * step(hit.x, size.x - .5);
                  albedo = mix(albedo, mix(nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)) * .85, vec3(.5, .42, .34), step(.86, c.y)), rows * step(abs(c.x - .5), .42));
                }
              } else if (shopKind == 23) {
                // Clinic: a row of plastic chairs, a reception counter with medicine boxes behind, a door under a lit green cross, an eye chart.
                wall = mix(vec3(.94, .96, .95), vec3(.86, .93, .88), step(.5, pick)); albedo = wall; floorColor = vec3(.8, .84, .82); spots = 0.0;
                if (kind == 1.0) albedo = top > .5 ? mix(vec3(.25, .5, .75), vec3(.92, .56, .2), step(.5, fract(floor((hit.x - aLow.x) / .5) * .5 + .25))) * (1.0 - .4 * step(.9, fract((hit.x - aLow.x) / .5))) : vec3(.55, .57, .6);
                else if (kind == 2.0) albedo = top > .5 ? vec3(.95) : mix(vec3(.93), vec3(.2, .6, .42), step(.7, hit.y) * step(hit.y, .85));
                else if (kind == 3.0) {
                  vec2 g = vec2(hit.x / .22, hit.y / .3), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = front > .5 ? mix(mix(vec3(.8, .84, .86), mix(vec3(.96), nightPalette(h * 2.9), step(.3, c.y) * step(c.y, .42)), step(abs(c.x - .5), .4) * step(c.y, .7) * step(.2, h)), vec3(.7, .72, .74), step(.9, c.y)) : vec3(.85);
                } else if (front > .5) {
                  albedo = mix(albedo, vec3(.78, .68, .52), nightRect(hit.xy, vec2(.3, 0.0), vec2(1.2, 2.05)));
                  vec2 cross = abs(hit.xy - vec2(.75, 2.3));
                  glow = max(step(cross.x, .05) * step(cross.y, .15), step(cross.x, .15) * step(cross.y, .05)); glowColor = vec3(.3, 1.3, .6);
                } else if (flank > .5 && normal.x < 0.0 && nightRect(q, vec2(1.0, 1.0), vec2(1.6, 2.0)) > .5) {
                  float row = floor((2.0 - q.y) * 8.0), letters = 2.0 + row;
                  albedo = mix(vec3(.97), vec3(.1), step(.3, fract((q.x - 1.0) / .6 * letters)) * step(.35, fract((2.0 - q.y) * 8.0)) * step(.06, q.x - 1.0) * step(q.x, 1.54));
                }
              } else if (shopKind == 24) {
                // Hair salon: a counter under a row of lit mirrors, a wash basin at the back, a sofa in the window, a barber's pole and posters.
                float moody = step(.6, pick);
                wall = mix(vec3(.93, .9, .88), vec3(.25, .24, .26), moody); albedo = wall; floorColor = vec3(.8); tileSize = .5;
                if (kind == 1.0) albedo = top > .5 ? mix(vec3(.9), nightBottle(nightRoomHash(dot(floor(hit.xz * 8.0), vec2(1.0, 7.0)) + seed)), step(length(fract(hit.xz * 8.0) - .5), .25) * step(.6, nightRoomHash(dot(floor(hit.xz * 8.0), vec2(7.0, 1.0)) + seed))) : timber * (1.0 - .3 * step(.94, fract(q.x / .55)));
                else if (kind == 2.0) albedo = top > .5 ? mix(vec3(.12), vec3(.94), step(length((hit.xz - .5 * (bLow.xz + bHigh.xz)) * vec2(1.0, 1.3)), .28)) : vec3(.12);
                else if (kind == 3.0) albedo = accent * mix(.7, 1.0, top) * (1.0 - .2 * step(.92, fract(hit.x * 1.6)));
                else if (flank > .5 && normal.x > 0.0) {
                  // Mirrors over the counter, each under its own strip light.
                  float u = fract((q.x - .9) / 1.15) * 1.15, inMirror = step(.9, q.x) * step(.12, u) * step(u, .95);
                  albedo = mix(albedo, vec3(.7, .78, .83) * (.85 + .15 * step(.5, fract((u + q.y) * 1.4))), inMirror * step(.95, q.y) * step(q.y, 1.95));
                  glow = inMirror * step(1.98, q.y) * step(q.y, 2.06); glowColor = vec3(1.3, 1.22, 1.05);
                } else if (front > .5) {
                  for (float n = 0.0; n < 2.0; n += 1.0) albedo = nightPicture(albedo, hit.xy, vec2(.4 + n * .8, 1.15), vec2(1.0 + n * .8, 2.0), nightPalette(pick * 3.0 + n * .37));
                  float pole = nightRect(hit.xy, vec2(size.x - 1.55, 1.2), vec2(size.x - 1.4, 1.95)), stripe = fract((hit.y + hit.x) * 4.0);
                  albedo = mix(albedo, stripe < .33 ? vec3(.8, .14, .16) : stripe < .66 ? vec3(.96) : vec3(.16, .3, .7), pole);
                }
              } else if (shopKind == 25) {
                // Tuition centre: two rows of desks with worksheets, a low bookshelf, a whiteboard of working, posters and an alphabet strip.
                wall = mix(vec3(.95, .93, .8), vec3(.82, .9, .95), step(.5, pick)); albedo = wall; floorColor = vec3(.3, .42, .6); tileSize = .5; spots = 0.0;
                if (kind == 1.0 || kind == 2.0) {
                  vec2 g = vec2((hit.x - aLow.x) / .6, hit.z * 3.0);
                  albedo = top > .5 ? mix(vec3(.86, .84, .78), vec3(.97), step(abs(fract(g.x) - .5), .28) * step(.5, nightRoomHash(floor(g.x) + kind * 5.0 + seed))) : nightPalette(nightRoomHash(floor(g.x) + kind + seed)) * (1.0 - .3 * step(.94, fract(g.x)));
                } else if (kind == 3.0) {
                  float board = step(.88, fract(hit.y * 2.9)), spine = nightRoomHash(floor(q.x * 11.0) + floor(hit.y * 2.9) * 13.0 + seed * 31.0);
                  albedo = normal.x > .5 ? mix(nightPalette(spine) * (.7 + .3 * fract(spine * 9.0)), vec3(.9), board) : vec3(.88);
                } else if (front > .5) {
                  vec2 low = vec2(.5, .9), high = vec2(size.x - .5, 2.0);
                  float row = floor(hit.y * 9.0), h = nightRoomHash(row + seed * 7.0);
                  float ink = step(.3, fract(hit.y * 9.0)) * step(fract(hit.y * 9.0), .45) * step(low.x + .15, hit.x) * step(hit.x, low.x + .3 + (high.x - low.x - .5) * h) * step(.25, fract(hit.x * 2.3 + h));
                  albedo = mix(albedo, mix(vec3(.6), mix(vec3(.97), h < .4 ? vec3(.1, .2, .6) : h < .7 ? vec3(.12) : vec3(.75, .15, .15), ink), nightRect(hit.xy, low + .05, high - .05)), nightRect(hit.xy, low, high));
                  albedo = mix(albedo, nightPalette(floor(hit.x / .22) * .19 + pick), step(2.1, hit.y) * step(hit.y, 2.24) * step(.1, fract(hit.x / .22)) * step(.4, hit.x) * step(hit.x, size.x - .4));
                } else if (flank > .5 && normal.x < 0.0) {
                  albedo = nightPicture(albedo, q, vec2(.8, 1.1), vec2(1.5, 2.0), nightPalette(pick * 5.0));
                  albedo = nightPicture(albedo, q, vec2(1.8, 1.1), vec2(2.5, 2.0), nightPalette(pick * 5.0 + .4));
                }
              } else if (shopKind == 27) {
                // Fruit stall: tiers of durians, mangosteens and rambutans in the window, crates at the back, a weighing counter, price cards.
                wall = vec3(.95, .86, .45); albedo = wall; floorColor = vec3(.55, .54, .5); tileSize = .3; spots = 0.0;
                if (kind == 1.0) {
                  vec2 g = (top > .5 ? hit.xz : q) / .26, c = fract(g) - .5;
                  float h = nightRoomHash(floor((hit.x - aLow.x) / .9) + seed * 3.0), each = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  vec3 fruit = h < .5 ? mix(vec3(.42, .46, .18), vec3(.66, .64, .3), step(.5, fract((c.x + c.y) * 5.0))) : h < .75 ? vec3(.36, .12, .3) : vec3(.82, .16, .14);
                  albedo = top > .5 ? mix(vec3(.2, .3, .16), fruit * (.8 + .4 * each), step(length(c), .42)) : mix(vec3(.2, .5, .28), vec3(.94), step(.5, fract(q.x * 3.0)));
                } else if (kind == 2.0) albedo = top > .5 ? vec3(.5, .52, .22) : mix(vec3(.74, .58, .38), vec3(.3, .22, .15), max(step(.82, fract(hit.y * 8.0)), step(.96, fract(q.x * 2.0))));
                else if (kind == 3.0) {
                  // The scale's dial stands on the counter.
                  albedo = top > .5 ? mix(vec3(.82, .82, .8), vec3(.85, .2, .16), step(length(hit.xz - vec2(cLow.x + .35, .5 * (cLow.z + cHigh.z))), .18)) : vec3(.2, .45, .3) * (1.0 - .3 * step(.9, fract(hit.y * 3.0)));
                } else if (front > .5) {
                  vec2 g = vec2(hit.x / .7, (hit.y - 1.2) / .45), c = fract(g) - .5;
                  float card = step(1.2, hit.y) * step(hit.y, 2.1) * step(.3, hit.x) * step(hit.x, size.x - .3) * step(abs(c.x), .4) * step(abs(c.y), .36);
                  albedo = mix(albedo, mix(vec3(.85, .12, .1), vec3(.97), step(abs(c.y), .13) * step(abs(c.x), .28) * step(.3, fract(c.x * 6.0))), card);
                }
              } else if (shopKind == 28) {
                // Lighting shop: dark walls so every lamp shows, a table of lit shades, shelves of lamps, rows of sconces.
                wall = vec3(.2, .19, .2); albedo = wall; floorColor = vec3(.3, .28, .27); ceilingColor = vec3(.16);
                vec3 warm = vec3(1.4, 1.12, .72);
                if (kind == 1.0) {
                  vec2 g = hit.xz / .42, c = fract(g) - .5;
                  albedo = timber * mix(.7, 1.0, top);
                  glow = top * step(length(c), .3) * .9; glowColor = mix(warm, nightPalette(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)) + .3, .3);
                } else if (kind == 2.0) {
                  vec2 c = fract(vec2(q.x / .45, hit.y / .5)) - .5;
                  albedo = mix(vec3(.12), vec3(.4, .3, .2), step(.42, c.y));
                  glow = step(.5, normal.x) * step(abs(c.x), .2) * step(abs(c.y + .05), .2) * .85; glowColor = warm;
                } else if (kind == 3.0) albedo = top > .5 ? vec3(.85) : timber;
                else if (front > .5) {
                  vec2 c = (fract(vec2(hit.x / .6, (hit.y - 1.0) / .55)) - .5) * vec2(.6, .55);
                  float rows = step(1.0, hit.y) * step(hit.y, 2.1) * step(.3, hit.x) * step(hit.x, size.x - .3);
                  albedo += .3 * rows * (1.0 - smoothstep(.05, .28, length(c))) * warm;
                  glow = rows * step(length(c), .08); glowColor = warm;
                }
              } else if (shopKind == 29) {
                // Plant nursery: pots on a bench in the window, a tiered stand of foliage and flowers, sacks of soil, shelves of pots on a slatted wall.
                wall = vec3(.86, .88, .8); albedo = hit.y < 1.0 ? timber * (1.0 - .2 * step(.9, fract(q.x * 6.0))) : wall;
                floorColor = vec3(.5, .48, .44); tileSize = .45; spots = 0.0;
                vec3 terracotta = vec3(.72, .4, .26);
                if (kind == 1.0) {
                  vec2 g = vec2(q.x / .3, hit.y / .43), c = fract(g) - .5;
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  vec3 plant = h > .75 ? nightPalette(h * 9.0) : mix(vec3(.2, .44, .22), vec3(.4, .62, .3), fract(h * 5.0));
                  plant *= .75 + .4 * step(.5, nightRoomHash(dot(floor(vec2(q.x, hit.y) * 22.0), vec2(1.0, 7.0))));
                  albedo = top > .5 ? vec3(.24, .46, .24) : mix(c.y < -.2 ? terracotta * (1.0 - .5 * step(.36, abs(c.x))) : plant, vec3(.3, .24, .18), step(.46, c.y));
                } else if (kind == 2.0) albedo = top > .5 ? vec3(.3, .24, .18) : mix(timber * .7, terracotta * (.8 + .3 * nightRoomHash(floor((hit.x - bLow.x) / .32) + seed)), step(abs(fract((hit.x - bLow.x) / .32) - .5), .3) * step(.3, hit.y));
                else if (kind == 3.0) albedo = mix(vec3(.86, .8, .6), vec3(.3, .5, .26), step(abs(fract(hit.y / .27) - .5), .2) * step(abs(fract(q.x / .5) - .5), .3)) * (1.0 - .35 * step(.93, fract(hit.y / .27)));
                else if (front > .5) {
                  vec2 g = vec2(hit.x / .34, (hit.y - 1.15) / .45), c = fract(g) - .5;
                  float rows = step(1.15, hit.y) * step(hit.y, 2.05) * step(.3, hit.x) * step(hit.x, size.x - .3), h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  vec3 pot = c.y > 0.0 ? mix(vec3(.2, .44, .22), vec3(.4, .62, .3), h) : mix(terracotta, vec3(.9, .9, .86), step(.7, h));
                  albedo = mix(albedo, mix(pot, timber * .7, step(.42, abs(c.y))), rows * max(step(abs(c.x), mix(.22, .34, step(0.0, c.y))) * step(.15, h), step(.42, abs(c.y))));
                }
              } else if (shopKind == 30) {
                // Souvenir shop: a table of trinkets, a wall of folded shirts, a counter, magnets and keyrings in rows at the back.
                wall = vec3(.95, .93, .88); albedo = wall; floorColor = timber * 1.1; tileSize = .18;
                if (kind == 1.0) {
                  vec2 g = hit.xz * 6.0;
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = top > .5 ? mix(vec3(.9, .88, .82), nightPalette(h * 4.3), step(.3, h) * step(length(fract(g) - .5), .3)) : vec3(.8, .15, .15) * (1.0 - .25 * step(.5, fract(q.x * 4.0)));
                } else if (kind == 2.0) {
                  vec2 g = vec2(q.x / .4, hit.y / .28), c = fract(g);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed * 3.0);
                  albedo = normal.x < -.5 ? mix(mix(nightPalette(h * 3.1), nightPalette(h * 7.7), step(.5, c.y)) * (1.0 - .25 * step(.45, abs(c.y - .5))), vec3(.92), max(step(.9, c.y), step(.94, c.x))) : vec3(.86);
                } else if (kind == 3.0) albedo = top > .5 ? vec3(.92) : accent * (1.0 - .2 * step(.9, fract(hit.y * 3.0)));
                else if (front > .5) {
                  vec2 g = vec2(hit.x / .16, (hit.y - 1.1) / .2), c = abs(fract(g) - .5);
                  float rows = step(1.1, hit.y) * step(hit.y, 2.1) * step(.3, hit.x) * step(hit.x, size.x - .3), h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = mix(albedo, nightPalette(h * 5.9) * .9, rows * step(.2, h) * (h > .6 ? step(length(c), .3) : step(max(c.x, c.y), .3)));
                }
              } else if (shopKind == 31) {
                // Surf shop: sandals on a deck in the window, a rail of swimwear, a till, a wave painted along the back wall.
                wall = mix(vec3(.62, .84, .88), vec3(.96, .94, .86), step(.5, pick)); albedo = wall; floorColor = vec3(.84, .74, .56); tileSize = .18;
                if (kind == 1.0) {
                  vec2 g = hit.xz / vec2(.3, .32), c = abs(fract(g) - .5);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = top > .5 ? mix(vec3(.9, .84, .66), nightPalette(h * 4.7), step(.3, h) * step(abs(c.x - .2), .12) * step(c.y, .36)) : timber * (1.0 - .25 * step(.85, fract(hit.y * 6.0)));
                } else if (kind == 2.0) albedo = top > .5 ? vec3(.15) : nightPalette(nightRoomHash(floor(q.x * 8.0) + seed * 31.0) * 4.9) * (1.0 - .4 * step(.8, fract(q.x * 8.0))) * (.75 + .25 * step(.5, fract(hit.y * 5.0)));
                else if (kind == 3.0) albedo = top > .5 ? vec3(.94) : mix(vec3(.16, .46, .66), vec3(.94), step(.5, fract(hit.y * 3.0 + .12 * sin(q.x * 9.0))));
                else if (front > .5) {
                  float crest = 1.15 + .16 * sin(hit.x * 3.6 + pick * 6.0);
                  albedo = mix(albedo, mix(vec3(.14, .44, .64), vec3(.95), step(crest - .07, hit.y)), step(.1, hit.y) * step(hit.y, crest));
                  albedo = mix(albedo, vec3(.98, .8, .3), step(length(hit.xy - vec2(size.x - .9, 1.85)), .24));
                }
              } else if (shopKind == 32) {
                // Bicycle hire: a plank shed, a workbench over a red tool chest, shelves of helmets, spare wheels hung on the back wall beside a board of prices.
                wall = timber * 1.1; albedo = wall * (1.0 - .22 * step(.92, fract(q.x * 5.0)));
                floorColor = vec3(.5, .5, .48); tileSize = 1.2; spots = 0.0;
                if (kind == 1.0) albedo = vec3(.2) * (1.0 + .5 * step(.5, fract(hit.x * 8.0)) * top);
                else if (kind == 2.0) {
                  vec2 g = hit.xz * vec2(3.0, 5.0);
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed);
                  albedo = top > .5 ? mix(timber * .8, h > .8 ? vec3(.7, .72, .74) : vec3(.16, .3, .6), step(.6, h) * step(max(abs(fract(g.x) - .5), abs(fract(g.y) - .5)), .3)) : mix(vec3(.75, .14, .12), vec3(.12), max(step(.9, fract(hit.y * 4.0)), step(.96, fract(q.x * 1.6))));
                } else if (kind == 3.0) {
                  vec2 g = vec2(q.x / .4, hit.y / .42), c = fract(g) - .5;
                  float h = nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed * 3.0);
                  albedo = normal.x < -.5 ? mix(mix(vec3(.22, .2, .18), nightPalette(h * 4.3), step(.2, h) * step(length(vec2(c.x, (c.y + .12) * 1.3)), .34) * step(-.14, c.y)), timber * .7, step(.44, c.y)) : timber * .7;
                } else if (front > .5) {
                  float wheelX = (fract((hit.x - .3) / .9) - .5) * .9, ring = abs(length(vec2(wheelX, hit.y - 1.55)) - .3);
                  if (hit.x > .3 && hit.x < size.x - 1.5 && (ring < .03 || length(vec2(wheelX, hit.y - 1.55)) < .04)) albedo = vec3(.12);
                  vec2 low = vec2(size.x - 1.3, 1.0), high = vec2(size.x - .5, 2.05);
                  float line = step(.35, fract(hit.y * 7.0)) * step(fract(hit.y * 7.0), .6) * step(low.x + .1, hit.x) * step(hit.x, high.x - .1 - .3 * nightRoomHash(floor(hit.y * 7.0) + seed));
                  albedo = mix(albedo, mix(vec3(.16, .2, .18), vec3(.92), line), nightRect(hit.xy, low, high));
                }
              }
              // The shop's name high on the back wall: lit letters on a dark wall, dark ones on a pale wall.
              if (shell * front > .5) {
                float name = nightSign(brand, hit.xy, vec2(.5 * size.x, ${SHOP_WINDOWS.sign[0].toFixed(2)}), ${SHOP_WINDOWS.sign[1].toFixed(2)}, mirrored);
                if (name > .5 && dot(wall, vec3(.333)) > .6) { albedo = shopKind == 7 ? vec3(.75, .4, .48) : shopKind >= 11 && shopKind <= 13 ? vec3(.68, .12, .1) : shopKind == 23 ? vec3(.12, .5, .34) : vec3(.12); glow = 0.0; }
                else if (name > .5) { glow = 1.0; glowColor = shopKind == 2 || shopKind == 18 ? vec3(1.3, 1.1, .7) : vec3(1.3, 1.28, 1.2); }
              }
              if (kind > 4.5) { albedo = cutColor; glow = cutGlow; glowColor = vec3(1.3, 1.0, .62); }
              else if (shell > .5 && top > .5) {
                // Floor: stone, boards or carpet by the shop; a chequerboard in the cafe, coloured tiles in the toy shop, a rug among the books.
                vec2 tile = abs(fract(hit.xz / tileSize) - .5), which = floor(hit.xz / tileSize);
                albedo = floorColor * (1.0 - .16 * step(.47, max(tile.x, tile.y))); glow = 0.0;
                if (shopKind == 5) albedo = mix(vec3(.14), vec3(.88), mod(which.x + which.y, 2.0));
                if (shopKind == 8) albedo = mix(nightPalette(nightRoomHash(which.x + which.y * 7.0 + seed)), vec3(.82), .5);
                if (shopKind == 4) albedo = mix(albedo, accent * .7, nightRect(hit.xz, vec2(.9, reveal + 1.7), vec2(size.x - .9, far - .8)));
                if (shopKind == 24) albedo = mix(vec3(.16), vec3(.88), mod(which.x + which.y, 2.0));
                if (shopKind == 19 || shopKind == 20) albedo = nightTile(hit.xz / .4, shopKind == 19 ? vec3(.3, .5, .42) : vec3(.2, .5, .5), shopKind == 19 ? vec3(.7, .3, .2) : vec3(.85, .4, .5));
                if (shopKind == 17 && nightRect(hit.xz, vec2(.5, reveal + 1.5), vec2(size.x - 1.0, far - 1.3)) > .5) albedo = nightCarpet((hit.xz - vec2(.5, reveal + 1.5)) / vec2(size.x - 1.5, far - 2.8 - reveal), pick + .55);
              } else if (shell > .5 && normal.y < -.5) {
                // Ceiling: rows of spotlights, or strips of light in the brightest shops.
                vec2 g = vec2(hit.x / .9, (hit.z - reveal) / 1.1);
                albedo = ceilingColor;
                glow = mix(step(abs(fract((hit.z - reveal) / 1.3) - .5), .04) * step(.4, hit.x) * step(hit.x, size.x - .4), step(length((fract(g) - .5) * vec2(.9, 1.1)), .08), spots);
                glowColor = vec3(1.3, 1.25, 1.1);
              } else if (shell > .5) albedo *= 1.0 - .3 * step(hit.y, .1);
            }
 else if (home < .5) {
              if (kind == 1.0) albedo = normal.y > .5 ? vec3(.86, .84, .8) : accent * (.8 + .2 * step(.5, fract(hit.x * 1.3)));
              else if (kind == 2.0) {
                // Goods on the shelves: a board every 40 cm, blocks of colour between them.
                float board = step(.86, fract(hit.y * 2.5)), block = nightRoomHash(floor(hit.z * 3.2) + floor(hit.y * 2.5) * 7.0 + seed * 31.0);
                vec3 goods = mix(mix(vec3(.82, .34, .28), vec3(.3, .56, .72), step(.33, block)), vec3(.9, .78, .32), step(.66, block));
                albedo = abs(normal.x) > .5 ? mix(goods, vec3(.2, .17, .15), board) : vec3(.28, .24, .21);
              } else if (kind == 3.0) albedo = normal.y > .5 ? mix(vec3(.8, .74, .62), accent, step(.6, nightRoomHash(floor(hit.x * 2.6) + floor(hit.z * 2.6) * 5.0 + seed))) : vec3(.36, .3, .26);
              else if (normal.z < -.5) {
                // Back wall: a door to one side, a skirting board, and a sign band over the counter.
                float doorX = mix(size.x - 1.25, .35, flip), door = step(doorX, hit.x) * step(hit.x, doorX + .9) * step(hit.y, 2.05);
                float band = step(1.55, hit.y) * step(hit.y, 1.95) * (1.0 - door) * step(.5, hit.x) * step(hit.x, size.x - .5);
                albedo = mix(mix(wall, accent, band * .85), wall * .5, door) * (1.0 - .3 * step(hit.y, .1));
              } else if (normal.y > .5) {
                // Floor tiles lead the eye inward.
                vec2 tile = abs(fract(vec2(hit.x, hit.z) / .6) - .5);
                albedo = mix(vec3(.5, .46, .4), wall * .6, .5) * (1.0 - .22 * step(.46, max(tile.x, tile.y)));
              } else if (normal.y < -.5) {
                // Ceiling, with the lamp's own panel.
                vec2 panel = abs(vec2(hit.x, hit.z) - lampAt);
                glow = step(panel.x, .55) * step(panel.y, .22);
                albedo = vec3(.9);
              }
            } else if (office > .5) {
              float top = step(.5, normal.y), front = step(normal.z, -.5);
              vec3 steel = vec3(.62, .65, .68), carton = vec3(.66, .5, .32);
              if (kind == 3.0 && curtain > .5) {
                // A roller blind in a tower, slats elsewhere.
                albedo = cbd > .5 ? vec3(.8, .82, .84) : vec3(.86, .84, .76);
                sheer = cbd > .5 ? .62 : .45 + .3 * step(.5, fract(hit.y * 14.0));
              } else if (kind > 0.0 && plan > 11.5) {
                if (plan < 12.5) {
                  if (kind < 2.5) {
                    // A file of desks, one every 80 cm: pale tops with an exercise book on some, and a blue chair behind each.
                    float along = (hit.z - reveal) / .8, seat = fract(along), who = nightRoomHash(floor(along) * 5.3 + kind * 3.0 + seed * 31.0);
                    vec3 book = who < .4 ? vec3(.94) : nightPalette(who * 3.7);
                    if (top > .5) albedo = mix(vec3(.84, .74, .54), book, step(.3, who) * step(abs(seat - .35), .14) * step(abs(hit.x - .5 * (kind == 1.0 ? aLow.x + aHigh.x : bLow.x + bHigh.x)), .1));
                    else albedo = seat > .62 ? mix(vec3(.16, .17, .2), vec3(.2, .36, .62), step(.42, hit.y)) : seat < .5 ? mix(vec3(.12), vec3(.7, .6, .44), step(.66, hit.y)) : vec3(.12);
                  } else albedo = normal.x > .5 ? vec3(.5, .58, .56) * (1.0 - .4 * max(step(.96, fract((hit.z - reveal) * 2.0)), step(abs(hit.y - 1.0), .015))) : vec3(.42, .48, .47);
                } else {
                  if (kind == 1.0) {
                    // The bench: a black top with a sink and glassware standing on it, white doors under.
                    vec2 g = vec2(hit.x * 4.0, hit.z * 4.0); float thing = nightRoomHash(floor(g.x) + floor(g.y) * 7.0 + seed * 31.0);
                    albedo = top > .5 ? mix(vec3(.12, .13, .14), mix(nightBottle(thing * 9.0), vec3(.8, .9, .92), .45), step(.72, thing) * step(length(fract(g) - .5), .3)) : vec3(.88, .88, .86) * (1.0 - .4 * max(step(.95, fract(hit.x * 1.6)), step(.86, hit.y)));
                  } else if (kind == 2.0) {
                    // Glass-fronted cabinets of bottles over cupboards.
                    float board = max(step(.9, fract(hit.y / .4)), step(.96, fract(hit.x * 1.1))), jar = nightRoomHash(floor(hit.x * 7.0) + floor(hit.y / .4) * 7.0 + seed * 31.0);
                    vec3 stock = mix(vec3(.8, .84, .84), nightBottle(jar * 9.0), step(.35, jar) * step(.25, fract(hit.x * 7.0)) * step(fract(hit.y / .4), .6));
                    albedo = front > .5 ? hit.y > .9 ? mix(stock, vec3(.9), board) : vec3(.88, .88, .86) * (1.0 - .4 * step(.96, fract(hit.x * 1.1))) : vec3(.8);
                  } else {
                    // The fume cupboard: a lit chamber behind a sash with a yellow lip.
                    float sash = nightRect(hit.xy, vec2(cLow.x + .08, 1.0), vec2(cHigh.x - .08, 1.85));
                    albedo = front > .5 ? mix(vec3(.86, .87, .86), vec3(.9, .74, .2), nightRect(hit.xy, vec2(cLow.x, .9), vec2(cHigh.x, 1.0))) : vec3(.78);
                    if (front > .5) { glow = .7 * sash; glowColor = vec3(.95, 1.0, .9) * (.6 + .4 * step(1.3, hit.y)); }
                  }
                }
              } else if (kind > 0.0 && plan > 9.5) {
                vec3 paint = nightRoomHash(seed * 41.3) < .4 ? vec3(.2, .44, .36) : nightRoomHash(seed * 41.3) < .75 ? vec3(.2, .36, .6) : vec3(.82, .8, .7);
                float stripe = step(.5, fract((hit.x + hit.y + hit.z) * 2.2));
                if (plan < 10.5) {
                  if (kind == 1.0) {
                    // A machine in its guard: a dark window, a lit control panel, a hazard stripe along the foot.
                    albedo = paint * mix(.75, 1.0, front);
                    if (front > .5) {
                      albedo = mix(albedo, vec3(.08, .1, .12), nightRect(hit.xy, vec2(aLow.x + .25, .85), vec2(aHigh.x - .75, 1.6)));
                      glow = nightRect(hit.xy, vec2(aHigh.x - .55, 1.15), vec2(aHigh.x - .2, 1.45)); glowColor = vec3(.5, 1.0, .7);
                      albedo = mix(albedo, vec3(.82, .82, .8), nightRect(hit.xy, vec2(aHigh.x - .62, .8), vec2(aHigh.x - .13, 1.55)) * (1.0 - glow));
                    }
                    if (hit.y < .14) albedo = mix(vec3(.1), vec3(.92, .76, .12), stripe);
                    // A beacon on top: amber, turning.
                    if (top > .5 && length(hit.xz - vec2(aHigh.x - .3, aLow.z + .3)) < .1) { glow = .5 + .5 * sin(nightClock * 5.0 * nightMotion + seed * 30.0); glowColor = vec3(1.3, .7, .1); }
                  } else if (kind == 2.0) {
                    // A steel bench with tools and parts lying on it, drawers under.
                    vec2 g = vec2(hit.x * 3.0, hit.z * 5.0); float part = nightRoomHash(floor(g.x) + floor(g.y) * 7.0 + seed * 31.0);
                    albedo = top > .5 ? mix(steel, part > .85 ? vec3(.8, .16, .12) : part > .7 ? vec3(.16, .3, .6) : vec3(.25), step(.55, part) * step(max(abs(fract(g.x) - .5), abs(fract(g.y) - .5)), .3)) : mix(vec3(.2, .3, .5), vec3(.14), max(step(.95, fract(hit.x * 1.3)), step(.9, fract(hit.y * 3.3))));
                  } else {
                    // Drums stood on a pallet.
                    float drum = fract((front > .5 || top > .5 ? hit.x : hit.z) / .45), which = nightRoomHash(floor((front > .5 ? hit.x : hit.z) / .45) + seed * 31.0);
                    albedo = hit.y < .14 ? vec3(.56, .42, .26) : (which < .5 ? vec3(.16, .34, .62) : which < .8 ? vec3(.7, .16, .12) : vec3(.2)) * (1.0 - .8 * abs(drum - .5)) * (1.0 - .3 * step(abs(fract(hit.y * 2.6) - .5), .06));
                    if (top > .5) albedo *= .7;
                  }
                } else {
                  if (kind == 1.0) {
                    // The conveyor runs the length of the floor, cartons riding it.
                    float ride = hit.x - nightClock * .35 * nightMotion + seed * 5.0, carton2 = nightRoomHash(floor(ride / .7) + seed * 31.0);
                    float on = step(.3, carton2) * step(abs(fract(ride / .7) - .5), .3) * step(abs(hit.z - .5 * (aLow.z + aHigh.z)), .22);
                    albedo = top > .5 ? mix(vec3(.13, .14, .15) * (1.0 - .3 * step(.5, fract(ride * 6.0))), carton * (.8 + .4 * carton2), on) : hit.y > .66 ? vec3(.92, .76, .12) : mix(vec3(.12), steel * .8, step(abs(fract(hit.x / 1.2) - .5), .06));
                  } else if (kind == 2.0) {
                    // Pallet racking: blue uprights, orange beams, cartons and crates.
                    float beam = step(.9, fract(hit.y / .55)), post = step(abs(fract(hit.x / 1.35) - .5), .47), box = nightRoomHash(floor(hit.x * 2.2) + floor(hit.y / .55) * 7.0 + seed * 31.0);
                    vec3 stock = mix(vec3(.14, .15, .16), box > .8 ? vec3(.2, .36, .6) : carton * (.75 + .4 * box), step(.2, box));
                    albedo = front > .5 ? mix(mix(stock, vec3(.9, .45, .1), beam), vec3(.16, .3, .56), 1.0 - post) : steel * .6;
                  } else {
                    // A control cabinet: a row of lamps and a handle.
                    albedo = vec3(.74, .76, .74) * mix(.8, 1.0, front);
                    if (front > .5) {
                      vec2 g = vec2((hit.x - cLow.x) / .15, (hit.y - 1.3) / .15); float lampOn = nightRoomHash(floor(g.x) + floor(g.y) * 3.0 + seed * 31.0);
                      if (hit.y > 1.3 && hit.y < 1.6 && length(fract(g) - .5) < .28) { glow = .9; glowColor = lampOn < .6 ? vec3(.3, 1.1, .4) : lampOn < .85 ? vec3(1.2, .8, .1) : vec3(1.2, .2, .15); }
                      albedo *= 1.0 - .5 * step(abs(hit.x - cLow.x - .08), .015) * step(.5, hit.y) * step(hit.y, 1.1);
                    }
                  }
                }
              } else if (kind > 0.0) {
                if (plan < 4.5) {
                  // Desk rows behind fabric partitions, and a wall of lockers with a row of binders.
                  vec3 fabric = mix(vec3(.46, .52, .6), accent, .3);
                  if (kind < 2.5) albedo = top > .5 ? vec3(.86, .85, .82) : fabric * (1.0 - .3 * step(.94, fract(hit.x / 1.4))) * mix(.55, 1.0, step(.74, hit.y));
                  else albedo = front > .5 ? mix(vec3(.88, .88, .86) * (1.0 - .3 * step(.94, fract(hit.x * 2.0))), mix(accent, vec3(.2, .22, .26), step(.5, nightRoomHash(floor(hit.x * 14.0) + seed))), step(1.45, hit.y) * step(hit.y, 1.8)) : vec3(.7);
                } else if (plan < 5.5) {
                  if (kind == 1.0) albedo = top > .5 ? mix(vec3(.5, .36, .24), vec3(.82, .8, .76), step(.5, nightRoomHash(seed * 41.3))) : vec3(.2, .2, .22);
                  else if (kind == 2.0) albedo = vec3(.3, .3, .33) * mix(.8, 1.2, top);
                  else albedo = hit.y < .45 ? vec3(.7, .68, .64) : vec3(.2, .42, .24) * (.7 + .5 * nightRoomHash(floor(hit.y * 9.0) + floor(hit.x * 9.0) * 3.0));
                } else if (plan < 6.5) {
                  // Filing cabinets by the drawer, a desk under paper, a copier.
                  if (kind == 1.0) albedo = front > .5 ? steel * (1.0 - .4 * max(step(.93, fract(hit.y / .47)), step(.95, fract(hit.x * 2.0)))) : steel * .8;
                  else if (kind == 2.0) albedo = top > .5 ? mix(vec3(.56, .42, .28), vec3(.94), step(.6, nightRoomHash(floor(hit.x * 3.0) + floor(hit.z * 3.0) * 5.0 + seed))) : vec3(.4, .32, .24);
                  else albedo = hit.y > .95 ? vec3(.22, .23, .25) : vec3(.84, .84, .82);
                } else {
                  // Racking stacked with cartons.
                  float board = step(.9, fract(hit.y / .52)), box = nightRoomHash(floor((kind == 1.0 ? hit.z : hit.x) * 2.4) + floor(hit.y / .52) * 7.0 + seed * 31.0);
                  vec3 stock = mix(vec3(.16, .17, .18), carton * (.75 + .4 * box), step(.2, box));
                  if (kind < 2.5) albedo = (kind == 1.0 ? step(.5, normal.x) : front) > .5 ? mix(stock, steel * .7, board) : steel * .6;
                  else albedo = top > .5 ? vec3(.56, .42, .28) : vec3(.36, .3, .26);
                }
              } else if (normal.z < -.5) {
                // Back wall: a screen in a tower, a noticeboard and a door elsewhere.
                if (plan < 4.5) {
                  glow = nightRect(hit.xy, vec2(.5 * size.x + .2, 1.1), vec2(.5 * size.x + 1.3, 1.75)); glowColor = vec3(.6, .8, 1.2);
                  albedo = mix(albedo, accent, step(2.1, hit.y) * step(hit.y, 2.25));
                } else if (plan < 5.5) {
                  glow = nightRect(hit.xy, vec2(.3 * size.x, 1.0), vec2(.7 * size.x, 1.95)); glowColor = mix(vec3(.7, .85, 1.2), vec3(1.1, 1.05, .95), step(.5, nightRoomHash(seed * 59.3)));
                  albedo = mix(albedo, vec3(.08), nightRect(hit.xy, vec2(.3 * size.x - .05, .95), vec2(.7 * size.x + .05, 2.0)));
                } else if (plan > 11.5 && plan < 12.5) {
                  // A classroom's display board of pupils' work, a clock, and the door.
                  vec2 note = floor(hit.xy * 4.0);
                  vec3 board = mix(vec3(.2, .4, .56), nightPalette(nightRoomHash(note.x * 3.0 + note.y * 11.0 + seed) * 3.0), step(.3, nightRoomHash(note.x + note.y * 5.0 + seed * 3.0)) * step(max(abs(fract(hit.x * 4.0) - .5), abs(fract(hit.y * 4.0) - .5)), .4));
                  albedo = mix(albedo, board, nightRect(hit.xy, vec2(.6, 1.0), vec2(size.x - 1.5, 2.0)));
                  albedo = mix(albedo, vec3(.3, .42, .5), nightRect(hit.xy, vec2(size.x - 1.2, 0.0), vec2(size.x - .3, 2.05)));
                  float clock = length(hit.xy - vec2(size.x - .75, 2.35));
                  albedo = mix(albedo, mix(vec3(.96), vec3(.1), step(.13, clock)), step(clock, .16));
                } else if (plan > 9.5 && plan < 11.5) {
                  // A works wall: a painted dado, a production board, an extinguisher.
                  albedo = mix(albedo, vec3(.34, .5, .44), step(hit.y, 1.15));
                  vec2 note = floor(vec2(hit.x * 5.0, hit.y * 6.0));
                  float mark = nightRoomHash(note.x * 3.0 + note.y * 11.0 + seed);
                  albedo = mix(albedo, mix(vec3(.95), mark < .5 ? vec3(.25, .65, .35) : mark < .8 ? vec3(.9, .7, .15) : vec3(.8, .2, .16), step(max(abs(fract(hit.x * 5.0) - .5), abs(fract(hit.y * 6.0) - .5)), .3)), nightRect(hit.xy, vec2(.4, 2.25), vec2(1.8, 2.92)));
                  albedo = mix(albedo, vec3(.8, .12, .1), nightRect(hit.xy, vec2(.12, .5), vec2(.26, 1.0)));
                } else if (plan < 6.5) {
                  vec2 note = floor(hit.xy * 6.0);
                  vec3 board = mix(vec3(.62, .46, .3), mix(vec3(.95, .9, .5), vec3(.9, .92, .95), step(.5, nightRoomHash(note.x + note.y * 5.0))), step(.6, nightRoomHash(note.x * 3.0 + note.y * 11.0 + seed)));
                  albedo = mix(albedo, board, nightRect(hit.xy, vec2(.55 * size.x, 1.15), vec2(size.x - .3, 1.9)));
                }
                albedo *= 1.0 - .3 * step(hit.y, .1);
              } else if (abs(normal.x) > .5) {
                // Side walls: a whiteboard in the meeting room, a door in a plain office.
                vec2 q = vec2(hit.z - reveal, hit.y);
                if (plan > 4.5 && plan < 5.5 && normal.x < 0.0) albedo = mix(albedo, mix(vec3(.5), vec3(.97), nightRect(q, vec2(1.25, 1.0), vec2(2.55, 1.9))), nightRect(q, vec2(1.2, .95), vec2(2.6, 1.95)));
                else if (plan > 11.5 && plan < 12.5 && normal.x > 0.0) {
                  // The board the desks face: green, chalked in lines, with a ledge under it.
                  float chalk = step(abs(fract(q.y * 5.0) - .5), .06) * step(.2, nightRoomHash(floor(q.x * 9.0) + floor(q.y * 5.0) * 7.0 + seed)) * step(q.x, .8 + 1.5 * nightRoomHash(floor(q.y * 5.0) + seed * 7.0));
                  albedo = mix(albedo, mix(vec3(.7, .6, .44), mix(vec3(.16, .34, .27), vec3(.9), chalk * nightRect(q, vec2(.8, 1.02), vec2(2.25, 1.85))), nightRect(q, vec2(.7, .95), vec2(2.35, 1.95))), nightRect(q, vec2(.65, .88), vec2(2.4, 2.0)));
                } else if (plan > 12.5 && normal.x > 0.0) {
                  // A chart of the elements.
                  vec2 g = vec2((q.x - .9) / .13, (q.y - 1.1) / .13); float gone = step(1.5, g.x) * step(g.x, 10.5) * step(3.5, g.y);
                  vec3 block = g.x < 2.0 ? vec3(.86, .45, .4) : g.x < 10.0 ? vec3(.9, .78, .4) : vec3(.45, .7, .6);
                  albedo = mix(albedo, mix(vec3(.96), block, step(max(abs(fract(g.x) - .5), abs(fract(g.y) - .5)), .4) * (1.0 - gone)), nightRect(q, vec2(.85, 1.05), vec2(3.29, 2.06)));
                } else if (plan > 9.5 && plan < 11.5) {
                  // The dado carries round, with a hazard-striped column foot.
                  albedo = mix(albedo, vec3(.34, .5, .44), step(q.y, 1.15));
                  if (normal.x < 0.0) albedo = mix(albedo, vec3(.5, .52, .54), nightRect(q, vec2(1.9, 0.0), vec2(2.9, 2.2)));
                }
                else if (cbd < .5 && normal.x < 0.0) albedo = mix(albedo, vec3(.5, .4, .3), nightRect(q, vec2(1.9, 0.0), vec2(2.75, 2.05)));
                albedo *= 1.0 - .3 * step(hit.y, .1);
              } else if (normal.y > .5) {
                // Carpet tiles in a tower, vinyl or bare concrete elsewhere.
                vec2 tile = abs(fract(vec2(hit.x, hit.z) / (cbd > .5 ? .5 : .3)) - .5);
                vec3 floorColor = cbd > .5 ? mix(vec3(.3, .34, .4), accent, .15) : plan < 6.5 ? vec3(.66, .62, .52) : plan > 12.5 ? vec3(.56, .6, .62) : plan > 11.5 ? vec3(.62, .66, .58) : vec3(.5, .5, .49);
                albedo = floorColor * (1.0 - .15 * step(.46, max(tile.x, tile.y)));
                if (plan > 9.5 && plan < 11.5) {
                  // A works floor: sealed green, a walkway marked off in yellow along the windows.
                  albedo = mix(vec3(.5, .5, .49), vec3(.3, .46, .4), step(reveal + .7, hit.z));
                  albedo = mix(albedo, vec3(.92, .76, .12), step(abs(hit.z - reveal - .65), .05));
                }
              } else {
                // Ceiling: a grid of panels with a light in every other one, or rows of tubes.
                albedo = vec3(.88);
                if (cbd > .5) {
                  vec2 g = vec2(hit.x, hit.z) / .6, at = abs(fract(g) - .5), which = floor(g);
                  albedo *= 1.0 - .18 * step(.46, max(at.x, at.y));
                  glow = step(max(at.x, at.y), .4) * step(.5, mod(which.x + which.y, 2.0)) * step(.5, mod(which.x, 2.0)); glowColor = vec3(1.1, 1.18, 1.3);
                } else {
                  glow = step(abs(fract(hit.z / 1.5) - .5), .045) * step(.4, hit.x) * step(hit.x, size.x - .4); glowColor = vec3(1.2, 1.25, 1.08);
                  if (plan > 11.5 && plan < 12.5) {
                    // A ceiling fan turns between the tubes.
                    vec2 q = vec2(hit.x - .5 * size.x, hit.z - reveal - .5 * depth); float r = length(q), turn = atan(q.y, q.x) + nightClock * 5.0 * nightMotion + seed * 9.0;
                    if (r < .66 && (r < .1 || r * abs(sin(1.5 * turn)) < .08)) { albedo = vec3(.3, .28, .26); glow = 0.0; }
                  }
                }
              }
            } else {
              // Timber is oak, walnut or white laminate, one per home.
              vec3 wood = mix(vec3(.62, .48, .32), vec3(.36, .26, .18), step(.5, nightRoomHash(seed * 41.3)));
              wood = mix(wood, vec3(.82, .8, .76), step(.75, nightRoomHash(seed * 43.7)));
              float top = step(.5, normal.y), front = step(normal.z, -.5);
              if (kind == 4.0) {
                // The hanging shade glows, brightest underneath.
                glow = 1.0; glowColor = mix(vec3(1.0, .82, .56), vec3(1.3, 1.2, 1.0), step(normal.y, -.5));
              } else if (kind == 3.0 && curtain > .5) {
                // Cloth with the room's light coming through it, darker in the folds.
                albedo = mix(vec3(.88, .84, .74), accent, .55 * step(.5, nightRoomHash(seed * 47.9)));
                sheer = .5 + .3 * abs(sin(hit.x * 21.0));
              } else if (kind > 0.0 && hotel > .5) {
                if (kind == 1.0 || (kind == 2.0 && plan < 8.5)) {
                  // A made bed, its head to the side wall: white linen, pillows, a runner in the hotel's colour across the foot.
                  float z0 = kind == 1.0 ? aLow.z : bLow.z, z1 = kind == 1.0 ? aHigh.z : bHigh.z, mid = abs(hit.z - .5 * (z0 + z1));
                  float pillow = step(.12, hit.x) * step(hit.x, .52) * step(.06, abs(mid - .5 * (plan < 8.5 ? 0.0 : .46))) * step(mid, plan < 8.5 ? .3 : .78);
                  if (top > .5) albedo = mix(mix(vec3(.9, .89, .86) * (1.0 - .12 * step(abs(hit.x - .75), .02)), accent * .85, step(1.42, hit.x) * step(hit.x, 1.78)), vec3(.97), pillow);
                  else albedo = hit.y < .22 ? wood * .5 : vec3(.86, .85, .82);
                } else if (kind == 2.0) albedo = mix(accent, vec3(.5, .46, .42), .45) * mix(.75, 1.0, top);
                else {
                  // The wardrobe, one door a mirror.
                  float seam = step(.96, fract((hit.x - cLow.x) * 2.0));
                  albedo = front > .5 ? mix(wood * (1.0 - .45 * seam), vec3(.62, .7, .74), step(hit.x, cLow.x + .48) * step(.1, hit.y)) : wood * .8;
                }
              } else if (kind > 0.0) {
                if (plan < .5) {
                  if (kind == 1.0) {
                    // Display cabinet: shelves of books and ornaments, some bays empty.
                    float board = max(step(.88, fract(hit.y * 2.5)), step(.94, fract(hit.x * 2.2))), cell = nightRoomHash(floor(hit.x * 2.2) + floor(hit.y * 2.5) * 7.0 + seed * 31.0);
                    vec3 things = mix(vec3(.2, .17, .15), mix(accent, vec3(.85, .8, .7), step(.65, cell)), step(.35, cell));
                    albedo = front > .5 ? mix(things, wood, board) : wood * .8;
                  } else if (kind == 2.0) albedo = accent * mix(.8, 1.0 - .25 * step(.93, fract(hit.z * 1.5)), top);
                  else albedo = wood * mix(.6, 1.0, top);
                } else if (plan < 1.5) {
                  if (kind == 1.0) albedo = wood * mix(.8, 1.0 - .45 * step(.95, fract(hit.x * 2.0)), front);
                  else if (kind == 2.0) {
                    // Bed: pillows at the head, the sheet turned back over the blanket.
                    float pillow = step(far - .6, hit.z), fold = step(far - .95, hit.z) * (1.0 - pillow);
                    albedo = top > .5 ? mix(mix(accent, vec3(.9, .88, .84), fold), vec3(.94), pillow) : mix(wood * .7, accent * .8, step(.25, hit.y));
                  } else albedo = wood * mix(.7, 1.0, top);
                } else if (plan < 2.5) {
                  float seam = step(.95, fract(hit.x * 2.0)) * front;
                  vec3 doors = mix(accent, vec3(.86, .85, .82), .45);
                  if (kind == 1.0) albedo = top > .5 ? vec3(.8, .79, .76) : doors * (1.0 - .4 * seam);
                  else if (kind == 2.0) albedo = doors * mix(.75, 1.0 - .4 * seam, front);
                  else albedo = vec3(.72, .74, .76) * (1.0 - .45 * front * step(abs(hit.y - 1.15), .02));
                } else {
                  if (kind == 1.0) {
                    // Bookshelf, side on to the window: spines of every colour between the boards.
                    float board = step(.88, fract(hit.y * 2.9)), spine = nightRoomHash(floor(hit.z * 11.0) + floor(hit.y * 2.9) * 13.0 + seed * 31.0);
                    vec3 book = mix(mix(vec3(.7, .28, .22), vec3(.24, .42, .56), step(.3, spine)), mix(vec3(.84, .74, .4), vec3(.3, .5, .34), step(.8, spine)), step(.55, spine));
                    albedo = normal.x > .5 ? mix(book * (.7 + .3 * fract(spine * 9.0)), wood, board) : wood * .8;
                  } else if (kind == 2.0) albedo = wood * mix(.6, 1.0, top);
                  else albedo = accent * mix(.8, 1.0, top);
                }
              } else if (normal.z < -.5) {
                // Back wall.
                if (plan < .5 || plan > 2.5) albedo = mix(wall, wood * .9, nightRect(hit.xy, vec2(.45, 0.0), vec2(1.3, 2.05)));
                if (hotel > .5) {
                  // The door to the corridor, a fire plan pinned on it, and a strip of light over the luggage shelf.
                  albedo = mix(albedo, vec3(.95), nightRect(hit.xy, vec2(.72, 1.4), vec2(1.02, 1.75)));
                  glow = .8 * nightRect(hit.xy, vec2(1.5, 2.12), vec2(size.x - 1.1, 2.17)); glowColor = vec3(1.25, 1.05, .75);
                } else if (plan > 2.5) {
                  // A screen left on over the desk.
                  glow = nightRect(hit.xy, vec2(.45 * size.x + .35, .88), vec2(.45 * size.x + 1.0, 1.28));
                  glowColor = vec3(.75, .9, 1.2);
                } else if (plan > 1.5) {
                  // Tiles between the counter and the wall cabinets.
                  vec2 tile = abs(fract(hit.xy / .15) - .5);
                  albedo = mix(albedo, vec3(.9, .9, .86) * (1.0 - .2 * step(.44, max(tile.x, tile.y))), nightRect(hit.xy, vec2(0.0, .9), vec2(size.x - .8, 1.5)));
                } else if (plan > .5) albedo = nightPicture(albedo, hit.xy, vec2(size.x - 1.3, 1.3), vec2(size.x - .4, 1.85), accent);
                albedo *= 1.0 - .3 * step(hit.y, .1);
              } else if (abs(normal.x) > .5) {
                // Side walls: the television faces the sofa, pictures and posters elsewhere.
                vec2 q = vec2(hit.z - reveal, hit.y);
                if (hotel > .5 && normal.x > 0.0) {
                  // A padded headboard the length of the beds, a reading lamp at each end of it, and a print above.
                  vec2 beds = plan < 8.5 ? vec2(.8, 3.2) : vec2(1.0, 3.0);
                  float pad = nightRect(q, vec2(beds.x, .3), vec2(beds.y, 1.25));
                  albedo = mix(albedo, mix(accent, vec3(.5, .44, .38), .6) * (1.0 - .25 * step(.94, fract((q.x - beds.x) / .6))), pad);
                  albedo = nightPicture(albedo, q, vec2(.5 * (beds.x + beds.y) - .55, 1.5), vec2(.5 * (beds.x + beds.y) + .55, 2.1), accent);
                  glow = max(nightRect(q, vec2(beds.x + .08, 1.3), vec2(beds.x + .26, 1.5)), nightRect(q, vec2(beds.y - .26, 1.3), vec2(beds.y - .08, 1.5))); glowColor = vec3(1.4, 1.1, .7);
                } else if (hotel > .5) {
                  // The television faces the beds over a long desk shelf.
                  glow = nightRect(q, vec2(1.35, 1.05), vec2(2.45, 1.7)) * step(.35, nightRoomHash(seed * 59.3));
                  glowColor = mix(vec3(.5, .72, 1.15), vec3(1.1, .85, .6), .5 + .5 * sin(nightClock * 1.3 * nightMotion + seed * 40.0));
                  albedo = mix(albedo, vec3(.08), nightRect(q, vec2(1.3, 1.0), vec2(2.5, 1.75)));
                  albedo = mix(albedo, wood * .8, nightRect(q, vec2(.9, .68), vec2(3.0, .76)));
                } else if (plan < .5 && normal.x < 0.0) {
                  glow = nightRect(q, vec2(1.1, .95), vec2(2.3, 1.65));
                  glowColor = mix(vec3(.5, .72, 1.15), vec3(1.1, .85, .6), .5 + .5 * sin(nightClock * 1.3 * nightMotion + seed * 40.0));
                  albedo = mix(albedo, vec3(.08), nightRect(q, vec2(1.05, .9), vec2(2.35, 1.7)));
                } else if (plan < .5) albedo = nightPicture(albedo, q, vec2(1.3, 1.35), vec2(2.3, 1.95), accent);
                else if (plan > 2.5 && normal.x < 0.0) albedo = nightPicture(albedo, q, vec2(1.9, 1.2), vec2(2.6, 2.05), mix(accent, vec3(.9, .86, .7), .4));
                else if (plan < 1.5 && normal.x > 0.0) albedo = mix(albedo, wood * .9, nightRect(q, vec2(.9, 0.0), vec2(1.75, 2.05)));
                albedo *= 1.0 - .3 * step(hit.y, .1);
              } else if (normal.y > .5) {
                // Floor: tiles in the kitchen, boards elsewhere, a rug in the living room.
                vec2 tile = abs(fract(vec2(hit.x, hit.z) / .3) - .5);
                vec3 boards = mix(vec3(.56, .42, .28), wood, .35) * (1.0 - .2 * step(.93, fract(hit.x / .2)));
                albedo = plan > 1.5 && plan < 2.5 ? vec3(.7, .68, .62) * (1.0 - .2 * step(.46, max(tile.x, tile.y))) : boards;
                if (plan < .5) albedo = mix(albedo, accent * .75, nightRect(hit.xz, vec2(1.1, reveal + .95), vec2(size.x - .7, far - 1.0)));
                if (hotel > .5) {
                  // Fitted carpet in a small repeating diamond.
                  vec2 c = abs(fract(vec2(hit.x, hit.z) / .4) - .5);
                  albedo = mix(mix(vec3(.4, .36, .34), accent, .3), mix(vec3(.62, .56, .46), accent, .2), step(c.x + c.y, .22));
                }
              } else {
                // Ceiling: a fan turning under its lamp in some living rooms and bedrooms, a round lamp or a panel elsewhere.
                vec2 q = vec2(hit.x, hit.z) - lampAt, panel = abs(q);
                float r = length(q);
                albedo = vec3(.9);
                if (shade > .5) albedo *= 1.0 - .5 * step(r, .09);
                else if (fan > .5) {
                  float turn = atan(q.y, q.x) + nightClock * 4.0 * nightMotion + seed * 9.0;
                  albedo = mix(albedo, wood * .6, step(r, .62) * step(r * abs(sin(2.0 * turn)), .085));
                  glow = step(r, .13);
                } else glow = lampKind < .5 ? step(r, .28) : step(panel.x, .55) * step(panel.y, .22);
              }
            }
            // One lamp under the ceiling: light falls off with distance and angle, and corners gather shade.
            vec3 lamp = vec3(lampAt.x, size.y - .12, lampAt.y), toLamp = lamp - hit;
            float range = length(toLamp), lit = max(dot(normal, toLamp / range), 0.0) / (1.0 + .16 * range * range);
            vec3 edge = min(hit - low, high - hit) + abs(normal) * 10.0;
            float corner = kind > 0.0 ? smoothstep(0.0, .35, hit.y) : smoothstep(0.0, .5, min(edge.x, min(edge.y, edge.z)));
            // An office is lit evenly from its whole ceiling, and so is a shop window, bar the jeweller's and the cafe.
            float even = shop > .5 ? shopKind == 2 || shopKind == 18 || shopKind == 28 ? .2 : shopKind == 5 || (shopKind > 10 && shopKind < 22) ? .4 : .6 : .45 * office;
            float lighting = sheer > 0.0 ? sheer : mix((.3 + 1.5 * lit) * mix(.55, 1.0, corner), mix(.85, .95, step(.5, shop)), even);
            return vec4(mix(albedo * lighting, glowColor, glow), 1.0);
          }
          // The view direction in a wall's own axes: along it (the way the facade coordinate grows), up, and inwards.
          vec3 nightInto(vec3 normal) {
            vec3 view = normalize(vNightWorld - cameraPosition), along = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
            return vec3(dot(view, along), view.y, -dot(view, normal));
          }` : ''}
          ${MOVING_LIGHTS_DECLARATIONS}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Flares, motors and bursts nearby (moving-lights); they still shine when a blackout puts the city out.
          if (movingCount > 0) { vec3 movingN = normalize(vNightNormal); ${movingLightsChunk('vNightWorld', 'movingN', 'diffuseColor.rgb')} }
          ${windows && !panes ? `
          // The ground storey of a building that stands on the ground, by day and night: a darker plinth, a
          // fascia under the first floor, and in most bays a glazed shopfront or a door. Drawn in the same
          // bays as the windows above, so a lit window at night sits over an opening by day.
          float nightFront = 0.0, nightFrontSeed = 0.0, nightFrontGlass = 1.0, nightFrontShop = 0.0; vec4 nightFrontRoom = vec4(0.0);
          float nightFrontWant = 0.0, nightFrontUse = 0.0; vec2 nightFrontP = vec2(0.0), nightFrontSize = vec2(1.0); vec4 nightFrontOpen = vec4(0.0); vec3 nightFrontInto = vec3(0.0, 0.0, 1.0);
          {
            float frontWall = 1.0 - smoothstep(.12, .3, abs(normalize(vNightNormal).y));
            vec2 frontUv = clamp((vNightWorld.xz - nightBounds.xy) * nightBounds.zw, 0.0, 1.0);
            float frontGround = texture2D(nightMap, frontUv).g * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_LOW.toFixed(1)};
            float frontBase = vNightSpan.x - ${GROUND_STOREY.toFixed(1)}, frontY = vNightWorld.y - max(frontBase, frontGround);
            float frontBay = vNightEdge.x / max(.01, vNightEdge.y) * max(1.0, floor(vNightEdge.y / 3.1));
            vec2 frontAa = max(vec2(fwidth(frontBay), fwidth(frontY)), vec2(1e-4));
            // Rain streaks: columns about half a metre wide run down from the roof edge, each its own length,
            // so a tall wall is not one clean sheet. Gone once a column is under a couple of pixels.
            float streakColumn = vNightEdge.x * ${(1 / STREAKS.width).toFixed(2)}, streakAa = max(fwidth(streakColumn), 1e-4);
            float streakSeed = fract(sin(dot(vec2(floor(streakColumn), floor(vNightSeed * 97.0) + 3.7), vec2(12.9898, 78.233))) * 43758.5453);
            float streakBelow = vNightSpan.y + 1.1 - vNightWorld.y, streakIn = fract(streakColumn);
            float streak = step(${(1 - STREAKS.share).toFixed(2)}, streakSeed) * (1.0 - smoothstep(0.0, ${STREAKS.shortest.toFixed(1)} + streakSeed * streakSeed * ${(STREAKS.longest - STREAKS.shortest).toFixed(1)}, streakBelow))
              * smoothstep(0.0, .3, streakIn) * (1.0 - smoothstep(.7, 1.0, streakIn)) * (1.0 - smoothstep(.25, .7, streakAa)) * frontWall * step(0.0, streakBelow);
            diffuseColor.rgb *= 1.0 - ${STREAKS.darken.toFixed(2)} * streak;
            if (frontWall > 0.0 && vNightEdge.y >= ${STOREFRONT.minFacade.toFixed(1)} && frontBase - frontGround < ${STOREFRONT.maxLift.toFixed(1)} && frontY < ${GROUND_STOREY.toFixed(1)}) {
              float frontNear = (1.0 - smoothstep(.3, .8, frontAa.x)) * frontWall;
              nightFrontSeed = fract(sin(dot(vec2(floor(frontBay), floor(vNightSeed * 97.0)), vec2(12.9898, 78.233))) * 43758.5453);
              // One bay in six is blank wall, about one in four a door, the rest shopfronts over a low riser.
              float frontDoor = step(nightFrontSeed, ${(STOREFRONT.blank + STOREFRONT.door).toFixed(2)});
              float frontHalf = mix(${(STOREFRONT.frontWidth / 2).toFixed(2)}, ${(STOREFRONT.doorWidth / 2).toFixed(2)}, frontDoor), frontSill = mix(${STOREFRONT.riser.toFixed(2)}, 0.0, frontDoor);
              nightFront = step(${STOREFRONT.blank.toFixed(2)}, nightFrontSeed) * frontNear
                * clamp((frontHalf - abs(fract(frontBay) - .5)) / frontAa.x + .5, 0.0, 1.0)
                * clamp((frontY - frontSill) / frontAa.y + .5, 0.0, 1.0) * clamp((${STOREFRONT.head.toFixed(2)} - frontY) / frontAa.y + .5, 0.0, 1.0);
              float frontPlinth = (1.0 - smoothstep(${STOREFRONT.plinth.toFixed(2)}, ${(STOREFRONT.plinth + .04).toFixed(2)}, frontY)) * frontNear;
              float frontFascia = smoothstep(${(STOREFRONT.head + .08).toFixed(2)}, ${(STOREFRONT.head + .12).toFixed(2)}, frontY) * frontNear;
              diffuseColor.rgb *= 1.0 - .2 * frontPlinth * (1.0 - nightFront) - .12 * frontFascia;
              // Behind the glass, a room; at a glancing angle the glass goes dark and reflective instead.
              vec3 frontInto = nightInto(normalize(vNightNormal));
              float frontBayWidth = vNightEdge.y / max(1.0, floor(vNightEdge.y / 3.1));
              // On a shopping street a share of the shopfronts are designed shop windows. Along a wall they
              // step through the shops by a stride that shares no factor with their number, so neighbours always differ.
              nightFrontShop = step(fract(nightFrontSeed * 7.93) + 1e-4, nightShops);
              // The room itself is drawn further down, in the one call the windows share: two calls made the
              // program twice the size, and it is the size that makes a district slow to load.
              nightFrontWant = step(1e-4, nightFront); nightFrontInto = frontInto;
              nightFrontP = vec2(fract(frontBay) * frontBayWidth, frontY); nightFrontSize = vec2(frontBayWidth, ${GROUND_STOREY.toFixed(1)});
              nightFrontOpen = vec4((.5 - frontHalf) * frontBayWidth, frontSill, (.5 + frontHalf) * frontBayWidth, ${STOREFRONT.head.toFixed(2)});
              nightFrontUse = (-nightFrontShop * float[${frontShops.length}](${frontShops.map(n => n.toFixed(1)).join(', ')})[int(mod(floor(frontBay) * ${shopStride(frontShops.length).toFixed(1)} + floor(vNightSeed * 97.0), ${frontShops.length.toFixed(1)}))]);
            }
          }` : ''}
          ${shops ? `
          // A glazed wall of shop units (a material marked nightShopWindow): bays about ${SHOP_WINDOWS.bay} m wide along
          // the wall, each a designed shop window from the material's own list, between a low rail and a head rail.
          float shopOn = 0.0, shopSeed = 0.0, shopDim = 1.0; vec4 shopRoom = vec4(0.0);
          {
            const float shopSet[${shops.length}] = float[${shops.length}](${shops.map(n => n.toFixed(1)).join(', ')});
            vec3 shopN = normalize(vNightNormal), shopView = normalize(vNightWorld - cameraPosition);
            float bays = max(1.0, floor(vNightEdge.y / ${SHOP_WINDOWS.bay.toFixed(1)} + .5)), bay = vNightEdge.x / max(.01, vNightEdge.y) * bays;
            float rise = vNightWorld.y - vNightSpan.x, head = min(vNightSpan.y - vNightSpan.x, ${SHOP_WINDOWS.head.toFixed(1)});
            vec2 aa = max(vec2(fwidth(bay), fwidth(rise)), vec2(1e-4));
            float wall = 1.0 - smoothstep(.12, .3, abs(shopN.y));
            if (wall > 0.0 && vNightEdge.y >= 2.0 && head >= 2.4 && rise < head) {
              float width = vNightEdge.y / bays;
              shopSeed = fract(sin(dot(vec2(floor(bay), floor(vNightSeed * 97.0)), vec2(12.9898, 78.233))) * 43758.5453);
              vec3 into = nightInto(shopN);
              shopRoom = nightRoom(vec2(fract(bay) * width, rise), vec2(width, head), vec4(.07, ${SHOP_WINDOWS.rail.toFixed(2)}, width - .07, head - .04), into, shopSeed,
                -shopSet[int(mod(floor(bay) + floor(vNightSeed * 97.0), ${shops.length.toFixed(1)}))]);
              // Far off the bays settle back to the wall's own glass.
              shopOn = wall * (1.0 - smoothstep(.3, .8, aa.x));
              shopDim = mix(.1, .85, pow(1.0 - clamp(into.z, 0.0, 1.0), 3.0)) * shopRoom.a;
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(shopRoom.rgb * ${INTERIOR.dayShare.toFixed(2)}, vec3(.045, .06, .075), shopDim), shopOn);
              totalEmissiveRadiance += shopRoom.rgb * (shopRoom.a * shopOn * (1.0 - shopDim) * (1.0 - nightLevel) * ${SHOP_WINDOWS.day.toFixed(2)});
              totalEmissiveRadiance += nightSkyBox(reflect(shopView, shopN)) * (nightFresnel(dot(-shopView, shopN)) * shopRoom.a * shopOn * ${REFLECTION.strength.toFixed(2)});
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, .16, shopOn);
              #endif
            }
          }` : ''}
          ${windows && !shops ? `
          // Windows, by day and night. Where the glass is, how far off, what room is behind it, and what it reflects.
          vec3 paneN = normalize(vNightNormal), paneRoom = vec3(1.0), paneView = normalize(vNightWorld - cameraPosition);
          float paneGlass = 0.0, paneOn = 0.0, paneH = vNightSeed, paneFar = 1.0, paneOffice = 0.0;
          {
            float wall = 1.0 - smoothstep(.12, .3, abs(paneN.y));
            // Storeys end as a mask, not a branch: on the GPU's own boundary pixels a branch on height left a dashed line.
            float storeys = step(vNightSpan.x, vNightWorld.y) * step(vNightWorld.y, vNightSpan.y);
            float reflects = nightFresnel(dot(-paneView, paneN));
            ${panes ? `
            // An authored pane is already the window: keep its own colour, frames and grilles, and add the reflection.
            paneGlass = wall * storeys; paneOn = nightWindowLit(paneH);
            if (paneGlass > 0.0) totalEmissiveRadiance += nightSkyBox(reflect(paneView, paneN)) * (reflects * paneGlass * ${REFLECTION.authored.toFixed(2)});
            ` : `
            // Fit complete columns and storeys inside each actual facade, including rotated/extruded sides.
            // Derivatives are taken here, outside any branch on position: inside one they are undefined on
            // its boundary pixels, which drew a dashed line along the top and bottom of lit bays.
            float height = max(.01, vNightSpan.y - vNightSpan.x);
            vec2 count = max(vec2(1.0), floor(vec2(vNightEdge.y / 3.1, height / 3.3)));
            vec2 cell = vec2(vNightEdge.x / max(.01, vNightEdge.y), (vNightWorld.y - vNightSpan.x) / height) * count;
            vec2 aa = max(fwidth(cell), vec2(1e-4));
            vec2 id = floor(cell), f = fract(cell);
            vec2 pane2 = clamp((vec2(.28, .24) - abs(f - .5)) / aa, 0.0, 1.0);
            paneH = fract(sin(dot(id + floor(vNightSeed * 97.0), vec2(12.9898, 78.233))) * 43758.5453);
            paneOn = nightWindowLit(paneH);
            // Far off, a grid finer than a pixel settles to its average instead of shimmering.
            float far = smoothstep(.35, .9, max(aa.x, aa.y));
            paneGlass = mix(pane2.x * pane2.y, .56 * .48, far) * wall * storeys;
            // A share of a district's buildings are offices from the first floor up; the rest are homes.
            paneOffice = step(fract(vNightSeed * 61.7), nightOffice.x);
            // Before that, a share are hotels, factories or schools; a marked wall is all one of them.
            float paneKind = fract(vNightSeed * 43.3), paneUse = ${rooms ? rooms.toFixed(1) : `paneKind < nightRooms.x ? 4.0 : paneKind < nightRooms.x + nightRooms.y ? 5.0 : paneKind < nightRooms.x + nightRooms.y + nightRooms.z ? 6.0 : mix(1.0, 3.0 - nightOffice.y, paneOffice)`};
            paneOffice = step(1.5, paneUse) * (1.0 - step(3.5, paneUse) * step(paneUse, 4.5));
            // Up close a pane shows the room behind it; far off it settles to plain glass or a plain glow.
            vec2 roomSize = vec2(vNightEdge.y / count.x, height / count.y);
            paneFar = max(far, smoothstep(.02, .12, max(aa.x, aa.y)));
            float glazed = 1.0;
            vec3 inside = vec3(.1, .12, .14);
            // Only where a pane shows, and not behind dark glass at night: the room is the costly part.
            // One call serves a pixel, whether it is on an upper window or on the shopfront under it.
            bool paneWants = paneFar < 1.0 && paneGlass > 0.0 && (paneOn > .5 || nightLevel < .97);
            if (paneWants) nightFront = 0.0;
            if (paneWants || nightFrontWant > .5) {
              vec4 room = nightRoom(paneWants ? f * roomSize : nightFrontP, paneWants ? roomSize : nightFrontSize,
                paneWants ? vec4(.22 * roomSize.x, .26 * roomSize.y, .78 * roomSize.x, .74 * roomSize.y) : nightFrontOpen,
                paneWants ? nightInto(paneN) : nightFrontInto, paneWants ? paneH : nightFrontSeed, paneWants ? paneUse : nightFrontUse);
              if (paneWants) {
                paneRoom = mix(room.rgb * mix(.15, ${INTERIOR.nightWindow.toFixed(2)}, room.a), vec3(1.0), paneFar);
                glazed = mix(room.a, 1.0, paneFar);
                inside = mix(room.rgb * mix(.8, ${REFLECTION.dayRoom.toFixed(2)}, room.a), inside, paneFar);
              } else {
                nightFrontRoom = room;
                // Glass only dims the room at a glancing angle; the frame is not glass at all.
                nightFrontGlass = mix(.1, .85, pow(1.0 - clamp(nightFrontInto.z, 0.0, 1.0), 3.0)) * nightFrontRoom.a;
                diffuseColor.rgb = mix(diffuseColor.rgb, mix(nightFrontRoom.rgb * ${INTERIOR.dayShare.toFixed(2)}, vec3(.045, .06, .075), nightFrontGlass), nightFront);
                // A shop window is lit inside by day too.
                totalEmissiveRadiance += nightFrontRoom.rgb * (nightFrontRoom.a * nightFrontShop * nightFront * (1.0 - nightFrontGlass) * (1.0 - nightLevel) * ${SHOP_WINDOWS.day.toFixed(2)});
                #ifdef STANDARD
                  roughnessFactor = mix(roughnessFactor, .16, nightFront);
                #endif
              }
            }
            // By day the glass is dark with a dim room behind it, and gives back the sky; the frame stays matt.
            if (paneGlass > 0.0) {
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(inside, vec3(.03, .04, .05), reflects * glazed), paneGlass);
              totalEmissiveRadiance += nightSkyBox(reflect(paneView, paneN)) * (reflects * glazed * paneGlass * ${REFLECTION.strength.toFixed(2)});
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, .1, paneGlass * glazed);
              #endif
            }
            // Shopfront glass gives back the street the same way.
            if (nightFront > 0.0) totalEmissiveRadiance += nightSkyBox(reflect(paneView, paneN)) * (reflects * nightFrontRoom.a * nightFront * ${REFLECTION.strength.toFixed(2)});
            `}
          }` : ''}
          if (nightLevel > .001) {
            vec3 nightN = normalize(vNightNormal);
            vec2 nightUv = (vNightWorld.xz - nightBounds.xy) * nightBounds.zw;
            if (nightUv.x > 0.0 && nightUv.x < 1.0 && nightUv.y > 0.0 && nightUv.y < 1.0) {
              vec4 nightTexel = texture2D(nightMap, nightUv);
              float above = vNightWorld.y - (nightTexel.g * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_LOW.toFixed(1)});
              float reach = smoothstep(-1.5, 0.0, above) * (1.0 - smoothstep(${(LAMP_HEIGHT - 2).toFixed(1)}, ${(LAMP_HEIGHT + 3).toFixed(1)}, above));
              float facing = nightN.y >= 0.0 ? mix(.5, 1.0, nightN.y) : .3 * (1.0 + nightN.y);
              totalEmissiveRadiance += diffuseColor.rgb * nightLampColor * nightTexel.r * nightTexel.r * reach * facing * nightPool;
            }
            ${shops ? `
            // The shop units stay lit after dark, bar a few.
            totalEmissiveRadiance += vec3(1.0, .96, .9) * shopRoom.rgb * mix(.12, 1.0, shopRoom.a) * (1.0 - .6 * shopDim) * shopOn * step(fract(shopSeed * 3.31), ${SHOP_WINDOWS.lit.toFixed(2)}) * ${SHOP_WINDOWS.night.toFixed(2)} * nightLevel;` : ''}
            ${windows && !shops ? `
            // Lit windows: lamplight in homes, a cooler white in offices. A far pane's glow varies from window
            // to window; a room seen close is exposed evenly, so its shading reads.
            vec3 tint = nightWindowTint(paneH, mix(mix(vec3(1.0, .74, .45), vec3(.82, .9, 1.0), step(.72, fract(paneH * 7.13))), vec3(.86, .93, 1.0), .8 * paneOffice));
            totalEmissiveRadiance += tint * paneRoom * mix(1.0, 1.1 + fract(paneH * 3.7), paneFar) * paneGlass * paneOn * nightLevel;${panes ? '' : `
            // A share of the shopfronts keep their lights on after dark.
            // Most shop windows on a shopping street stay lit, whiter and brighter than a corner shop.
            float frontLit = max(nightWindowLit(fract(nightFrontSeed * 3.31)), nightFrontShop * step(fract(nightFrontSeed * 3.31), ${SHOP_WINDOWS.lit.toFixed(2)}));
            totalEmissiveRadiance += mix(vec3(1.0, .86, .68), vec3(1.0, .96, .9), nightFrontShop) * nightFrontRoom.rgb * mix(.12, 1.0, nightFrontRoom.a) * (1.0 - .6 * nightFrontGlass) * nightFront * frontLit * mix(${INTERIOR.nightShopfront.toFixed(2)}, ${SHOP_WINDOWS.night.toFixed(2)}, nightFrontShop) * nightLevel;`}` : ''}
          }`);
      // Keep only the shops this program can draw: a shop wall's own list, or the district's shopfronts.
      if (windows) {
        const drawn = shops ?? (panes ? [] : frontUsed);
        // A marked wall is all one kind of room; a wall of shop units has no upper rooms at all.
        const kinds = shops ? [] : rooms ? [roomKinds[rooms - 4] as RoomKind] : roomKindsUsed;
        shader.fragmentShader = pruneRoomBranches(pruneShopBranches(shader.fragmentShader, drawn), kinds, drawn.length > 0);
      }
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|night${windows ? shops ? `-shops-v6-${shops.join('.')}` : panes ? '-panes-v6' : `-windows-v22-${frontUsed.join('.')}-${rooms || roomKindsUsed.join('.')}` : ''}`; };
    material.needsUpdate = true;
  }
  const box = new THREE.Box3(), geometryBox = new THREE.Box3(), instance = new THREE.Matrix4();
  function viewOf(source: THREE.BufferGeometry) {
    const view = new THREE.BufferGeometry();
    view.index = source.index;
    for (const name of Object.keys(source.attributes)) view.setAttribute(name, source.attributes[name]);
    for (const group of source.groups) view.addGroup(group.start, group.count, group.materialIndex);
    view.boundingBox = source.boundingBox; view.boundingSphere = source.boundingSphere;
    return view;
  }
  const roomKinds: readonly unknown[] = Object.keys(SPECIAL_LAYOUTS);
  function windowsFor(mesh: THREE.Mesh) {
    if (Array.isArray(mesh.material) || !lit(mesh.material)) return false;
    // Material metadata survives static batching and instanced-material separation.
    // A wall of shop units: its material lists the shops it holds (SHOP_LAYOUTS names), or is simply marked for all of them.
    const marked = mesh.material.userData.nightShopWindow as true | readonly (keyof typeof SHOP_LAYOUTS)[] | undefined;
    const names = Object.keys(SHOP_LAYOUTS), shops = marked ? (marked === true ? names : marked).map(name => names.indexOf(name) + 1).filter(n => n > 0) : null;
    const panes = mesh.material.userData.nightWindow === true || !!shops?.length;
    if (!panes && (!windowable(mesh.material) || !WINDOW_SHAPES.has(mesh.geometry.type))) return false;
    if (mesh instanceof THREE.SkinnedMesh) return false;
    for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) if (!panes && NO_WINDOWS.has(p.name)) return false;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometryBox.copy(geometry.boundingBox!);
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    const span = new Float32Array(instances * 2);
    let any = false;
    const up = new THREE.Vector3();
    for (let i = 0; i < instances; i++) {
      if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(i, instance); instance.premultiply(mesh.matrixWorld); }
      else instance.copy(mesh.matrixWorld);
      box.copy(geometryBox).applyMatrix4(instance);
      // A round tower only when it is a tower, not a tank.
      const round = geometry.type === 'CylinderGeometry' && (box.max.y - box.min.y) < 1.4 * (box.max.x - box.min.x);
      const ok = panes || !round && upright(instance) && buildingSized(box);
      if (ok && !any) {
        const axis = [0, 1, 2].find(axis => Math.abs(new THREE.Vector3().setFromMatrixColumn(instance, axis).normalize().y) > .995) ?? 1;
        up.setComponent(axis, Math.sign(new THREE.Vector3().setFromMatrixColumn(instance, axis).y));
      }
      span.set(ok ? panes ? [box.min.y - .01, box.max.y + .01] : [box.min.y + GROUND_STOREY, box.max.y - 1.1] : [1e6, -1e6], i * 2);
      any ||= ok;
    }
    if (!any) return false;
    const view = viewOf(geometry);
    const attribute = mesh instanceof THREE.InstancedMesh ? new THREE.InstancedBufferAttribute(span, 2)
      : new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2).map((_, k) => span[k % 2]), 2);
    view.setAttribute('nightSpan', attribute);
    const facade = nightFacadeAttributes(geometry, up);
    for (const [name, buffer] of Object.entries(facade)) view.setAttribute(name, buffer);
    let material = windowed.get(mesh.material);
    if (!material) { material = (mesh.material as Lit).clone(); windowed.set(mesh.material, material); patch(material, true, panes, shops?.length ? shops : null, roomKinds.indexOf(mesh.material.userData.nightRooms) + 1 ? 4 + roomKinds.indexOf(mesh.material.userData.nightRooms) : 0); }
    swaps.push({ mesh, geometry, material: mesh.material, attributes: [attribute, ...Object.values(facade)] });
    mesh.geometry = view; mesh.material = material;
    return true;
  }
  /** Patches what the scene holds now; later arrivals (vehicles, people) are picked up by the periodic rescan. */
  function scan(first: boolean) {
    const visit = (object: THREE.Object3D) => {
      if (object.userData.fpsEffect) return;
      if (object instanceof THREE.Mesh) {
        if (!(first && windowsFor(object))) for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (lit(m)) patch(m, false);
      }
      object.children.forEach(visit);
    };
    visit(scene);
  }
  scan(true); patch(poleMaterial, false);

  const headOff = new THREE.Color('#4d5256'), headOn = new THREE.Color('#fff1d0').multiplyScalar(4);
  const buffer = new THREE.Vector2();
  let level = -1, dark = 0, sinceScan = 0, disposed = false;
  return {
    root,
    lamps,
    scanMaterials: () => scan(false),
    /** How lit the city is this frame, 0–1. */
    get level() { return Math.max(0, level); },
    /**
     * How much lamp light falls where `position` is, 0–1, already scaled by
     * the night: for lighting what the world's materials do not cover, such as
     * the weapon in hand.
     */
    lightAt(position: THREE.Vector3) {
      if (level <= 0) return 0;
      const i = Math.floor((position.x - bounds.minX) / (bounds.maxX - bounds.minX) * baked.width), j = Math.floor((position.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * baked.height);
      if (i < 0 || j < 0 || i >= baked.width || j >= baked.height) return 0;
      const k = j * baked.width + i, above = position.y - baked.ground[k];
      const reach = Math.max(0, Math.min(1, (above + 1.5) / 1.5)) * (1 - Math.max(0, Math.min(1, (above - LAMP_HEIGHT + 2) / 5)));
      return Math.min(1, baked.light[k]) ** 2 * reach * level * level;
    },
    /**
     * Light from things on the move this frame (flares, motors, bursts), for
     * the slots that matter most from `camera`. Night only, blackout or not.
     */
    shine(sources: readonly LightSource[], camera: { x: number; y: number; z: number }) { if (!disposed) moving.set(sources, camera, dark); },
    /** `lighting` is the hour's light; `blackout` 0–1 puts the city out (the sky stays). */
    update(lighting: Pick<LightingState, 'elevation' | 'key'> & Partial<Pick<LightingState, 'keyColor'>>, blackout: number, dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, sky?: NightSky | null) {
      if (disposed) return;
      uniforms.nightClock.value = (uniforms.nightClock.value + (Number.isFinite(dt) ? Math.max(0, Math.min(dt, .25)) : 0)) % 6000;
      uniforms.nightMotion.value = reducedMotion?.matches ? 0 : 1;
      const elevation = lighting.elevation; dark = nightLevel(elevation);
      // Glass reflects the sky as it is drawn now, and glints where it faces the sun; the moon only faintly.
      // The district look's own sky when there is one (`atmosphere.look.uniforms`), else the flat background.
      if (sky) { uniforms.nightSky.value.copy(sky.lookHorizon.value); uniforms.nightZenith.value.copy(sky.lookZenith.value); uniforms.nightGround.value.copy(sky.lookGround.value); }
      else if (scene.background instanceof THREE.Color) {
        const { r, g, b } = scene.background;
        uniforms.nightSky.value.set(r, g, b); uniforms.nightZenith.value.set(r, g, b).multiplyScalar(.8); uniforms.nightGround.value.set(r, g, b).multiplyScalar(.6);
      }
      uniforms.nightSun.value.set(lighting.key.x, lighting.key.y, lighting.key.z).normalize();
      uniforms.nightSunColor.value.copy(sunColor.set(lighting.keyColor ?? '#fff4dc')).multiplyScalar(elevation > 0 ? Math.min(1, elevation / 8) * (1 - dark) : .04);
      const next = dark * (1 - Math.max(0, Math.min(1, blackout)));
      if (Math.abs(next - level) > 1e-3) {
        level = next; uniforms.nightLevel.value = level; uniforms.nightPool.value = level * level;
        headMaterial.color.copy(headOff).lerp(headOn, level);
        haloMaterial.uniforms.level.value = level ** 1.6;
      }
      halos.visible = level > .01;
      // Cloud and haze thin the sky out; the city's fog distance stands for how clear the air is.
      const clear = scene.fog instanceof THREE.Fog ? Math.max(0, Math.min(1, (scene.fog.far - 450) / 350)) : 1;
      const pixel = renderer.getPixelRatio();
      starMaterial.uniforms.level.value = Math.max(0, (dark - .85) / .15) * clear; starMaterial.uniforms.pixel.value = pixel;
      stars.visible = starMaterial.uniforms.level.value > .01;
      moonMaterial.uniforms.level.value = (elevation < -4 ? Math.min(1, (-4 - elevation) / 4) : 0) * (.25 + .75 * clear); moonMaterial.uniforms.pixel.value = pixel;
      moon.visible = moonMaterial.uniforms.level.value > .01;
      if (moon.visible) { moonPosition.setXYZ(0, lighting.key.x, lighting.key.y, lighting.key.z); moonPosition.needsUpdate = true; }
      // Pixels per metre at one metre's depth, so a halo keeps its size in the world.
      haloMaterial.uniforms.scale.value = renderer.getDrawingBufferSize(buffer).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      if (scene.fog instanceof THREE.Fog) { haloMaterial.uniforms.fogNear.value = scene.fog.near; haloMaterial.uniforms.fogFar.value = scene.fog.far; }
      sinceScan += dt;
      if (sinceScan > 1.5) { sinceScan = 0; scan(false); }
    },
    dispose() {
      if (disposed) return; disposed = true;
      scene.remove(root);
      for (const { mesh, geometry, material, attributes } of swaps) {
        const view = mesh.geometry;
        mesh.geometry = geometry; mesh.material = material;
        // Free only the facade attributes owned by this view, never the shared source buffers.
        for (const name of Object.keys(view.attributes)) if (!attributes.includes(view.attributes[name] as THREE.BufferAttribute)) view.deleteAttribute(name);
        view.index = null; view.dispose();
      }
      windowed.forEach(material => material.dispose());
      const restore = (m: THREE.Material) => {
        const original = patched.get(m); if (!original || !lit(m)) return;
        m.onBeforeCompile = original.compile; m.customProgramCacheKey = original.key; m.needsUpdate = true; patched.delete(m);
      };
      scene.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(restore); });
      [poles, arms, heads].forEach(m => m.dispose());
      [poleGeometry, armGeometry, headGeometry, haloGeometry, starGeometry, moonGeometry].forEach(g => g.dispose());
      [poleMaterial, headMaterial, haloMaterial, starMaterial, moonMaterial].forEach(m => m.dispose());
      map.dispose();
    },
  };
}
