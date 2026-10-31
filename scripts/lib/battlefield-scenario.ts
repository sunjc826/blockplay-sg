import { buildDistrictWorld } from '../../src/game/district-world';
import { createArena } from '../../src/game/arena-rules';
import type { BattlefieldSize } from '../../src/game/battlefield';
import { getWalkSurfaces, getTraversalObstacles } from '../../src/game/vertical-routes';
import { createVerticalMovement } from '../../src/game/vertical-movement';
import { worldVehicleSpawns } from '../../src/game/world-vehicles';
import { getFpsDistrict } from '../../src/game/fps-districts';
import { verticalVehicleObstacles } from '../../src/game/vertical-vehicle-obstacles';
import { sceneFlightObstacles } from '../../src/game/flight-obstacles';
import { districtFacilitySites } from '../../src/game/facility-sites';
import { expeditionNpcs } from '../../src/game/expedition-npcs';
import { zoneSectors } from '../../src/game/zone-sectors';
import { createSceneCover } from '../../src/game/scene-cover';
import { createDropColumnCheck } from '../../src/game/paratrooper-route-validation';
import { validatedNavalSites } from '../../src/game/naval-route-validation';
import { accelerateInstancedRaycasts } from '../../src/game/instanced-raycast';
import { createFacilityVisuals } from '../../src/game/facility-visuals';
import type { WorldZoneId } from '../../src/game/world-zones';

/** Shared by CPU and browser scale probes; uses the live district's collision and sight. */
export function createBattlefieldScenario(id: WorldZoneId, size: BattlefieldSize = 32) {
  const world=buildDistrictWorld(id), surfaces=getWalkSurfaces(world.scene), traversalObstacles=getTraversalObstacles(world.scene);
  const terrain={bounds:world.bounds,obstacles:world.obstacles,surfaces,traversalObstacles};
  const movement=createVerticalMovement(terrain), npcs=expeditionNpcs(id,zoneSectors(id));
  const flightObstacles=sceneFlightObstacles(world.scene);
  const fleet=worldVehicleSpawns(getFpsDistrict(id).vehicles,[...world.obstacles,...verticalVehicleObstacles(terrain)],flightObstacles,world.bounds,[...npcs,world.zone.spawn]);
  const ground=(x:number,z:number)=>world.bounds.groundHeight?.(x,z) ?? 0;
  const sites=districtFacilitySites(id,fleet,(x,z)=>movement.canOccupy(x,ground(x,z),z,1.1,2) && Math.abs((movement.supportHeight(x,z,ground(x,z)+.1,.4,1.8)??100)-ground(x,z))<.05,npcs,ground);
  world.obstacles.push(...sites.map(s=>({minX:s.x-.85,maxX:s.x+.85,minZ:s.z-.65,maxZ:s.z+.65,minY:s.y,maxY:s.y+1.8})));
  const visuals=createFacilityVisuals(world.scene,sites);
  accelerateInstancedRaycasts(world.scene);world.scene.updateMatrixWorld(true);
  const cover=createSceneCover(world.scene);
  const environment={...world.environment,battlefield:{size},facilities:{sites},dropColumnClear:createDropColumnCheck(cover)};
  if(environment.navalSites?.length) environment.navalSites=validatedNavalSites(world.scene,environment.navalSites,world.bounds,createVerticalMovement(terrain));
  const arena=createArena(world.obstacles,world.zone.botCount,world.zone.composition,environment,{spawns:fleet,openWorld:true,flightObstacles},terrain,cover.distance,undefined,cover.sightDistance);
  arena.addPlayer('observer','Observer',0,0,undefined,undefined,true);
  return {world,arena,environment,sites,visuals,dispose(){visuals.dispose();world.dispose();}};
}
