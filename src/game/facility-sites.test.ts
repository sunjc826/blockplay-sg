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
import { districtDeploymentPoints } from './expedition-deployment';
import { createVehicle, vehicleBounds } from './vehicle-rules';

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
    const cabinets = sites.map(s => ({ minX: s.x - .85, maxX: s.x + .85, minZ: s.z - .65, maxZ: s.z + .65, maxY: 1.8 }));
    const hulls = (['car', 'helicopter'] as const).map(kind => vehicleBounds(createVehicle(kind, fleet[kind])));
    const entries = districtDeploymentPoints(id, (x, z) => nav.canOccupy(x, 0, z, .5, 1.8) && Math.abs(nav.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05 &&
      npcs.every(n => Math.hypot(n.x - x, n.z - z) > 3) && Object.values(fleet).every(v => Math.hypot(v.x - x, v.z - z) > 8) &&
      sites.every(f => Math.hypot(f.x - x, f.z - z) > (f.initialOwner === 'mercenaries' ? 35 : 8)),
      (x, z) => nav.canOccupy(x, 0, z, .5, 1.8, [...cabinets, ...hulls]) && Math.abs(nav.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries[0].id).toBe('entry');
    expect(new Set(entries.map(p => p.id)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(nav.canOccupy(entry.x, 0, entry.z, .5, 1.8)).toBe(true);
      expect(nav.canOccupy(entry.x, 0, entry.z, .5, 1.8, [...cabinets, ...hulls])).toBe(true);
      expect(entry.id === 'entry' || sites.every(s => Math.hypot(s.x - entry.x, s.z - entry.z) > 8)).toBe(true);
      expect(entries.every(p => p === entry || Math.hypot(p.x - entry.x, p.z - entry.z) >= 28)).toBe(true);
    }
  } finally { world.dispose(); }
}, 30000);
