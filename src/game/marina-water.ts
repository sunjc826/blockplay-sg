import { marinaBounds } from './marina-layout';
import type { Obstacle } from './region-collision';

/** Gameplay metres, shared by rendering, authority and boat movement. */
export const MARINA_WATER = { ...marinaBounds({ minX: -80, maxX: 80, minZ: -90, maxZ: 50 }), surface: -.24, bed: -1.8 };
export const DRAGON_BOATS = ['dragon-boat-red', 'dragon-boat-gold'] as const;
export type DragonBoatKind = typeof DRAGON_BOATS[number];
export const isDragonBoat = (kind: string): kind is DragonBoatKind => (DRAGON_BOATS as readonly string[]).includes(kind);
export const DRAGON_BOAT_SPAWNS = {
  'dragon-boat-red': { x: -17, z: 24, yaw: 0 },
  'dragon-boat-gold': { x: 17, z: -48, yaw: Math.PI },
};
export const MARINA_CAMP_DECKS = [
  { id: 'camp', minX: -12, maxX: 12, minZ: -22, maxZ: -2 },
  { id: 'south-landing', minX: -3, maxX: 3, minZ: -2, maxZ: 4 },
  { id: 'north-landing', minX: -3, maxX: 3, minZ: -28, maxZ: -22 },
  { id: 'east-landing', minX: 12, maxX: 18, minZ: -15, maxZ: -9 },
  { id: 'south-jetty', minX: -22, maxX: -19, minZ: 18, maxZ: 31 },
  { id: 'north-jetty', minX: 19, maxX: 22, minZ: -55, maxZ: -42 },
] as const;
export const MARINA_CAMP_COVER = [
  { minX: -7, maxX: -3, minZ: -17, maxZ: -15, maxY: 1.15 },
  { minX: 3, maxX: 7, minZ: -9, maxZ: -7, maxY: 1.15 },
  { minX: -7, maxX: -5, minZ: -9, maxZ: -6, maxY: 1.35 },
  { minX: 5, maxX: 8, minZ: -19, maxZ: -17, maxY: 1.35 },
] as const;
export const MARINA_CAMP_TENT = { minX: -3, maxX: 3, minZ: -15, maxZ: -10, minY: 2.1, maxY: 2.35 };
const overlaps = (a: Obstacle, b: Obstacle) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
/** Remove walkable deck rectangles from the water blocker, preserving every remaining patch. */
export function marinaWaterObstacles(): Obstacle[] {
  let pieces: Obstacle[] = [{ ...MARINA_WATER, maxY: 2, water: true }];
  for (const cut of MARINA_CAMP_DECKS) pieces = pieces.flatMap(p => {
    if (!overlaps(p, cut)) return [p];
    const x0 = Math.max(p.minX, cut.minX), x1 = Math.min(p.maxX, cut.maxX), z0 = Math.max(p.minZ, cut.minZ), z1 = Math.min(p.maxZ, cut.maxZ);
    return [ { ...p, maxX: x0 }, { ...p, minX: x1 }, { ...p, minX: x0, maxX: x1, maxZ: z0 }, { ...p, minX: x0, maxX: x1, minZ: z1 } ].filter(r => r.maxX > r.minX && r.maxZ > r.minZ);
  });
  return pieces;
}
/** Exact oriented hull corners, rather than an overlarge box at diagonal headings. */
export function canPaddle(x: number, z: number, yaw: number, otherHulls: readonly Obstacle[] = []) {
  const c = Math.cos(yaw), s = Math.sin(yaw), corners = [-1, 1].flatMap(side => [-1, 1].map(end => ({ x: x + c * side * .95 + s * end * 4.5, z: z - s * side * .95 + c * end * 4.5 })));
  if (corners.some(p => p.x < MARINA_WATER.minX + .3 || p.x > MARINA_WATER.maxX - .3 || p.z < MARINA_WATER.minZ + .3 || p.z > MARINA_WATER.maxZ - .3)) return false;
  // Separating axes for a rotated boat against each axis-aligned deck/hull.
  return ![...MARINA_CAMP_DECKS, ...otherHulls].some(o => {
    const dx = (o.minX + o.maxX) / 2 - x, dz = (o.minZ + o.maxZ) / 2 - z, hx = (o.maxX - o.minX) / 2, hz = (o.maxZ - o.minZ) / 2;
    return Math.abs(dx) < Math.abs(c) * .95 + Math.abs(s) * 4.5 + hx && Math.abs(dz) < Math.abs(s) * .95 + Math.abs(c) * 4.5 + hz &&
      Math.abs(c * dx - s * dz) < .95 + Math.abs(c) * hx + Math.abs(s) * hz && Math.abs(s * dx + c * dz) < 4.5 + Math.abs(s) * hx + Math.abs(c) * hz;
  });
}
