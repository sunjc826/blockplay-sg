import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { dayLighting, TIMES_OF_DAY } from './world-lighting';
import { bakeLampMap, buildingSized, createNightLights, LAMP_HEIGHT, LAMP_REACH, LAMP_SPACING, nightLevel, PATH_LAMP, placePathLamps, placeStreetLamps, upright } from './world-night-lights';

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
  it('put windows on standing walls, not pitched roofs', () => {
    const at = (rotation: THREE.Euler) => new THREE.Matrix4().compose(new THREE.Vector3(5, 9, 2), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(30, .7, 14));
    expect(upright(at(new THREE.Euler(0, .8, 0)))).toBe(true);
    // An extruded footprint is drawn flat and stood up a quarter turn.
    expect(upright(at(new THREE.Euler(-Math.PI / 2, 0, 0)))).toBe(true);
    expect(upright(at(new THREE.Euler(.34, 0, 0)))).toBe(false);
  });
  it('leave no lit wall flush with another surface, where the two would fight for the same pixels', () => {
    for (const region of REGIONS) {
      const world = region.build();
      const night = createNightLights(world.scene, { roads: region.mapRoads, roadWidth: region.roadWidth, bounds: region.bounds, obstacles: world.obstacles });
      const fights = flushWithLitWalls(world.scene);
      expect(fights, region.id).toEqual([]);
      night.dispose(); world.dispose();
    }
  });
});

interface WallFace { owner: number; normal: THREE.Vector3; offset: number; along: [number, number]; up: [number, number]; lit: boolean }

/**
 * Where a lit wall of a box shares its plane with another box's wall over more
 * than a square metre: depth cannot order the two, so the windows flicker.
 */
function flushWithLitWalls(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const faces: WallFace[] = [], matrix = new THREE.Matrix4(), corner = new THREE.Vector3();
  let owner = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.fpsEffect || Array.isArray(object.material) || object.material.transparent) return;
    const span = object.geometry.getAttribute('nightSpan') as THREE.BufferAttribute | undefined;
    if (object.geometry.type !== 'BoxGeometry' && !(span && object.geometry.attributes.position.count === 24)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox!;
    for (let i = 0; i < (object instanceof THREE.InstancedMesh ? object.count : 1); i++, owner++) {
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); } else matrix.copy(object.matrixWorld);
      const low = span?.getX(object instanceof THREE.InstancedMesh ? i : 0) ?? 1, high = span?.getY(object instanceof THREE.InstancedMesh ? i : 0) ?? 0;
      for (const axis of [0, 1, 2] as const) for (const side of [-1, 1]) {
        const normal = new THREE.Vector3().setFromMatrixColumn(matrix, axis).multiplyScalar(side).normalize();
        if (Math.abs(normal.y) > .01) continue;
        const along = new THREE.Vector2(-normal.z, normal.x);
        const corners = [0, 1, 2, 3].map(k => {
          const local = [0, 0, 0]; local[axis] = side; local[(axis + 1) % 3] = k & 1 ? 1 : -1; local[(axis + 2) % 3] = k & 2 ? 1 : -1;
          corner.set(...local.map((v, j) => v > 0 ? box.max.getComponent(j) : box.min.getComponent(j)) as [number, number, number]).applyMatrix4(matrix);
          return [corner.x * along.x + corner.z * along.y, corner.y, corner.x * normal.x + corner.z * normal.z];
        });
        const us = corners.map(c => c[0]), vs = corners.map(c => c[1]), lit = low < high;
        faces.push({ owner, normal, offset: corners[0][2], along: [Math.min(...us), Math.max(...us)],
          up: lit ? [Math.max(low, Math.min(...vs)), Math.min(high, Math.max(...vs))] : [Math.min(...vs), Math.max(...vs)], lit });
      }
    }
  });
  const key = (face: WallFace, shift = 0) => `${Math.round(face.normal.x * 50)},${Math.round(face.normal.z * 50)},${Math.round(face.offset * 10) + shift}`;
  const planes = new Map<string, WallFace[]>();
  for (const face of faces) planes.set(key(face), [...planes.get(key(face)) ?? [], face]);
  const fights: string[] = [];
  for (const face of faces) {
    if (!face.lit || face.up[0] >= face.up[1]) continue;
    for (const shift of [-1, 0, 1]) for (const other of planes.get(key(face, shift)) ?? []) {
      if (other.owner === face.owner || other.normal.dot(face.normal) < .999 || Math.abs(other.offset - face.offset) > 1e-3) continue;
      const wide = Math.min(face.along[1], other.along[1]) - Math.max(face.along[0], other.along[0]);
      const tall = Math.min(face.up[1], other.up[1]) - Math.max(face.up[0], other.up[0]);
      if (wide > 0 && tall > 0 && wide * tall > 1) fights.push(`${(face.along[0] + face.along[1]) / 2 | 0} along, ${face.up[0] | 0}-${face.up[1] | 0} m up, facing ${face.normal.x.toFixed(1)},${face.normal.z.toFixed(1)}`);
    }
  }
  return fights;
}
