import { buildDistrictWorld } from '../../src/game/district-world';
import { districtInfrastructure } from '../../src/game/district-infrastructure';
import { expeditionNpcs } from '../../src/game/expedition-npcs';
import { zoneSectors } from '../../src/game/zone-sectors';
import { installStructureLayout } from '../../src/game/structure-layout';
import { getWalkSurfaces, getTraversalObstacles } from '../../src/game/vertical-routes';
import { getBuildingLifts } from '../../src/game/building-lifts';
import { arenaNavigationAnchors } from '../../src/game/arena-rules';
import type { WorldZoneId } from '../../src/game/world-zones';

export function navigationBakeWorld(id: WorldZoneId) {
  const world = buildDistrictWorld(id);
  try {
    const { fleetSpawns, facilitySites, structures } = districtInfrastructure(world, expeditionNpcs(id, zoneSectors(id)));
    const installed = installStructureLayout(world, structures);
    const environment = { ...world.environment, facilities: { sites: facilitySites }, navigationAnchors: [...(world.environment.navigationAnchors ?? []), ...installed.navigationAnchors] };
    const vehicles = { spawns: fleetSpawns, openWorld: true };
    return { world, environment, vehicles, anchors: arenaNavigationAnchors(world.obstacles, environment, vehicles),
      terrain: { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene), lifts: getBuildingLifts(world.scene) },
      dispose: () => { installed.dispose(); world.dispose(); } };
  } catch (error) { world.dispose(); throw error; }
}
