import type { RegionBounds, Obstacle } from './region-collision';
import type { WalkSurface, TraversalObstacle } from './vertical-routes';

/** Cars stay at street height. Keep these projections out of infantry collision:
 * a stair is usable on foot but cannot be driven through as if it were empty.
 * Upper galleries leave their ground-level underpasses open.
 */
export function verticalVehicleObstacles(world: { surfaces: readonly WalkSurface[]; traversalObstacles: readonly TraversalObstacle[]; bounds?: RegionBounds }, clearance = 2.7): Obstacle[] {
  const result: Obstacle[] = world.traversalObstacles.filter(o => { const ground=world.bounds?.groundHeight?.((o.minX+o.maxX)/2,(o.minZ+o.maxZ)/2)??0; return o.maxY>ground+.15 && o.minY<ground+clearance; }).map(o => ({ ...o }));
  const surfaceClearance = clearance + .26; // Account for the authored floor slab thickness.
  for (const surface of world.surfaces) {
    const ground=world.bounds?.groundHeight?.((surface.minX+surface.maxX)/2,(surface.minZ+surface.maxZ)/2)??0;
    if(world.bounds?.groundHeight && surface.solidBelow && Math.max(surface.startHeight,surface.endHeight)<=ground+.16)continue;
    const minHeight = Math.min(surface.startHeight, surface.endHeight), maxHeight = Math.max(surface.startHeight, surface.endHeight);
    if (maxHeight <= ground+.15 || !surface.solidBelow && minHeight >= ground+surfaceClearance) continue;
    const box: Obstacle = { minX: surface.minX, maxX: surface.maxX, minZ: surface.minZ, maxZ: surface.maxZ, maxY: maxHeight, ...(surface.footprint ? { footprint: surface.footprint } : {}) };
    if (!surface.solidBelow && maxHeight > ground+surfaceClearance && minHeight < ground+surfaceClearance) {
      // Clip the low part of an open ramp; cars can pass below its high end.
      const t = (ground+surfaceClearance - surface.startHeight) / (surface.endHeight - surface.startHeight);
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
