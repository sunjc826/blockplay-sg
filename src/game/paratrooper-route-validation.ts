import type { CombatPlane } from './combat-events';
import type { createSceneCover } from './scene-cover';
import { isWaterObject } from './water';
/** The whole canopy must descend through real geometry and foliage to dry support. */
export const createDropColumnCheck = (cover: ReturnType<typeof createSceneCover>) => (p: CombatPlane, floor: number) =>
  [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]].every(([dx, dz]) => {
    const hit = cover.trace({ x: p.x + dx, y: 100, z: p.z + dz }, { x: 0, y: -1, z: 0 }, 101, true);
    return !!hit && !isWaterObject(hit.object) && Math.abs(hit.point.y - floor) <= .45;
  });
