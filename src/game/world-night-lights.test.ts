import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing';
import { separateInstancedMaterials } from './instanced-materials';
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
  it('blocks streetlight spill behind walls and under decks while retaining the exposed pool', () => {
    const lamp = { x: 0, z: 0, y: 0, dx: 0, dz: 0, height: LAMP_HEIGHT, reach: LAMP_REACH };
    const wall = { minX: 4, maxX: 5, minZ: -5, maxZ: 5, maxY: 10 };
    const deck = { minX: -8, maxX: -2, minZ: -5, maxZ: 5, minY: 2.8, maxY: 3 };
    const { data, width, height } = bakeLampMap([lamp], bounds, [wall, deck]);
    const at = (x: number, z: number) => data[(Math.floor((z + 100) / 200 * height) * width + Math.floor((x + 100) / 200 * width)) * 4];
    expect(at(1, 0)).toBeGreaterThan(200);
    expect(at(9, 0)).toBe(0); expect(at(-7, 0)).toBe(0);
    expect(at(0, 10)).toBeGreaterThan(0);
    // A ceiling above the lamp does not stop a lamp beneath it lighting its own floor.
    const covered = bakeLampMap([lamp], bounds, [{ ...deck, minY: 9, maxY: 10 }]);
    expect(covered.light.reduce((a, b) => a + b, 0)).toBeCloseTo(bakeLampMap([lamp], bounds).light.reduce((a, b) => a + b, 0));
  });
  it('uses authored convex footprints rather than shadowing their entire bounding box', () => {
    const lamp = { x: 0, z: 0, y: 0, dx: 0, dz: 0, height: LAMP_HEIGHT, reach: LAMP_REACH };
    const triangle = { minX: 4, maxX: 10, minZ: -4, maxZ: 4, maxY: 10, footprint: [{ x: 4, z: -4 }, { x: 10, z: -4 }, { x: 10, z: 4 }] };
    const map = bakeLampMap([lamp], bounds, [triangle]);
    const at = (x: number, z: number) => map.data[(Math.floor((z + 100) / 200 * map.height) * map.width + Math.floor((x + 100) / 200 * map.width)) * 4];
    expect(at(7, 3)).toBeGreaterThan(0);
    expect(at(9, -3)).toBe(0);
  });
  it('leaves substantial dark gaps between the sparse park pools', () => {
    const paths = placePathLamps([], [], 14, [], bounds), map = bakeLampMap(paths, bounds);
    const lit = map.light.filter(value => value > .01).length / map.light.length;
    expect(paths.length).toBeGreaterThan(4);
    expect(lit).toBeLessThan(.15);
    expect(LAMP_REACH).toBe(15); // Street pools retain their reach and their bright centre.
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
  }, 30000);
  it('lights the authored apartment panes on every Queenstown block after batching', () => {
    const region = REGIONS.find(r => r.id === 'queenstown')!, world = region.build();
    separateInstancedMaterials(world.scene);
    const night = createNightLights(world.scene, { roads: region.mapRoads, roadWidth: region.roadWidth, bounds: region.bounds, obstacles: world.obstacles });
    const counts = QUEENSTOWN_HDB_BLOCKS.map(() => 0), matrix = new THREE.Matrix4(), center = new THREE.Vector3();
    world.scene.traverse(object => {
      if (!(object instanceof THREE.InstancedMesh) || Array.isArray(object.material) || !object.material.userData.nightWindow) return;
      expect(object.material.customProgramCacheKey()).toContain('night-panes');
      const span = object.geometry.getAttribute('nightSpan');
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); center.setFromMatrixPosition(matrix);
        const block = QUEENSTOWN_HDB_BLOCKS.findIndex(b => Math.abs(center.x - b.x) < 40 && Math.abs(center.z - b.z) < 12);
        expect(block).toBeGreaterThanOrEqual(0);
        expect(span.getX(i)).toBeLessThan(center.y); expect(span.getY(i)).toBeGreaterThan(center.y);
        counts[block]++;
      }
    });
    QUEENSTOWN_HDB_BLOCKS.forEach((b, i) => expect(counts[i], b.id).toBe(b.storeys * 17 + (b.storeys - 2) * 4));
    // The apartment masses remain ordinary walls: no synthetic panes across the galleries.
    world.scene.getObjectByName('Connected elevated places')!.traverse(object => {
      if (object instanceof THREE.Mesh) expect(object.geometry.getAttribute('nightSpan')).toBeUndefined();
    });
    night.dispose(); world.dispose();
  });
  it('supports authored panes inside elevated places and restores shared buffers on disposal', () => {
    const scene = new THREE.Scene(), group = new THREE.Group(); group.name = 'Connected elevated places'; scene.add(group);
    const material = new THREE.MeshStandardMaterial({ color: '#6d9d92' }); material.userData.nightWindow = true;
    const geometry = new THREE.BoxGeometry(2.5, 1.35, .12), pane = new THREE.Mesh(geometry, material);
    pane.position.set(3, 12, 4); group.add(pane);
    const night = createNightLights(scene, { roads: [], roadWidth: 14, bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, obstacles: [] });
    expect(pane.geometry.getAttribute('nightSpan').getX(0)).toBeCloseTo(12 - 1.35 / 2 - .01);
    expect(pane.geometry.getAttribute('position')).toBe(geometry.getAttribute('position'));
    night.dispose();
    expect(pane.geometry).toBe(geometry); expect(pane.material).toBe(material);
    expect(geometry.getAttribute('nightEdge')).toBeUndefined();
    geometry.dispose(); material.dispose();
  });
  it('lights all three Sands towers between their splayed facade frames after batching', () => {
    const region = REGIONS.find(r => r.id === 'marina-bay')!, world = region.build();
    separateInstancedMaterials(world.scene);
    const night = createNightLights(world.scene, { roads: region.mapRoads, roadWidth: region.roadWidth, bounds: region.bounds, obstacles: world.obstacles });
    try {
      const counts = [0, 0, 0, 0, 0, 0], matrix = new THREE.Matrix4(), center = new THREE.Vector3(), size = new THREE.Vector3();
      world.scene.traverse(object => {
        if (!(object instanceof THREE.InstancedMesh) || Array.isArray(object.material) || !object.material.userData.nightWindow) return;
        expect(object.material.customProgramCacheKey()).toContain('night-panes');
        const span = object.geometry.getAttribute('nightSpan');
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld);
          center.setFromMatrixPosition(matrix); size.setFromMatrixScale(matrix);
          const tower = [-65, -15, 35].findIndex(z => Math.abs(center.z - z) <= 12);
          expect(tower).toBeGreaterThanOrEqual(0);
          const rear = center.x > 151, splay = (1 - center.y / 108) ** 2 * 8;
          // Panes sit outside the glass mass and behind the projecting frames.
          expect(center.x).toBeCloseTo(rear ? 159.55 + splay : 142.45 - splay * .2);
          expect(center.y - size.y / 2).toBeGreaterThan(4);
          expect(center.y + size.y / 2).toBeLessThan(108);
          expect(size.z).toBeLessThan(3 - .13);
          expect(size.y).toBeLessThan(2 - .12);
          expect(span.getX(i)).toBeLessThan(center.y - size.y / 2);
          expect(span.getY(i)).toBeGreaterThan(center.y + size.y / 2);
          counts[tower * 2 + Number(rear)]++;
        }
      });
      expect(counts).toEqual(Array(6).fill(52 * 9));
    } finally { night.dispose(); world.dispose(); }
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
