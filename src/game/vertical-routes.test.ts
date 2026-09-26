import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REGIONS } from './regions';
import { zoneSectors } from './zone-sectors';
import { createVerticalMovement, MAX_STEP_HEIGHT } from './vertical-movement';
import { getVerticalRoutes, getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

// Exercise the shipped geometry, not a parallel list of idealised test ramps.
// Both the FPS capsule and the wider exploration walker must get up and down.
for (const region of REGIONS) describe(`${region.id} authored elevation`, () => {
  it('supports both walking modes along every route in both directions', () => {
    const world = region.build();
    try {
      const routes = getVerticalRoutes(world.scene);
      const movement = createVerticalMovement({ bounds: region.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
      for (const sector of zoneSectors(region.id)) for (const anchor of [...sector.anchors, ...(sector.foodAnchors ?? [])]) {
        expect(movement.canOccupy(anchor.x, 0, anchor.z, .4, 1.8), `${sector.id} ground anchor ${anchor.x},${anchor.z}`).toBe(true);
      }
      for (const route of routes) for (const radius of [.38, .65]) for (const points of [route.points, [...route.points].reverse()]) {
        let state = { ...points[0], velocityY: 0 };
        expect(movement.canOccupy(state.x, state.y, state.z, radius), `${route.id} entrance`).toBe(true);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .2);
          for (let n = 1; n <= steps; n++) {
            state = movement.move(state, (b.x-a.x)/steps, (b.z-a.z)/steps, .05, radius);
            const label = `${route.id}, radius ${radius}, segment ${i}, step ${n}`;
            expect(Math.hypot(state.x - (a.x+(b.x-a.x)*n/steps), state.z-(a.z+(b.z-a.z)*n/steps)), label).toBeLessThan(.015);
            expect(Math.abs(state.y-(a.y+(b.y-a.y)*n/steps)), label).toBeLessThan(MAX_STEP_HEIGHT+.015);
          }
        }
        expect(state.y, route.id).toBeLessThan(.02);
      }
    } finally { world.dispose(); }
  });
  it('renders a supporting top face at every authored segment midpoint', () => {
    const world = region.build();
    try {
      world.scene.updateMatrixWorld(true);
      const group = world.scene.getObjectByName('Walkable elevated routes')!;
      for (const s of getWalkSurfaces(world.scene)) {
        const x=(s.minX+s.maxX)/2,z=(s.minZ+s.maxZ)/2,y=(s.startHeight+s.endHeight)/2;
        const ray = new THREE.Raycaster(new THREE.Vector3(x,y+.1,z),new THREE.Vector3(0,-1,0),0,.2);
        const hit = ray.intersectObject(group,true)[0];
        expect(hit, s.id).toBeDefined();
        expect(hit.point.y, s.id).toBeCloseTo(y,3);
      }
    } finally { world.dispose(); }
  });
});
