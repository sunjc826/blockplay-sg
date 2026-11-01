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
import { campPropBounds, facilityObstacles } from './command-camp';

it.each(REGION_IDS)('%s has clear objectives, forward deployment and separate fronts', id => {
  const world = buildDistrictWorld(id);
  try {
    const surfaces = getWalkSurfaces(world.scene), traversalObstacles = getTraversalObstacles(world.scene);
    const nav = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces, traversalObstacles });
    const npcs = expeditionNpcs(id, zoneSectors(id));
    const fleet = worldVehicleSpawns(getFpsDistrict(id).vehicles, [...world.obstacles, ...verticalVehicleObstacles({ surfaces, traversalObstacles })], sceneFlightObstacles(world.scene), world.bounds, [...npcs, world.zone.spawn]);
    const ground = (x:number,z:number) => world.bounds.groundHeight?.(x,z) ?? 0;
    const clear = (x: number, z: number) => nav.canOccupy(x, ground(x,z), z, 1.1, 2) && Math.abs((nav.supportHeight(x, z, ground(x,z)+.1, .4, 1.8) ?? 100)-ground(x,z)) < .05;
    const sites = districtFacilitySites(id, fleet, clear, npcs, ground);
    expect(sites.map(s => s.kind)).toEqual(['command', 'command', 'garage', 'helipad', 'command', 'command', 'supply', ...(id==='marina-bay'?['supply','supply','supply']:[])]);
    for (const site of sites) {
      expect(nav.canOccupy(site.x,site.y,site.z,1.1,2)).toBe(true);
      expect(nav.supportHeight(site.x,site.z,site.y+.1,.4,1.8)).toBeCloseTo(site.y);
    }
    expect(sites.filter(s => s.kind === 'command').map(s => s.initialOwner)).toEqual(['armed-forces', 'mercenaries', null, null]);
    for (const site of sites.slice(4)) {
      expect(site.initiallyBuilt).toBe(true);
      expect(sites.every(other => other===site || Math.hypot(other.x-site.x,other.y-site.y,other.z-site.z)>=32)).toBe(true);
    }
    const cabinets = sites.flatMap(facilityObstacles);
    for(const site of sites.filter(s=>s.kind==='command')) {
      expect(site.camp).toBeDefined();
      expect(site.camp!.patrol.length).toBeGreaterThanOrEqual(4);
      for(const point of site.camp!.patrol)expect(clear(point.x,point.z)).toBe(true);
      for(const prop of site.camp!.props) {
        const b=campPropBounds(prop);
        for(const x of [b.minX,prop.x,b.maxX])for(const z of [b.minZ,prop.z,b.maxZ])expect(clear(x,z)).toBe(true);
      }
    }
    const campMovement=createVerticalMovement({bounds:world.bounds,obstacles:[...world.obstacles,...cabinets],surfaces,traversalObstacles});
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
      expect(campMovement.canOccupy(entry.x, 0, entry.z, .5, 1.8, hulls)).toBe(true);
      expect(entry.id === 'entry' || sites.every(s => Math.hypot(s.x - entry.x, s.z - entry.z) > 8)).toBe(true);
      expect(entries.every(p => p === entry || Math.hypot(p.x - entry.x, p.z - entry.z) >= 28)).toBe(true);
    }
  } finally { world.dispose(); }
}, 30000);
