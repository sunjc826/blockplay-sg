/** Marina's authored layout is compacted consistently across rendering and gameplay.
 * Keep this module data-only: the server also consumes stamps and sector data.
 * Player speed, weapons, vehicle dimensions and new tactical cover stay in game metres.
 */
export const MARINA_LAYOUT_SCALE = .6;
export function marinaPoint<T extends { x: number; z: number }>(p: T): T {
  return { ...p, x: p.x * MARINA_LAYOUT_SCALE, z: p.z * MARINA_LAYOUT_SCALE };
}
export function marinaBounds<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(b: T): T {
  return { ...b, minX:b.minX*MARINA_LAYOUT_SCALE, maxX:b.maxX*MARINA_LAYOUT_SCALE,
    minZ:b.minZ*MARINA_LAYOUT_SCALE, maxZ:b.maxZ*MARINA_LAYOUT_SCALE };
}
