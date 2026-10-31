import type { CombatPlane } from './combat-events';
import type { createSceneCover } from './scene-cover';
/** The whole canopy must descend through real geometry and foliage to dry support. */
export const createDropColumnCheck = (cover: ReturnType<typeof createSceneCover>) => (p: CombatPlane, floor: number) =>
  [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]].every(([dx, dz]) =>
    Math.abs(100 - cover.sightDistance({ x: p.x + dx, y: 100, z: p.z + dz }, { x: 0, y: -1, z: 0 }, 101) - floor) <= .45);
