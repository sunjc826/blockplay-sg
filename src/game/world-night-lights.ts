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
} as const satisfies Record<string, readonly [RoomBox, RoomBox, RoomBox]>;
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
export const shopWindow = (bay: number, building: number) => (Object.keys(SHOP_LAYOUTS) as (keyof typeof SHOP_LAYOUTS)[])[(bay * SHOP_WINDOWS.stride + building) % Object.keys(SHOP_LAYOUTS).length];
/** How often an office's third box gives way to a blind lowered part of the way down the glass. */
export const BLINDS = { openPlan: .45, meeting: .5, clerical: .7, stockroom: .4 } as const;
/**
 * What a building's upper floors hold: homes, or offices in `offices` of the district's buildings (0-1), and
 * whether those offices are the business district's (`cbd`) or the plainer kind found everywhere else.
 * `boutiques` is the share of its shopfronts that are designed shop windows (SHOP_LAYOUTS) rather than the
 * plain corner shop; none when left out.
 */
export type NightInteriors = { offices: number; cbd: boolean; boutiques?: number };
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
/** Every plan a window can show, in the order the shader numbers them: four homes, two business-district offices, two plain ones. */
const ROOM_PLANS: readonly { boxes: readonly [RoomBox, RoomBox, RoomBox]; hung: number }[] = [
  ...(Object.keys(HOME_LAYOUTS) as (keyof typeof HOME_LAYOUTS)[]).map(key => ({ boxes: HOME_LAYOUTS[key], hung: CURTAINS[key] })),
  ...(Object.keys(OFFICE_LAYOUTS) as (keyof typeof OFFICE_LAYOUTS)[]).map(key => ({ boxes: OFFICE_LAYOUTS[key], hung: BLINDS[key] })),
];
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
} as const satisfies Record<keyof typeof SHOP_LAYOUTS, readonly [string, string]>;
/** Capitals and brand marks three blocks wide and five tall, rows from the top: the signs are as blocky as the city. */
export const SHOP_FONT: Record<string, string> = {
  A: '010 101 111 101 101', B: '110 101 110 101 110', C: '011 100 100 100 011', D: '110 101 101 101 110', E: '111 100 110 100 111',
  F: '111 100 110 100 100', G: '011 100 101 101 011', H: '101 101 111 101 101', I: '111 010 010 010 111', J: '001 001 001 101 010',
  K: '101 101 110 101 101', L: '100 100 100 100 111', M: '101 111 111 101 101', N: '110 101 101 101 101', O: '010 101 101 101 010',
  P: '110 101 110 100 100', Q: '010 101 101 111 011', R: '110 101 110 101 101', S: '011 100 010 001 110', T: '111 010 010 010 010',
  U: '101 101 101 101 111', V: '101 101 101 101 010', W: '101 101 111 111 101', X: '101 101 010 101 101', Y: '101 101 010 010 010',
  Z: '111 001 010 100 111', ' ': '000 000 000 000 000',
  // Marks: a slash, a diamond, a bolt, a frame, a cup, a chevron, a heart, a block, a flower.
  0: '001 001 010 100 100', 1: '010 111 111 111 010', 2: '001 010 111 010 100', 3: '111 101 101 101 111', 4: '000 111 111 010 111',
  5: '100 010 001 010 100', 6: '101 111 111 111 010', 7: '111 111 111 111 111', 8: '101 010 111 010 101',
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
const SHOP_COUNT = Object.keys(SHOP_LAYOUTS).length;
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
  function patch(material: Lit, windows: boolean, panes = false, shops: readonly number[] | null = null) {
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
          uniform vec2 nightOffice; uniform vec3 nightSky, nightZenith, nightGround, nightSun, nightSunColor;
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
          float nightRect(vec2 q, vec2 low, vec2 high) { return step(low.x, q.x) * step(q.x, high.x) * step(low.y, q.y) * step(q.y, high.y); }
          vec3 nightPicture(vec3 under, vec2 q, vec2 low, vec2 high, vec3 art) {
            return mix(under, mix(vec3(.16, .13, .11), art * (.7 + .3 * step(.5, fract((q.x + q.y) * 2.3))), nightRect(q, low + .06, high - .06)), nightRect(q, low, high));
          }
${SHOP_SIGN_GLSL}
          // Bright stock: toys, trainers, book covers, flowers.
          vec3 nightPalette(float h) { h = fract(h) * 6.0; return h < 1.0 ? vec3(.86, .22, .2) : h < 2.0 ? vec3(.95, .72, .16) : h < 3.0 ? vec3(.2, .5, .8) : h < 4.0 ? vec3(.22, .62, .4) : h < 5.0 ? vec3(.9, .45, .62) : vec3(.93, .92, .88); }
          // What clothes and bags come in: black, white, camel, denim, red, olive.
          vec3 nightGarment(float h) { h = fract(h); return h < .25 ? vec3(.12) : h < .45 ? vec3(.9, .89, .86) : h < .6 ? vec3(.76, .64, .46) : h < .75 ? vec3(.25, .35, .52) : h < .88 ? vec3(.7, .2, .22) : vec3(.4, .45, .28); }
          // Bottles and jars: black, blush, gold, teal, red.
          vec3 nightBottle(float h) { h = fract(h); return h < .22 ? vec3(.1) : h < .5 ? vec3(.93, .62, .68) : h < .7 ? vec3(.86, .7, .4) : h < .85 ? vec3(.45, .75, .72) : vec3(.75, .15, .25); }
          vec4 nightRoom(vec2 p, vec2 size, vec4 open, vec3 d, float seed, float use) {
            // use: 0 a plain shop, 1 a home, 2 an office in the business district, 3 an office anywhere else;
            // -1 and below a designed shop window, numbered in SHOP_LAYOUTS order.
            float home = step(.5, use), office = step(1.5, use), cbd = office * step(use, 2.5), shop = max(-use, 0.0);
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
              if (cbd < .5 && abs(p.x - .5 * (open.x + open.z)) < .03) return vec4(.4, .42, .44, 0.0);
            }
            // The wall is a hand deep: a ray that leaves the opening inside that thickness has met the frame.
            vec3 from = vec3(p, 0.0) + d * (reveal / d.z);
            if (from.x < open.x || from.x > open.z || from.y < open.y || from.y > open.w) {
              float side = from.y > open.w ? .5 : from.y < open.y ? 1.0 : .72;
              return vec4(vec3(.5, .52, .54) * side, 0.0);
            }
            // The shop's name in white vinyl low on the glass.
            if (shop > .5 && nightSign(brand, p, vec2(.5 * (open.x + open.z), open.y + ${SHOP_WINDOWS.decal[0].toFixed(2)}), ${SHOP_WINDOWS.decal[1].toFixed(2)}, mirrored) > .5) return vec4(vec3(.97), 1.0);
            if (shop > .5 && doorway < .5 && nightRoomHash(seed * 71.3) < ${SHOP_WINDOWS.strip.toFixed(2)}) {
              // A promotion strip of vinyl across the top of the glass, with blocks for its lettering.
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
            float plan = office > .5 ? 4.0 + (use - 2.0) * 2.0 + floor(nightRoomHash(seed * 23.1) * 1.999) : floor(nightRoomHash(seed * 23.1) * 3.999);
            // Furniture, each a real box in the room so it slides against the walls as the viewer moves.
            vec3 aLow, aHigh, bLow, bHigh, cLow, cHigh;
            // The lamp sits nearer the glass in a home, where a window over the street is looked up into and
            // shows mostly ceiling. Under it: a fan in some living rooms and bedrooms, a hanging shade, or a flush lamp.
            vec2 lampAt = vec2(size.x * .5, reveal + depth * mix(.45, .33, home));
            float lampKind = nightRoomHash(seed * 53.9), fan = home * (1.0 - office) * step(plan, 1.5) * step(lampKind, .6), shade = home * (1.0 - office) * (1.0 - fan) * step(.3, lampKind);
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
              float cutZ = reveal + (shopKind == 10 ? .75 : shopKind == 9 ? 1.2 : shopKind == 5 ? .68 : .62), tc = (cutZ - from.z) / d.z;
              vec2 q = from.xy + d.xy * tc;
              if (tc < t) {
                if (shopKind == 1 || shopKind == 6) {
                  // Mannequins on the window plinth: dressed in the fashion shop, in kit in the sports shop.
                  float x0 = shopKind == 1 ? aLow.x : cLow.x, x1 = shopKind == 1 ? aHigh.x : cHigh.x, base = shopKind == 1 ? aHigh.y : cHigh.y;
                  float n = max(1.0, floor((x1 - x0) / .95)), w = (x1 - x0) / n, id = floor((q.x - x0) / w);
                  float x = (fract((q.x - x0) / w) - .5) * w, v = q.y - base, h = nightRoomHash(id * 7.3 + seed * 61.0);
                  if (id >= 0.0 && id < n && v > 0.0 && h > .1) {
                    float dress = shopKind == 1 ? step(.55, h) : 0.0;
                    float head = step(length(vec2(x, (v - 1.62) * .85)), .09), neck = step(abs(x), .035) * step(1.45, v) * step(v, 1.56);
                    float torsoW = mix(.14, .21, smoothstep(.95, 1.38, v)) * (1.0 - .45 * smoothstep(1.4, 1.5, v));
                    float torso = step(abs(x), torsoW) * step(.9, v) * step(v, 1.48), legs = step(abs(abs(x) - .08), .06) * step(v, .9);
                    float skirt = dress * step(abs(x), mix(.26, .15, clamp((v - .4) / .5, 0.0, 1.0))) * step(.4, v) * step(v, .9);
                    float arms = step(abs(abs(x) - torsoW - .04), .035) * step(.75, v) * step(v, 1.4);
                    if (max(max(head, neck), max(max(torso, legs), max(skirt, arms))) > .5) {
                      vec3 form = nightRoomHash(seed * 67.0) < .5 ? vec3(.9, .89, .86) : vec3(.13);
                      vec3 upper = shopKind == 1 ? nightGarment(h * 9.7) : nightPalette(h * 5.3), lower = shopKind == 1 ? nightGarment(h * 3.3 + .4) : vec3(.14);
                      cutColor = form;
                      if (legs > .5) cutColor = dress > .5 ? form : lower;
                      if (v < .07) cutColor = shopKind == 1 ? vec3(.1) : nightPalette(h * 11.0);
                      if (torso > .5 || skirt > .5 || (arms > .5 && v > mix(1.22, .8, step(.5, fract(h * 17.0))))) cutColor = upper;
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
                } else if (shopKind == 9) {
                  // Bouquets standing out of the back row of buckets.
                  float id = floor((q.x - bLow.x) / .32), x = (fract((q.x - bLow.x) / .32) - .5) * .32, h = nightRoomHash(id * 7.3 + seed * 61.0), v = q.y - bHigh.y;
                  float bloomAt = .34 + .14 * h, r = length(vec2(x, v - bloomAt));
                  if (q.x > bLow.x && q.x < bHigh.x && v > 0.0 && (r < .15 || (v < bloomAt && abs(x) < .04 + .09 * v / bloomAt))) {
                    // Five blooms in a ruff of leaves, over a sheaf of stems.
                    vec2 b = vec2(x, v - bloomAt);
                    float bloom = min(min(length(b), length(b - vec2(.08, .05))), min(length(b + vec2(.08, -.05)), min(length(b - vec2(.04, -.08)), length(b + vec2(.05, .08)))));
                    vec3 petal = mix(nightPalette(h * 4.7), vec3(.95, .5, .2), step(.8, fract(h * 5.0)));
                    cutColor = bloom < .055 ? mix(vec3(.95, .8, .3), petal, step(.018, bloom)) : vec3(.2, .44, .22) * (r < .15 ? .85 : .8 + .4 * step(.5, fract(x * 30.0)));
                    t = tc; normal = vec3(0.0, 0.0, -1.0); kind = 5.0;
                  }
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
              } else if (shopKind == 7) {
                // Beauty: white and blush, an island of jars lit from under, walls of bottles on lit shelves.
                wall = mix(vec3(.96, .94, .93), vec3(.95, .82, .84), step(.5, pick)); albedo = wall;
                floorColor = vec3(.9, .89, .88); tileSize = .8; spots = 0.0;
                if (kind == 1.0) {
                  vec2 g = hit.xz * 9.0;
                  albedo = top > .5 ? mix(vec3(.97), nightBottle(nightRoomHash(dot(floor(g), vec2(1.0, 7.0)) + seed)), step(length(fract(g) - .5), .28)) : vec3(.95);
                  glow = (1.0 - top) * step(hit.y, .07) * .8; glowColor = vec3(1.2, .8, .88);
                } else if (kind > 1.5) {
                  vec2 g = vec2(q.x * 9.0, hit.y / .4), c = fract(g);
                  float h = nightRoomHash(floor(g.x) + floor(g.y) * 7.0 + seed * 3.0 + kind);
                  float bottle = step(.2, c.x) * step(c.x, .8) * step(c.y, .25 + .5 * h) * step(.2, h);
                  if ((kind == 2.0 ? step(.5, normal.x) : front) > .5) {
                    albedo = mix(mix(vec3(.98, .95, .93), nightBottle(h * 7.3), bottle), vec3(1.0), step(.92, c.y));
                    glow = .55 * (1.0 - bottle); glowColor = vec3(1.25, 1.15, 1.1);
                  } else albedo = vec3(.93);
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
              } else {
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
              }
              // The shop's name high on the back wall: lit letters on a dark wall, dark ones on a pale wall.
              if (shell * front > .5) {
                float name = nightSign(brand, hit.xy, vec2(.5 * size.x, ${SHOP_WINDOWS.sign[0].toFixed(2)}), ${SHOP_WINDOWS.sign[1].toFixed(2)}, mirrored);
                if (name > .5 && dot(wall, vec3(.333)) > .6) { albedo = shopKind == 7 ? vec3(.75, .4, .48) : vec3(.12); glow = 0.0; }
                else if (name > .5) { glow = 1.0; glowColor = shopKind == 2 ? vec3(1.3, 1.1, .7) : vec3(1.3, 1.28, 1.2); }
              }
              if (kind > 4.5) { albedo = cutColor; glow = cutGlow; glowColor = vec3(1.3, 1.0, .62); }
              else if (shell > .5 && top > .5) {
                // Floor: stone, boards or carpet by the shop; a chequerboard in the cafe, coloured tiles in the toy shop, a rug among the books.
                vec2 tile = abs(fract(hit.xz / tileSize) - .5), which = floor(hit.xz / tileSize);
                albedo = floorColor * (1.0 - .16 * step(.47, max(tile.x, tile.y))); glow = 0.0;
                if (shopKind == 5) albedo = mix(vec3(.14), vec3(.88), mod(which.x + which.y, 2.0));
                if (shopKind == 8) albedo = mix(nightPalette(nightRoomHash(which.x + which.y * 7.0 + seed)), vec3(.82), .5);
                if (shopKind == 4) albedo = mix(albedo, accent * .7, nightRect(hit.xz, vec2(.9, reveal + 1.7), vec2(size.x - .9, far - .8)));
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
                else if (cbd < .5 && normal.x < 0.0) albedo = mix(albedo, vec3(.5, .4, .3), nightRect(q, vec2(1.9, 0.0), vec2(2.75, 2.05)));
                albedo *= 1.0 - .3 * step(hit.y, .1);
              } else if (normal.y > .5) {
                // Carpet tiles in a tower, vinyl or bare concrete elsewhere.
                vec2 tile = abs(fract(vec2(hit.x, hit.z) / (cbd > .5 ? .5 : .3)) - .5);
                vec3 floorColor = cbd > .5 ? mix(vec3(.3, .34, .4), accent, .15) : plan < 6.5 ? vec3(.66, .62, .52) : vec3(.5, .5, .49);
                albedo = floorColor * (1.0 - .15 * step(.46, max(tile.x, tile.y)));
              } else {
                // Ceiling: a grid of panels with a light in every other one, or rows of tubes.
                albedo = vec3(.88);
                if (cbd > .5) {
                  vec2 g = vec2(hit.x, hit.z) / .6, at = abs(fract(g) - .5), which = floor(g);
                  albedo *= 1.0 - .18 * step(.46, max(at.x, at.y));
                  glow = step(max(at.x, at.y), .4) * step(.5, mod(which.x + which.y, 2.0)) * step(.5, mod(which.x, 2.0)); glowColor = vec3(1.1, 1.18, 1.3);
                } else {
                  glow = step(abs(fract(hit.z / 1.5) - .5), .045) * step(.4, hit.x) * step(hit.x, size.x - .4); glowColor = vec3(1.2, 1.25, 1.08);
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
                if (plan > 2.5) {
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
                if (plan < .5 && normal.x < 0.0) {
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
            float even = shop > .5 ? shopKind == 2 ? .2 : shopKind == 5 ? .35 : .6 : .45 * office;
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
              nightFrontRoom = nightRoom(vec2(fract(frontBay) * frontBayWidth, frontY), vec2(frontBayWidth, ${GROUND_STOREY.toFixed(1)}),
                vec4((.5 - frontHalf) * frontBayWidth, frontSill, (.5 + frontHalf) * frontBayWidth, ${STOREFRONT.head.toFixed(2)}), frontInto, nightFrontSeed,
                -nightFrontShop * (1.0 + mod(floor(frontBay) * ${SHOP_WINDOWS.stride.toFixed(1)} + floor(vNightSeed * 97.0), ${SHOP_COUNT.toFixed(1)})));
              // Glass only dims the room at a glancing angle; the frame is not glass at all.
              nightFrontGlass = mix(.1, .85, pow(1.0 - clamp(frontInto.z, 0.0, 1.0), 3.0)) * nightFrontRoom.a;
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(nightFrontRoom.rgb * ${INTERIOR.dayShare.toFixed(2)}, vec3(.045, .06, .075), nightFrontGlass), nightFront);
              // A shop window is lit inside by day too.
              totalEmissiveRadiance += nightFrontRoom.rgb * (nightFrontRoom.a * nightFrontShop * nightFront * (1.0 - nightFrontGlass) * (1.0 - nightLevel) * ${SHOP_WINDOWS.day.toFixed(2)});
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, .16, nightFront);
              #endif
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
            // Up close a pane shows the room behind it; far off it settles to plain glass or a plain glow.
            vec2 roomSize = vec2(vNightEdge.y / count.x, height / count.y);
            paneFar = max(far, smoothstep(.02, .12, max(aa.x, aa.y)));
            float glazed = 1.0;
            vec3 inside = vec3(.1, .12, .14);
            // Only where a pane shows, and not behind dark glass at night: the room is the costly part.
            if (paneFar < 1.0 && paneGlass > 0.0 && (paneOn > .5 || nightLevel < .97)) {
              vec4 room = nightRoom(f * roomSize, roomSize, vec4(.22 * roomSize.x, .26 * roomSize.y, .78 * roomSize.x, .74 * roomSize.y), nightInto(paneN), paneH, mix(1.0, 3.0 - nightOffice.y, paneOffice));
              paneRoom = mix(room.rgb * mix(.15, ${INTERIOR.nightWindow.toFixed(2)}, room.a), vec3(1.0), paneFar);
              glazed = mix(room.a, 1.0, paneFar);
              inside = mix(room.rgb * mix(.8, ${REFLECTION.dayRoom.toFixed(2)}, room.a), inside, paneFar);
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
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|night${windows ? shops ? `-shops-v2-${shops.join('.')}` : panes ? '-panes-v6' : '-windows-v16' : ''}`; };
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
    if (!material) { material = (mesh.material as Lit).clone(); windowed.set(mesh.material, material); patch(material, true, panes, shops?.length ? shops : null); }
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
