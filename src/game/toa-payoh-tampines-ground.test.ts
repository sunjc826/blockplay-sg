import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { buildToaPayohScene, TOA_PAYOH_BOUNDS, TOA_PAYOH_MAP_ROADS } from './toa-payoh-scene';
import { buildTampinesScene, TAMPINES_BOUNDS, TAMPINES_MAP_ROADS } from './tampines-scene';
import { toaPayohGroundHeight, TOA_PAYOH_SOCIAL_TABLES } from './toa-payoh-ground';
import { tampinesGroundHeight, TAMPINES_GROUND_PATCHES } from './tampines-ground';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { canFly, createVehicle, driveVehicle } from './vehicle-rules';
import { sceneFlightObstacles } from './flight-obstacles';

const toa = buildToaPayohScene(), tampines = buildTampinesScene();
toa.scene.updateMatrixWorld(true); tampines.scene.updateMatrixWorld(true);
afterAll(() => { toa.dispose(); tampines.dispose(); });
function movement(world: typeof toa, bounds: typeof TOA_PAYOH_BOUNDS) {
  return createVerticalMovement({ bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
}
function walk(world: typeof toa, bounds: typeof TOA_PAYOH_BOUNDS, points: number[][], radius: number) {
  const move = movement(world, bounds), height = bounds.groundHeight;
  let state = { x: points[0][0], z: points[0][1], y: height(...points[0] as [number, number]), velocityY: 0 };
  for (const [x, z] of points.slice(1)) {
    const next = move.move(state, x - state.x, z - state.z, 0, radius);
    expect(Math.hypot(next.x - x, next.z - z), JSON.stringify({ state, x, z, radius })).toBeLessThan(.03);
    expect(next.y).toBeCloseTo(height(x, z), 4); expect(next.grounded).toBe(true); state = next;
  }
}

describe('Toa Payoh and Tampines local ground design', () => {
  it('retains flat streets and estate ground instead of applying Queenstown hills uniformly', () => {
    for (const [roads, height] of [[TOA_PAYOH_MAP_ROADS, toaPayohGroundHeight], [TAMPINES_MAP_ROADS, tampinesGroundHeight]] as const)
      for (const road of roads) for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        for (let d = 0; d <= length; d += 2) expect(height(a.x + (b.x - a.x) * d / length, a.z + (b.z - a.z) * d / length)).toBe(0);
      }
    for (const [x, z] of [[-180, 62], [170, 65], [-70, 150]]) expect(toaPayohGroundHeight(x, z)).toBe(0);
    for (const [x, z] of [[-188, 75], [-80, 158], [-188, 168]]) expect(tampinesGroundHeight(x, z)).toBe(0);
    expect(toa.scene.userData.socialGroundDesign.gameBoards).toBe(1);
    expect(tampines.scene.userData.socialGroundDesign.gameBoards).toBe(0);
  });

  it('uses one supported finish for Toa Payoh decks, sand court, ramps and connected park paving', () => {
    const own = toa.scene.getObjectByName('toa-payoh-social-ground')!;
    for (const [x, z] of [[40, -86], [40, -18], [40, -77.2], [32, -72.4], [68, -27.1], [24, -47], [-218, -64], [-198, -88], [-212, -44]]) {
      const y = toaPayohGroundHeight(x, z), ray = new THREE.Raycaster(new THREE.Vector3(x, y + .1, z), new THREE.Vector3(0, -1, 0), 0, .15);
      const hits = ray.intersectObject(own, true).filter(hit => hit.face!.normal.y > .8);
      expect(hits, `${x},${z}`).toHaveLength(1); expect(hits[0].point.y).toBeCloseTo(y, 5);
    }
  });

  it('walks both estate approaches, across the sand court and along the linked park paths', () => {
    const routes = [
      [[32, -96], [32, -86], [32, -76], [32, -68], [24, -68], [24, -32], [68, -32], [68, -26], [68, -18], [68, -8]],
      [[-218, -84], [-218, -88], [-209, -88], [-157, -88]],
      [[-218, -64], [-218, -44], [-209, -44], [-157, -44]],
    ];
    for (const points of routes) for (const radius of [.38, .65]) { walk(toa, TOA_PAYOH_BOUNDS, points, radius); walk(toa, TOA_PAYOH_BOUNDS, [...points].reverse(), radius); }
    for (const t of TOA_PAYOH_SOCIAL_TABLES) expect(movement(toa, TOA_PAYOH_BOUNDS).canOccupy(t.x, 0, t.z)).toBe(false);
  });

  it('matches the Tampines rendered triangles and keeps the court and arrival floor level', () => {
    const ground = tampines.scene.children.filter(c => c.name.startsWith('Tampines ground:'));
    for (const p of TAMPINES_GROUND_PATCHES) for (let j = 0; j < p.zs.length - 1; j++) for (let i = 0; i < p.xs.length - 1; i++) {
      const x = p.xs[i] * .63 + p.xs[i + 1] * .37, z = p.zs[j] * .41 + p.zs[j + 1] * .59, y = tampinesGroundHeight(x, z);
      const hit = new THREE.Raycaster(new THREE.Vector3(x, y + .15, z), new THREE.Vector3(0, -1, 0), 0, .3).intersectObjects(ground);
      expect(hit, `${p.id}/${x},${z}`).toHaveLength(1); expect(hit[0].point.y).toBeCloseTo(y, 5);
    }
    for (const x of [28, 55, 82]) for (const z of [-60, -40, -20]) expect(tampinesGroundHeight(x, z)).toBeCloseTo(.7);
    expect(tampinesGroundHeight(55, 0)).toBeCloseTo(.18);
    const approachY = tampinesGroundHeight(55, 9.5);
    const approach = new THREE.Raycaster(new THREE.Vector3(55, approachY + .1, 9.5), new THREE.Vector3(0, -1, 0), 0, .15).intersectObject(tampines.scene, true);
    expect(approach.filter(hit => hit.face!.normal.y > .8 && hit.point.y >= approachY - 1e-5)).toHaveLength(1);

    expect(tampinesGroundHeight(129, 75)).toBeCloseTo(.8);
    expect(tampinesGroundHeight(216, 75)).toBeCloseTo(1.6);
  });

  it('connects the shallow Hub threshold and unequal quarry trails without hidden steps', () => {
    const routes = [[[55, 11], [55, 6], [55, -5], [55, -14], [55, -22]],
      [[172, 34], [172, 42], [129, 42], [129, 60], [129, 100], [129, 117]],
      [[172, 34], [172, 42], [216, 42], [216, 60], [216, 100], [216, 117]]];
    for (const points of routes) for (const radius of [.38, .65]) { walk(tampines, TAMPINES_BOUNDS, points, radius); walk(tampines, TAMPINES_BOUNDS, [...points].reverse(), radius); }
  });

  it('grounds cars on the quarry approach in both directions and preserves low open airspace', () => {
    for (const [from, to] of [[34, 117], [117, 34]]) {
      let car = createVehicle('car', { x: 216, z: from, yaw: from < to ? Math.PI : 0 });
      car.y = tampinesGroundHeight(car.x, car.z) + .13;
      for (let i = 0; i < 900 && Math.abs(car.z - to) > .7; i++) {
        const next = driveVehicle(car, 1, 0, false, .02, tampines.obstacles, TAMPINES_BOUNDS);
        expect(next.blocked).toBe(false); car = next.state;
        expect(car.y).toBeCloseTo(tampinesGroundHeight(car.x, car.z) + .13, 6);
      }
      expect(Math.abs(car.z - to)).toBeLessThan(.7);
    }
    const flight = sceneFlightObstacles(tampines.scene);
    expect(canFly(180, .13, 34, flight, TAMPINES_BOUNDS)).toBe(true);
    expect(canFly(216, tampinesGroundHeight(216, 70) - .1, 70, flight, TAMPINES_BOUNDS)).toBe(false);
  });
});
