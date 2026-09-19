import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getRegion, regionObjective, regionResetLabel, REGION_IDS, REGIONS, type RegionDefinition } from './regions';
import { locations } from '../data/locations';
import { getFpsDistrict } from './fps-districts';
import { ZONE_LOOT_RULES } from './expedition-loot';
import { getWorldZone } from './world-zones';
import type { Obstacle } from './region-collision';

const CAR_RADIUS = 1.35;

/** Collision-aware flood fill from the spawn, on the car's wider clearance. */
function reachable(region: RegionDefinition, obstacles: readonly Obstacle[], targets: readonly { x: number; z: number }[]) {
  const queue = [{ x: region.spawn.x, z: region.spawn.z }], seen = new Set([`${region.spawn.x},${region.spawn.z}`]);
  const pending = new Set(targets);
  for (let i = 0; i < queue.length && pending.size; i++) {
    const point = queue[i];
    for (const target of pending) if (Math.hypot(point.x - target.x, point.z - target.z) < 3) pending.delete(target);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = point.x + dx, z = point.z + dz, key = `${x},${z}`;
      if (seen.has(key) || !region.canOccupy(x, z, CAR_RADIUS, obstacles)) continue;
      const end = region.move(point, dx, dz, CAR_RADIUS, obstacles);
      if (Math.hypot(end.x - x, end.z - z) > 0.01) continue;
      seen.add(key); queue.push({ x, z });
    }
  }
  return pending;
}

it('registers every playable district exactly once, in picker order', () => {
  expect(REGIONS.map(region => region.id)).toEqual([...REGION_IDS]);
  expect(locations.map(location => location.id)).toEqual([...REGION_IDS]);
  expect(new Set(REGIONS.map(region => region.className)).size).toBe(REGIONS.length);
  expect(new Set(REGIONS.map(region => region.modeName)).size).toBe(REGIONS.length);
  for (const region of REGIONS) {
    expect(getWorldZone(region.id).spawn).toMatchObject(region.spawn);
    expect(ZONE_LOOT_RULES[region.id], region.id).toBeDefined();
    expect(getFpsDistrict(region.id).targets.length, region.id).toBe(8);
    expect(regionResetLabel(region)).toContain(region.shortName);
    expect(regionObjective(region, 0)).toContain(String(region.stamps.length));
    expect(regionObjective(region, region.stamps.length)).toContain('Shiok');
  }
});

describe.each(REGIONS.map(region => [region.id] as const))('%s', id => {
  const region = getRegion(id);

  it('keeps the spawn, stamps, checkpoints and FPS range drivable and connected', () => {
    const world = region.build();
    try {
      expect(region.stamps.length).toBeGreaterThanOrEqual(8);
      expect(new Set(region.stamps.map(stamp => stamp.name)).size).toBe(region.stamps.length);
      expect(world.stamps).toHaveLength(region.stamps.length);
      expect(region.canOccupy(region.spawn.x, region.spawn.z, CAR_RADIUS, world.obstacles)).toBe(true);
      const district = getFpsDistrict(id), zone = getWorldZone(id);
      const targets = [...region.stamps, ...zone.encounterSpawns, district.spawn, ...Object.values(district.vehicles)];
      for (const target of targets) expect(region.canOccupy(target.x, target.z, CAR_RADIUS, world.obstacles), JSON.stringify(target)).toBe(true);
      expect([...reachable(region, world.obstacles, targets)], 'unreachable positions').toEqual([]);
      world.animate(12);
      expect(world.stamps.every(stamp => Number.isFinite(stamp.position.y))).toBe(true);
    } finally { world.dispose(); }
  });

  it('keeps every displayed road drivable along its whole length', () => {
    const world = region.build();
    try {
      for (const road of region.mapRoads) for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(length / 2);
        // Perpendicular offsets allow a central median (viaduct piers, planting)
        // while still proving a car can follow the street from end to end.
        const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
        for (let n = 0; n <= steps; n++) {
          const x = a.x + (b.x - a.x) * n / steps, z = a.z + (b.z - a.z) * n / steps;
          const lane = [0, 4, -4, 6, -6].some(offset => region.canOccupy(x + nx * offset, z + nz * offset, CAR_RADIUS, world.obstacles));
          expect(lane, JSON.stringify({ x, z })).toBe(true);
        }
      }
    } finally { world.dispose(); }
  });

  it('batches its authored geometry and disposes without leaking draw calls', () => {
    const world = region.build();
    try {
      const drawn = world.scene.children.reduce((total, child) =>
        total + (child instanceof THREE.InstancedMesh ? child.count : child instanceof THREE.Mesh ? 1 : 0), 0);
      expect(drawn).toBeGreaterThan(400);
      // Draw-call guard. Marina, the largest district, sits near 210 children.
      expect(world.scene.children.length).toBeLessThan(260);
      expect(region.bounds.maxX).toBeGreaterThan(region.bounds.minX);
      expect(region.bounds.maxZ).toBeGreaterThan(region.bounds.minZ);
      for (const stamp of region.stamps) {
        expect(stamp.x, stamp.name).toBeGreaterThan(region.bounds.minX);
        expect(stamp.x, stamp.name).toBeLessThan(region.bounds.maxX);
        expect(stamp.z, stamp.name).toBeGreaterThan(region.bounds.minZ);
        expect(stamp.z, stamp.name).toBeLessThan(region.bounds.maxZ);
      }
    } finally { world.dispose(); }
  });
});
