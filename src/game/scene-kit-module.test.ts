import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSceneKit } from './scene-kit';
import { withSurfaceOwnership } from './surface-ownership';
import { isOnModule } from './block-module';

const options = { background: '#ffffff', fogNear: 10, fogFar: 100 };

describe('scene kit on the block module', () => {
  it('builds unconverted districts exactly as authored', () => {
    const kit = createSceneKit(options), material = kit.mat('#888888');
    const rail = kit.box(0.63, 1.1, 0, 0.035, 0.035, 12, material);
    expect(rail.position.x).toBe(0.63); expect(rail.scale.x).toBe(0.035);
    kit.solid(1.23, 0, 2.77, 1); expect(kit.obstacles[0].minX).toBeCloseTo(1.23 - 2.77 / 2);
    expect(kit.scene.userData.blockModule).toBeUndefined();
  });

  it('snaps boxes and colliders to the detail grid with the thickness floor', () => {
    const kit = createSceneKit({ ...options, module: true }), material = kit.mat('#888888');
    expect(kit.scene.userData.blockModule).toBe(true);
    const rail = kit.box(0.63, 1.1, 0, 0.035, 0.035, 12, material);
    expect(rail.scale.x).toBe(0.1); expect(rail.scale.y).toBe(0.1);
    for (const edge of [rail.position.x - rail.scale.x / 2, rail.position.x + rail.scale.x / 2]) expect(isOnModule(edge)).toBe(true);
    const wall = kit.box(1.23, 2, 0, 2.77, 4, 1, material); kit.solid(1.23, 0, 2.77, 1);
    const o = kit.obstacles[0];
    expect(o.minX).toBeCloseTo(wall.position.x - wall.scale.x / 2, 6); expect(o.maxX).toBeCloseTo(wall.position.x + wall.scale.x / 2, 6);
    const paint = kit.box(0, 0.09, 4, 5, 0.025, 0.16, material);
    expect(paint.scale.y).toBe(0.025); expect(paint.scale.z).toBe(0.2);
    const post = kit.cylinder(0, 1, 0, 0.02, 2, material); expect(post.scale.x).toBe(0.05);
  });

  it('keeps landmarks, bystanders and the car as authored', () => {
    const kit = createSceneKit({ ...options, module: true }), material = kit.mat('#888888');
    const petal = kit.freeform(() => kit.box(0.63, 1.1, 0, 0.035, 0.035, 12, material));
    expect(petal.scale.x).toBe(0.035);
    const person = kit.walker(3.33, 1.11, material, material, material);
    expect(person.position.x).toBe(3.33);
    const legs = person.children.filter(c => c instanceof THREE.Mesh && c.scale.x === 0.16);
    expect(legs).toHaveLength(2);
  });

  it('bakes single-use surface variants into one draw on module districts', () => {
    const kit = createSceneKit({ ...options, module: true }), wall = kit.mat('#888888'), trim = kit.mat('#ccbb99');
    // Ten bodies, each with a flush panel of a different width, so every cut differs.
    for (let i = 0; i < 10; i++) { kit.box(i * 20, 3, 0, 12, 6, 4, wall); kit.box(i * 20, 3, 1.5, 2 + i * .2, 2, 1, trim); }
    const world = withSurfaceOwnership(kit.finish({ car: new THREE.Group(), stamps: [], animate() {} }));
    try {
      const summary = world.scene.userData.surfaceOwnership;
      expect(summary.baked).toBeGreaterThan(0);
      const bodies = world.scene.children.filter(c => c instanceof THREE.Mesh && c.material === wall);
      expect(bodies.length).toBeLessThanOrEqual(2);
    } finally { world.dispose(); }
  });
});
