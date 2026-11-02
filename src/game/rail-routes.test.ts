import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAIL_ROUTES, railState, railTimetable, type RailDistrict } from './rail-routes';
import { getRegion } from './regions';

describe('authored station-to-station railways', () => {
  for (const id of Object.keys(RAIL_ROUTES) as RailDistrict[]) {
    const route = RAIL_ROUTES[id];
    it(`${id}: stops, brakes and wraps continuously with the whole train inside the buffers`, () => {
      const { legs, period } = railTimetable(route);
      for (const leg of legs) {
        expect(railState(route, leg.arrive + route.dwell / 2).position).toBeCloseTo(leg.stop);
        const before = railState(route, leg.depart + .01).position;
        expect(Math.abs(before - leg.stop)).toBeLessThan(.001);
        expect(Math.abs(railState(route, leg.end - .01).position - leg.next)).toBeLessThan(.001);
      }
      let previous = railState(route, -.1).position;
      for (let time = 0; time <= period * 2; time += .1) {
        const { position } = railState(route, time);
        expect(position - route.halfLength).toBeGreaterThan(route.min + 2.5);
        expect(position + route.halfLength).toBeLessThan(route.max - 2.5);
        expect(Math.abs(position - previous)).toBeLessThanOrEqual(route.speed * .1 + 1e-6);
        previous = position;
      }
    });
    it(`${id}: actual animated mesh stays over rendered track for a complete service`, () => {
      const world = getRegion(id).build();
      try {
        const train = world.scene.getObjectByName(`${id}-train`)!;
        expect(train).toBeTruthy();
        expect(world.scene.userData.railRoute).toEqual(route);
        const { period } = railTimetable(route), bounds = new THREE.Box3();
        const ray = new THREE.Raycaster(), up = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
        const scenery = world.scene.children.filter(child => child !== train && !child.userData.fpsEffect);
        for (let t = 0; t <= period; t += 2) {
          world.animate(t); world.scene.updateMatrixWorld(true);
          bounds.setFromObject(train);
          expect(train.visible).toBe(true);
          expect(train.position[route.axis]).toBeCloseTo(railState(route, t).position);
          expect(bounds.min[route.axis]).toBeGreaterThan(route.min + 2);
          expect(bounds.max[route.axis]).toBeLessThan(route.max - 2);
          const cross = route.axis === 'x' ? 'z' : 'x';
          expect((bounds.min[cross] + bounds.max[cross]) / 2).toBeCloseTo(route.cross);
          // The occupied corridor must also be open through station buildings and the far-shore skyline.
          up.set(route.axis === 'x' ? bounds.min.x - .1 : route.cross, route.railY + 2, route.axis === 'z' ? bounds.min.z - .1 : route.cross);
          ray.set(up, new THREE.Vector3(route.axis === 'x' ? 1 : 0, 0, route.axis === 'z' ? 1 : 0));
          ray.far = bounds.max[route.axis] - bounds.min[route.axis] + .2;
          const obstructions = ray.intersectObjects(scenery, true).map(hit => ({ point: hit.point.toArray(), name: hit.object.name, instance: hit.instanceId }));
          expect(obstructions.length, `${id} clearance at ${t}s: ${JSON.stringify(obstructions)}`).toBe(0);
          // Check support beneath nose, centre and tail, using built (including instanced) geometry.
          for (const s of [bounds.min[route.axis] + .5, train.position[route.axis], bounds.max[route.axis] - .5]) {
            up.set(route.axis === 'x' ? s : route.cross, route.railY + .04, route.axis === 'z' ? s : route.cross);
            ray.set(up, down); ray.far = .8;
            expect(ray.intersectObjects(scenery, true).length, `${id} support at ${t}s / ${s}`).toBeGreaterThan(0);
          }
        }
      } finally { world.dispose(); }
    });
  }
});
