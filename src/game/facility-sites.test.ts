import { expect, it } from 'vitest';
import { districtFacilitySites } from './facility-sites';
import { buildDistrictWorld } from './district-world';
import { getFpsDistrict } from './fps-districts';
import { worldVehicleSpawns } from './world-vehicles';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { sceneFlightObstacles } from './flight-obstacles';
import { expeditionNpcs } from './expedition-npcs';
import { zoneSectors } from './zone-sectors';
import { REGION_IDS } from './region-ids';

it.each(REGION_IDS)('%s has two clear command posts and usable garage/helipad equipment sites', id => {
  const world = buildDistrictWorld(id);
  try {
    const surfaces = getWalkSurfaces(world.scene), traversalObstacles = getTraversalObstacles(world.scene);
    const nav = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces, traversalObstacles });
    const npcs = expeditionNpcs(id, zoneSectors(id));
    const fleet = worldVehicleSpawns(getFpsDistrict(id).vehicles, [...world.obstacles, ...verticalVehicleObstacles({ surfaces, traversalObstacles })], sceneFlightObstacles(world.scene), world.bounds, [...npcs, world.zone.spawn]);
    const clear = (x: number, z: number) => nav.canOccupy(x, 0, z, 1.1, 2) && Math.abs(nav.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05;
    const sites = districtFacilitySites(id, fleet, clear, npcs);
    expect(sites.map(s => s.kind)).toEqual(['command', 'command', 'garage', 'helipad']);
    for (const site of sites) expect(clear(site.x, site.z)).toBe(true);
    expect(sites.filter(s => s.kind === 'command').map(s => s.initialOwner)).toEqual(['armed-forces', 'mercenaries']);
  } finally { world.dispose(); }
}, 30000);
