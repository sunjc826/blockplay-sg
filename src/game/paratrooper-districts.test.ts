import { expect, it } from 'vitest';
import { PARATROOPER_DISTRICTS } from './paratroopers';
import { buildDistrictWorld } from './district-world';
import { createArena } from './arena-rules';
import { createSceneCover } from './scene-cover';
import { createDropColumnCheck } from './paratrooper-route-validation';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

for (const id of PARATROOPER_DISTRICTS) it(`${id} has a real dry open-sky drop connected to patrol ground`, () => {
  const world = buildDistrictWorld(id);
  try {
    const cover = createSceneCover(world.scene);
    const env = { ...world.environment, heat: undefined, combatEvents: undefined, facilities: { sites: [] }, population: 4, dropColumnClear: createDropColumnCheck(cover) };
    const arena = createArena(world.obstacles, 0, 'assault', env, undefined, { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) }, cover.distance);
    expect(arena.triggerEvent('paratroopers'), id).not.toBeNull();
  } finally { world.dispose(); }
}, 30000);
