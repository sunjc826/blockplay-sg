import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TDM_AREAS } from './arena-match';
import { BOUNDARY_SIDES, boundaryFrame } from './district-boundaries';
import { buildHardpointWorld } from './hardpoint-world';
import { createSceneCover } from './scene-cover';
import { buildTeamDeathmatchWorld } from './team-deathmatch-world';

describe.each([
  { name: 'Hardpoint', build: buildHardpointWorld },
  ...TDM_AREAS.map(area => ({ name: area.name, build: () => buildTeamDeathmatchWorld(area.id) })),
])('$name perimeter', ({ build }) => {
  it('places solid, depth-tested barricades just beyond each movement limit', () => {
    const world = build();
    const barricades = world.scene.getObjectByName('Team combat barricades')!;
    try {
      expect(barricades).toBeDefined();
      expect(world.scene.getObjectByName('Team combat perimeter')).toBeUndefined();
      barricades.traverse(object => {
        if (object instanceof THREE.Mesh) {
          expect(object.material.depthTest).toBe(true);
          expect(object.material.transparent).toBe(false);
        }
      });
      // Isolate the perimeter to exercise the same cover trace used by arena combat.
      const scene = new THREE.Scene();
      scene.add(barricades);
      const cover = createSceneCover(scene);
      for (const side of BOUNDARY_SIDES) {
        const { axis, direction, fixed, min, max } = boundaryFrame(world.bounds, side);
        const heading = { x: axis === 'x' ? direction : 0, y: 0, z: axis === 'z' ? direction : 0 };
        for (let along = min + .25; along < max; along += .5) {
          const start = { x: axis === 'x' ? fixed - direction : along, y: 1.7, z: axis === 'z' ? fixed - direction : along };
          const distance = cover.distance(start, heading, 2);
          expect(distance).toBeGreaterThanOrEqual(1);
          expect(distance).toBeLessThan(1.25);
        }
        const mid = (min + max) / 2;
        const start = { x: axis === 'x' ? fixed - direction : mid, z: axis === 'z' ? fixed - direction : mid };
        const end = world.move(start, heading.x * 2, heading.z * 2, .4, []);
        expect(end[axis]).toBeCloseTo(fixed - direction * .6);
      }
    } finally {
      world.dispose();
    }
    expect(barricades.parent).toBeNull();
  });
});
