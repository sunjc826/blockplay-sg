import type { buildDistrictWorld } from './district-world';
import type { ExpeditionNpc } from './expedition-npcs';
import { getFpsDistrict } from './fps-districts';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { sceneFlightObstacles } from './flight-obstacles';
import { worldVehicleSpawns } from './world-vehicles';
import { districtFacilitySites } from './facility-sites';
import { DRAGON_BOAT_SPAWNS } from './marina-water';

/** The bake and the live expedition must place camps and staging points identically. */
export function districtInfrastructure(world: ReturnType<typeof buildDistrictWorld>, npcs: readonly ExpeditionNpc[]) {
  const terrain = { bounds: world.bounds, obstacles: world.obstacles, surfaces: getPhysicalWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) };
  const movement = createVerticalMovement(terrain), id = world.zone.id;
  const motor = worldVehicleSpawns(getFpsDistrict(id).vehicles, [...world.obstacles, ...verticalVehicleObstacles(terrain)],
    sceneFlightObstacles(world.scene), world.bounds, [...npcs, world.zone.spawn]);
  const fleetSpawns = { ...motor, ...(id === 'marina-bay' ? DRAGON_BOAT_SPAWNS : {}) };
  const ground = (x: number, z: number) => world.bounds.groundHeight?.(x, z) ?? 0;
  const facilitySites = districtFacilitySites(id, fleetSpawns, (x, z) => movement.canOccupy(x, ground(x, z), z, 1.1, 2) &&
    Math.abs((movement.supportHeight(x, z, ground(x, z) + .1, .4, 1.8) ?? 100) - ground(x, z)) < .05, npcs, world.bounds.groundHeight);
  return { fleetSpawns, facilitySites };
}
