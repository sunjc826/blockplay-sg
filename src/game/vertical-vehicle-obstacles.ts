import type { Obstacle } from './region-collision';
import type { WalkSurface, TraversalObstacle } from './vertical-routes';

/** Cars stay at street height. Keep these projections out of infantry collision:
 * a stair is usable on foot but cannot be driven through as if it were empty.
 * Upper galleries leave their ground-level underpasses open.
 */
export function verticalVehicleObstacles(world: { surfaces: readonly WalkSurface[]; traversalObstacles: readonly TraversalObstacle[] }, clearance = 2.7): Obstacle[] {
  const result: Obstacle[] = world.traversalObstacles.filter(o => o.maxY > .15 && o.minY < clearance).map(o => ({ ...o }));
  const surfaceClearance = clearance + .26; // Account for the authored floor slab thickness.
  for (const surface of world.surfaces) {
    const minHeight = Math.min(surface.startHeight, surface.endHeight), maxHeight = Math.max(surface.startHeight, surface.endHeight);
    if (maxHeight <= .15 || !surface.solidBelow && minHeight >= surfaceClearance) continue;
    const box: Obstacle = { minX: surface.minX, maxX: surface.maxX, minZ: surface.minZ, maxZ: surface.maxZ, maxY: maxHeight };
    if (!surface.solidBelow && maxHeight > surfaceClearance && minHeight < surfaceClearance) {
      // Clip the low part of an open ramp; cars can pass below its high end.
      const t = (surfaceClearance - surface.startHeight) / (surface.endHeight - surface.startHeight);
      if (surface.axis === 'x') {
        const cut = surface.minX + (surface.maxX - surface.minX) * t;
        if (surface.endHeight > surface.startHeight) box.maxX = cut; else box.minX = cut;
      } else {
        const cut = surface.minZ + (surface.maxZ - surface.minZ) * t;
        if (surface.endHeight > surface.startHeight) box.maxZ = cut; else box.minZ = cut;
      }
    }
    result.push(box);
  }
  return result;
}
