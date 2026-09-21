import { describe, expect, it } from 'vitest';
import { getRegion, type RegionDefinition } from './regions';
import { sectorAt, zoneSectors, ZONE_SECTORS } from './zone-sectors';
import { coverFor, coverMasses, measureCover } from './cover-metrics';
import { ZONE_LOOT_RULES } from './expedition-loot';
import { getWorldZone, WORLD_ZONES, type WorldZoneId } from './world-zones';
import type { Obstacle } from './region-collision';

/** Districts carrying sector data; the rest are untouched and stay whole. */
const SECTORED = Object.keys(ZONE_SECTORS) as WorldZoneId[];

const CAR_RADIUS = 1.35;
/** Matches `clearGround` in expedition-loot: the clearance a crate needs. */
const LOOT_RADIUS = 0.65;

/** Every position the car can reach from the spawn, as regions.test.ts flood-fills it. */
function reachable(region: RegionDefinition, obstacles: readonly Obstacle[]) {
  const queue = [{ x: region.spawn.x, z: region.spawn.z }], seen = new Set([`${region.spawn.x},${region.spawn.z}`]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = point.x + dx, z = point.z + dz, key = `${x},${z}`;
      if (seen.has(key) || !region.canOccupy(x, z, CAR_RADIUS, obstacles)) continue;
      const end = region.move(point, dx, dz, CAR_RADIUS, obstacles);
      if (Math.hypot(end.x - x, end.z - z) > 0.01) continue;
      seen.add(key); queue.push({ x, z });
    }
  }
  return queue;
}

it('sectors every district, and still answers for ground that belongs to none', () => {
  for (const id of SECTORED) expect(() => getWorldZone(id)).not.toThrow();
  // Every district now carries sectors; the pilot is over.
  for (const zone of WORLD_ZONES) expect(zoneSectors(zone.id).length, zone.id).toBeGreaterThan(1);
  // Far outside any district's bounds belongs to no sector, and must not throw.
  expect(sectorAt('queenstown', 99999, 99999)).toBeNull();
});

describe.each(SECTORED.map(id => [id] as const))('%s sectors', id => {
  const region = getRegion(id), sectors = zoneSectors(id);

  it('names each sector once and keeps its bounds inside the district', () => {
    expect(sectors.length).toBeGreaterThan(1);
    expect(new Set(sectors.map(s => s.id)).size).toBe(sectors.length);
    expect(new Set(sectors.map(s => s.name)).size).toBe(sectors.length);
    for (const sector of sectors) {
      expect(sector.bounds.maxX, sector.id).toBeGreaterThan(sector.bounds.minX);
      expect(sector.bounds.maxZ, sector.id).toBeGreaterThan(sector.bounds.minZ);
      expect(sector.bounds.minX, sector.id).toBeGreaterThanOrEqual(region.bounds.minX);
      expect(sector.bounds.maxX, sector.id).toBeLessThanOrEqual(region.bounds.maxX);
      expect(sector.bounds.minZ, sector.id).toBeGreaterThanOrEqual(region.bounds.minZ);
      expect(sector.bounds.maxZ, sector.id).toBeLessThanOrEqual(region.bounds.maxZ);
      expect(sector.lootWeight, sector.id).toBeGreaterThan(0);
      expect(sector.botWeight ?? 0, sector.id).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * The load-bearing one. Sector coordinates are transcribed from the scene
   * rather than imported, so this builds the real scene and proves each anchor
   * is still standing on clear ground the car can drive to. A later edit that
   * walls a sector off fails here rather than stranding crates in scenery.
   */
  it('keeps every anchor inside its sector, clear and reachable from the spawn', () => {
    const world = region.build();
    try {
      const net = reachable(region, world.obstacles);
      for (const sector of sectors) {
        // Loot draws from anchors before the spawn-ring fallback, so a sector
        // wants more anchors than the district has crates to place.
        expect(sector.anchors.length, `${sector.id} anchors`).toBeGreaterThanOrEqual(3);
        // A repeated anchor silently costs a crate slot at the 3 m spacing rule.
        expect(new Set(sector.anchors.map(a => `${a.x},${a.z}`)).size, `${sector.id} distinct anchors`).toBe(sector.anchors.length);
        for (const anchor of sector.anchors) {
          const where = `${sector.id} ${JSON.stringify(anchor)}`;
          expect(anchor.x, where).toBeGreaterThanOrEqual(sector.bounds.minX);
          expect(anchor.x, where).toBeLessThanOrEqual(sector.bounds.maxX);
          expect(anchor.z, where).toBeGreaterThanOrEqual(sector.bounds.minZ);
          expect(anchor.z, where).toBeLessThanOrEqual(sector.bounds.maxZ);
          expect(region.canOccupy(anchor.x, anchor.z, CAR_RADIUS, world.obstacles), `${where} car clearance`).toBe(true);
          expect(region.canOccupy(anchor.x, anchor.z, LOOT_RADIUS, world.obstacles), `${where} crate clearance`).toBe(true);
          expect(net.some(p => Math.hypot(p.x - anchor.x, p.z - anchor.z) < 3), `${where} reachable`).toBe(true);
        }
      }
    } finally { world.dispose(); }
  });

  it('offers enough anchors and enough character to place the district loot', () => {
    const rules = ZONE_LOOT_RULES[id];
    const crates = rules.weaponCount + rules.ammoCount + rules.medicalCount + rules.armorCount;
    expect(sectors.reduce((total, s) => total + s.anchors.length, 0)).toBeGreaterThanOrEqual(crates);
    // A district whose sectors are all the same in every respect has not been
    // sectored. Cover alone cannot carry this: a district that has not had a
    // cover pass honestly reads `open` throughout, so differentiation is
    // checked across the whole tactical tuple.
    const character = new Set(sectors.map(s => `${s.cover}:${s.lootWeight}:${s.tierBias ?? 0}`));
    expect(character.size).toBeGreaterThan(1);
  });

  it('resolves a point to the sector a player would name', () => {
    for (const sector of sectors) for (const anchor of sector.anchors) {
      const found = sectorAt(id, anchor.x, anchor.z);
      expect(found, `${sector.id} ${JSON.stringify(anchor)}`).not.toBeNull();
      // Overlaps resolve to the smaller sector, so an anchor may land in a
      // neighbour; it must at least resolve to one that contains it.
      expect(found!.bounds.minX).toBeLessThanOrEqual(anchor.x);
      expect(found!.bounds.maxX).toBeGreaterThanOrEqual(anchor.x);
    }
    expect(sectorAt(id, NaN, 0)).toBeNull();
  });
});

/**
 * Cover labels are the part a reader is most likely to get wrong by eye, so
 * they are checked against the scene rather than trusted. Keppel wharf was
 * declared `dense` on the strength of its gantries and measures four per cent
 * solid; this is the test that caught it.
 */
describe.each(SECTORED.map(id => [id] as const))('%s cover labels', id => {
  it('declares the cover band the geometry actually falls in', () => {
    const region = getRegion(id), world = region.build();
    try {
      // Cover comes from the rendered geometry, not the movement colliders:
      // a round is resolved by raycasting meshes, and water stops feet only.
      const masses = coverMasses(world.scene).crouch;
      // Same narrowing the report applies, so `pnpm analyse:cover` and this
      // guard cannot disagree about a sector by a fraction of a metre.
      const standable = (x: number, z: number) => region.canOccupy(x, z, 0.4, world.obstacles);
      for (const sector of zoneSectors(id)) {
        const measured = measureCover(sector.bounds, masses, standable);
        const detail = `${sector.id}: median=${measured.median.toFixed(1)}m p90=${measured.p90.toFixed(1)}m`;
        expect(coverFor(sector.bounds, masses, standable), detail).toBe(sector.cover);
      }
    } finally { world.dispose(); }
  });
});
