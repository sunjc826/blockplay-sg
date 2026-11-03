import { navigationBakeWorld } from './navigation-bake-world';
import type { NavigationBake } from '../../src/game/navigation-bake';
import { createArena } from '../../src/game/arena-rules';
import type { BattlefieldSize } from '../../src/game/battlefield';
import { createVerticalMovement } from '../../src/game/vertical-movement';
import { sceneFlightObstacles } from '../../src/game/flight-obstacles';
import { createSceneCover } from '../../src/game/scene-cover';
import { createDropColumnCheck } from '../../src/game/paratrooper-route-validation';
import { validatedNavalSites } from '../../src/game/naval-route-validation';
import { accelerateInstancedRaycasts } from '../../src/game/instanced-raycast';
import { createFacilityVisuals } from '../../src/game/facility-visuals';
import type { WorldZoneId } from '../../src/game/world-zones';

/** Shared by CPU and browser scale probes; uses the live district's collision and sight. */
export function createBattlefieldScenario(id: WorldZoneId, size: BattlefieldSize = 32, bakedNavigation?: NavigationBake) {
  const fixture = navigationBakeWorld(id), { world, terrain } = fixture;
  const sites = fixture.environment.facilities.sites, fleet = fixture.vehicles.spawns;
  const flightObstacles = sceneFlightObstacles(world.scene);
  const visuals=createFacilityVisuals(world.scene,sites);
  accelerateInstancedRaycasts(world.scene);world.scene.updateMatrixWorld(true);
  const cover=createSceneCover(world.scene);
  const environment={...fixture.environment,bakedNavigation,battlefield:{size},dropColumnClear:createDropColumnCheck(cover)};
  if(environment.navalSites?.length) environment.navalSites=validatedNavalSites(world.scene,environment.navalSites,world.bounds,createVerticalMovement(terrain));
  const arena=createArena(world.obstacles,world.zone.botCount,world.zone.composition,environment,{spawns:fleet,openWorld:true,flightObstacles},terrain,cover.distance,undefined,cover.sightDistance);
  arena.addPlayer('observer','Observer',0,0,undefined,undefined,true);
  return {world,arena,environment,sites,visuals,dispose(){visuals.dispose();world.dispose();}};
}
