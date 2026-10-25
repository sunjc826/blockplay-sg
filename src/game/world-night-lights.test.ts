import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { dayLighting, TIMES_OF_DAY } from './world-lighting';
import { bakeLampMap, buildingSized, createNightLights, LAMP_HEIGHT, LAMP_REACH, LAMP_SPACING, nightLevel, PATH_LAMP, placePathLamps, placeStreetLamps } from './world-night-lights';

describe('night level', () => {
  it('is off by day, part-lit at dusk and full at night', () => {
    expect(nightLevel(dayLighting(TIMES_OF_DAY.noon.hour).elevation)).toBe(0);
    expect(nightLevel(dayLighting(TIMES_OF_DAY.afternoon.hour).elevation)).toBe(0);
    const dusk = nightLevel(dayLighting(TIMES_OF_DAY.dusk.hour).elevation);
    expect(dusk).toBeGreaterThan(.3); expect(dusk).toBeLessThan(1);
    expect(nightLevel(dayLighting(TIMES_OF_DAY.night.hour).elevation)).toBe(1);
    expect(nightLevel(dayLighting(TIMES_OF_DAY.dawn.hour).elevation)).toBeGreaterThan(0);
  });
});

describe('street lamps', () => {
  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  it('stand along the kerbs, alternate sides and keep their spacing', () => {
    const lamps = placeStreetLamps([{ points: [{ x: -90, z: 0 }, { x: 90, z: 0 }] }], 14, [], bounds);
    expect(lamps.length).toBeGreaterThanOrEqual(5);
    for (const lamp of lamps) { expect(Math.abs(lamp.z)).toBeCloseTo(8.4); expect(Math.sign(lamp.dz)).toBe(-Math.sign(lamp.z)); }
    expect(new Set(lamps.map(l => Math.sign(l.z))).size).toBe(2);
    expect(lamps[1].x - lamps[0].x).toBeCloseTo(LAMP_SPACING);
  });
  it('keep out of footprints, other carriageways, water and the map edge', () => {
    const roads = [{ points: [{ x: -90, z: 0 }, { x: 90, z: 0 }] }, { points: [{ x: 0, z: -90 }, { x: 0, z: 90 }] }];
    const obstacles = [{ minX: 20, maxX: 60, minZ: 5, maxZ: 30 }];
    const lamps = placeStreetLamps(roads, 14, obstacles, bounds, { ground: x => x < -60 ? null : 0 });
    for (const lamp of lamps) {
      expect(Math.min(Math.abs(lamp.x), Math.abs(lamp.z))).toBeGreaterThan(7.5);
      expect(lamp.x > 19 && lamp.x < 61 && lamp.z > 4 && lamp.z < 31).toBe(false);
      expect(lamp.x).toBeGreaterThan(-60);
    }
  });
  it('fill open ground out of the streetlamps\' reach with path lamps', () => {
    const roads = [{ points: [{ x: -90, z: 0 }, { x: 90, z: 0 }] }], streets = placeStreetLamps(roads, 14, [], bounds);
    const obstacles = [{ minX: -80, maxX: -20, minZ: 30, maxZ: 90 }];
    const paths = placePathLamps(streets, roads, 14, obstacles, bounds);
    expect(paths.length).toBeGreaterThan(4);
    for (const lamp of paths) {
      expect(lamp.height).toBe(PATH_LAMP.height); expect(lamp.dx).toBe(0);
      expect(Math.abs(lamp.z)).toBeGreaterThan(8.5);
      expect(lamp.x > -83 && lamp.x < -17 && lamp.z > 27 && lamp.z < 93).toBe(false);
      for (const other of [...streets, ...paths]) if (other !== lamp) expect(Math.hypot(other.x - lamp.x, other.z - lamp.z)).toBeGreaterThan(15);
    }
  });
  it('light the ground under them in the baked map, and nothing far off', () => {
    const lamp = { x: 0, z: 0, y: 0, dx: 1, dz: 0, height: LAMP_HEIGHT, reach: LAMP_REACH };
    const { data, width, height } = bakeLampMap([lamp], bounds);
    const at = (x: number, z: number) => data[(Math.floor((z + 100) / 200 * height) * width + Math.floor((x + 100) / 200 * width)) * 4];
    expect(at(1.7, 0)).toBeGreaterThan(200);
    expect(at(10, 0)).toBeGreaterThan(0);
    expect(at(40, 40)).toBe(0);
  });
  it('line every district, with buildings to light up', () => {
    for (const region of REGIONS) {
      const world = region.build();
      const night = createNightLights(world.scene, { roads: region.mapRoads, roadWidth: region.roadWidth, bounds: region.bounds, obstacles: world.obstacles });
      expect(night.lamps.length, region.id).toBeGreaterThan(8);
      for (const lamp of night.lamps) expect(region.canOccupy(lamp.x, lamp.z, .1, world.obstacles), `${region.id} ${lamp.x},${lamp.z}`).toBe(true);
      let windowed = 0;
      world.scene.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.getAttribute('nightSpan')) windowed++; });
      expect(windowed, region.id).toBeGreaterThan(0);
      night.dispose();
      world.scene.traverse(o => { if (o instanceof THREE.Mesh) expect(o.geometry.getAttribute('nightSpan')).toBeUndefined(); });
      world.dispose();
    }
  });
  it('size windows for buildings, not kerbs or poles', () => {
    expect(buildingSized(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 30, 15)))).toBe(true);
    expect(buildingSized(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.6, 9, .6)))).toBe(false);
    expect(buildingSized(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(60, .3, 3)))).toBe(false);
  });
});
