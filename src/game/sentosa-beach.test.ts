import * as THREE from 'three';
import { afterAll, expect, it } from 'vitest';
import { SENTOSA_BOUNDS } from './sentosa-scene';
import { SENTOSA_BEACH, sentosaBeachHeight } from './sentosa-beach';
import { createVerticalMovement } from './vertical-movement';
import { createArena } from './arena-rules';
import { createRegionMovement } from './region-collision';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { isWaterObject, primaryWaterSurface } from './water';
import { getRegion } from './regions';
import { createRainReceivers } from './rain-receivers';

const world = getRegion('sentosa').build(); world.scene.updateMatrixWorld(true);
afterAll(() => world.dispose());
const movement = createVerticalMovement({ bounds: SENTOSA_BOUNDS, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });

it('renders exactly the same sand profile used for walking, with no opaque fill above the shelf', () => {
  for (const [x, z] of [[0, 193], [2.7, 198.7], [-80.4, 204.6], [90, 208], [-155, 202], [147, 201], [220, 207]]) {
    const y = sentosaBeachHeight(x, z)!;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
    const solid = ray.intersectObject(world.scene, true).filter(h => !isWaterObject(h.object));
    expect(solid[0]?.object.name, `${x},${z}`).toBe('sentosa-sandy-shelf');
    expect(solid[0]?.point.y).toBeCloseTo(y, 5);
    expect(SENTOSA_BOUNDS.groundHeight(x, z)).toBeCloseTo(y, 5);
  }
});

it('offers 20–60 cm shallows and a continuous walk from dry sand into the shelf and back', () => {
  expect(SENTOSA_BEACH.surface - sentosaBeachHeight(0, 198)!).toBeCloseTo(.2);
  expect(SENTOSA_BEACH.surface - sentosaBeachHeight(0, 207)!).toBeCloseTo(.58);
  for (const x of [-80, 0, 80]) for (const radius of [.38, .65]) {
    let state = { x, y: .33, z: 194, velocityY: 0 };
    for (const direction of [1, -1]) for (let i = 0; i < 52; i++) {
      const target = state.z + direction * .25;
      state = movement.move(state, 0, direction * .25, 1 / 30, radius, 1.8);
      expect(state.z).toBeCloseTo(target, 5);
      // Small downhill drops settle under gravity without entering the ground.
      state = movement.move(state, 0, 0, .2, radius, 1.8);
      expect(state.y).toBeCloseTo(sentosaBeachHeight(x, state.z)!, 4);
    }
    expect(state.z).toBeCloseTo(194);
  }
});

it('keeps deep water and both landing channels blocked while their dry ramp endpoints stay supported', () => {
  for (const x of [-155, 155]) {
    expect(sentosaBeachHeight(x, 202)).toBeLessThan(-2);
    expect(movement.canOccupy(x, 0, 202)).toBe(false);
    expect(movement.supportHeight(x, 193, .5)).toBeCloseTo(.33);
  }
  expect(movement.canOccupy(0, -.6, 209.5)).toBe(false);
});

it('selects and animates Sentosa water for the same Ultra pipeline as Marina', () => {
  const sea = primaryWaterSurface(world.scene)!;
  expect(sea.name).toBe('sentosa-beach-water'); expect(isWaterObject(sea)).toBe(true);
  world.animate(7.5); expect(sea.material.uniforms.uTime.value).toBe(7.5);
  expect(sea.position.y).toBe(SENTOSA_BEACH.surface);
  expect(sea.renderOrder).toBe(1);
});

it('keeps grass and rain ripples off dry sand in the registered district', () => {
  const cover = world.scene.userData.groundCover, rain = createRainReceivers(world.scene);
  for (const z of [193, 198, 204, 207]) {
    expect(cover.sample(0, z).grass).toBe(false);
    expect(cover.sample(0, z).y).toBeCloseTo(sentosaBeachHeight(0, z)!, 4);
  }
  expect(rain.water(0, 193)).toBeNull();
  expect(rain.water(0, 204)).toBeGreaterThan(0);
});

it('lands a jump back on the submerged sand instead of hovering at world zero', () => {
  const y = sentosaBeachHeight(0, 204)!;
  let state = { x: 0, z: 204, y, velocityY: 5.2 };
  for (let i = 0; i < 120; i++) state = movement.move(state, 0, 0, 1 / 60);
  expect(state.y).toBeCloseTo(y); expect(state.velocityY).toBe(0);
});

it('accepts supported wading and prone height below world zero on the shared-game authority', () => {
  const terrain = { bounds: SENTOSA_BOUNDS, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) };
  const arena = createArena(world.obstacles, 0, 'mixed', { bounds: SENTOSA_BOUNDS, move: createRegionMovement(SENTOSA_BOUNDS).move, spawns: [{ x: 0, z: 194 }], playerSpawn: { x: 0, z: 194 } }, undefined, terrain);
  arena.addPlayer('wader', 'Wader', 0, 0, undefined, undefined, true);
  let state = { x: 0, z: 194, y: .33, velocityY: 0 };
  for (let i = 0; i < 160; i++) {
    state = movement.move(state, 0, .08, .025);
    arena.step(.025);
    arena.setInput('wader', { x: state.x, y: state.y + 1.75, z: state.z, yaw: 0, pitch: 0, weapon: 0, playing: true });
  }
  let actor = arena.snapshot().actors[0];
  expect(actor.z).toBeCloseTo(206.8); expect(actor.y).toBeCloseTo(state.y + 1.75);
  arena.setInput('wader', { ...actor, y: state.y + .55, prone: true, playing: true });
  actor = arena.snapshot().actors[0];
  expect(actor.prone).toBe(true); expect(actor.y).toBeCloseTo(state.y + .55);
});
