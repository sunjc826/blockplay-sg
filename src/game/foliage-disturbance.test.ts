import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createSceneKit } from './scene-kit';
import { createGrass, grassWindLean } from './ground-cover';
import { createWorldAtmosphere } from './world-atmosphere';
import { setEnvironmentSettings } from './environment-settings';
import { DEFAULT_ENVIRONMENT } from './world-events';
import { disturbFoliage, foliageField, foliageHitLevel, setFoliageBodies, updateFoliageDisturbance, FOLIAGE_HIT_LIFE, MAX_FOLIAGE_BODIES, MAX_FOLIAGE_HITS } from './foliage-disturbance';

function compiled(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <normal_fragment_begin>' } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

it('fades a hit with distance and age, and never reaches beyond its radius', () => {
  expect(foliageHitLevel(0, 0, 10, 4)).toBe(4);
  expect(foliageHitLevel(0, 3, 10, 4)).toBe(4);
  expect(foliageHitLevel(0, 7, 10, 4)).toBeGreaterThan(0);
  expect(foliageHitLevel(0, 7, 10, 4)).toBeLessThan(4);
  expect(foliageHitLevel(0, 10, 10, 4)).toBe(0);
  expect(foliageHitLevel(1, 0, 10, 4)).toBeLessThan(.5);
  expect(foliageHitLevel(FOLIAGE_HIT_LIFE, 0, 10, 4)).toBe(0);
});

it('merges a burst into one hit, forgets hits that have rung out and gives up the weakest when full', () => {
  const scene = new THREE.Scene(), field = foliageField(scene);
  // A frame is never taken to be longer than a quarter second.
  const advance = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += .1) updateFoliageDisturbance(scene, .1, false); };
  disturbFoliage(scene, { x: 0, y: 5, z: 0 }, 2.6, 1);
  disturbFoliage(scene, { x: .3, y: 5.2, z: 0 }, 2.6, 1.4);
  expect(field.count.value).toBe(1);
  expect(field.times.value[0].y).toBe(1.4);
  expect(field.hits.value[0].x).toBe(.3);
  // Elsewhere, or later, is a second event.
  disturbFoliage(scene, { x: 30, y: 5, z: 0 }, 2.6, 1);
  advance(.2);
  disturbFoliage(scene, { x: .3, y: 5.2, z: 0 }, 2.6, 1);
  expect(field.count.value).toBe(3);
  advance(FOLIAGE_HIT_LIFE - .1);
  expect(field.count.value).toBe(1);
  expect(field.hits.value[0].x).toBe(.3);
  advance(.2);
  expect(field.count.value).toBe(0);

  for (let i = 0; i < MAX_FOLIAGE_HITS; i++) disturbFoliage(scene, { x: i * 40, y: 0, z: 0 }, 3, i === 2 ? .5 : 2);
  expect(field.count.value).toBe(MAX_FOLIAGE_HITS);
  disturbFoliage(scene, { x: 900, y: 0, z: 0 }, 3, .2);
  expect(field.hits.value.some(hit => hit.x === 900)).toBe(false);
  disturbFoliage(scene, { x: 900, y: 0, z: 0 }, 16, 5);
  expect(field.count.value).toBe(MAX_FOLIAGE_HITS);
  expect(field.hits.value[2].x).toBe(900);
  expect(field.hits.value[2].w).toBe(16);
});

it('holds still under reduced effects and caps the bodies it tracks', () => {
  const scene = new THREE.Scene(), field = foliageField(scene);
  setFoliageBodies(scene, Array.from({ length: 7 }, (_, i) => ({ x: i, y: 0, z: 0, radius: 1 })));
  expect(field.bodyCount.value).toBe(MAX_FOLIAGE_BODIES);
  expect(field.bodies.value[3].x).toBe(3);
  disturbFoliage(scene, { x: 0, y: 0, z: 0 }, 8, 4);
  updateFoliageDisturbance(scene, .016, true);
  expect(field.count.value).toBe(0); expect(field.bodyCount.value).toBe(0);
  disturbFoliage(scene, { x: 0, y: 0, z: 0 }, 8, 4);
  setFoliageBodies(scene, [{ x: 0, y: 0, z: 0, radius: 1 }]);
  expect(field.count.value).toBe(0); expect(field.bodyCount.value).toBe(0);
  updateFoliageDisturbance(scene, .016, false);
  disturbFoliage(scene, { x: 0, y: 0, z: 0 }, 8, 4);
  expect(field.count.value).toBe(1);
});

it('gives trees, their shadows and the grass one field, driven by the atmosphere', () => {
  const kit = createSceneKit({ background: '#aaccee', fogNear: 100, fogFar: 500 });
  kit.tree(3, 4, 8, kit.mat('#76523b'), kit.mat('#408040'));
  const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
  const tree = world.scene.children.find((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.geometry.hasAttribute('treeRootHeight'))!;
  const grass = createGrass(world.scene, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, () => 0);
  const camera = new THREE.PerspectiveCamera(), field = foliageField(world.scene);
  setEnvironmentSettings({ weather: 'sunny', reducedEffects: false });
  const air = createWorldAtmosphere(world.scene, [], world.obstacles);
  try {
    const shaders = [tree.material as THREE.Material, tree.customDepthMaterial!, tree.customDistanceMaterial!, grass.mesh.material as THREE.Material, grass.farMesh.material as THREE.Material].map(compiled);
    for (const shader of shaders) {
      expect(shader.uniforms.foliageHits).toBe(field.hits);
      expect(shader.uniforms.foliageHitCount).toBe(field.count);
      expect(shader.uniforms.foliageClock).toBe(field.clock);
      expect(shader.vertexShader).toContain('foliageHitLevel(i,');
    }
    expect(shaders[3].uniforms.foliageBodies).toBe(field.bodies);
    let now = Date.UTC(2026, 10, 19, 4);
    air.update(.1, camera, now += 100);
    disturbFoliage(world.scene, { x: 3, y: 8, z: 4 }, 2.6, 1);
    expect(field.count.value).toBe(1);
    for (let i = 0; i < 40; i++) air.update(.1, camera, now += 100);
    expect(field.count.value).toBe(0);
    setEnvironmentSettings({ reducedEffects: true }); air.update(.1, camera, now += 100);
    disturbFoliage(world.scene, { x: 3, y: 8, z: 4 }, 2.6, 1);
    expect(field.count.value).toBe(0);
  } finally { air.dispose(); grass.dispose(); world.dispose(); setEnvironmentSettings(DEFAULT_ENVIRONMENT); }
});

it('lays grass over further as the weather strengthens, and not at all under reduced effects', () => {
  const scene = new THREE.Scene(), grass = createGrass(scene, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, () => 0);
  const camera = new THREE.PerspectiveCamera(), shader = compiled(grass.mesh.material as THREE.Material);
  try {
    expect(grassWindLean(0)).toBeGreaterThan(0);
    expect(grassWindLean(3)).toBeGreaterThan(grassWindLean(1.5));
    expect(grassWindLean(70)).toBe(grassWindLean(7));
    grass.update(camera, 1, false, false, 'high', 3);
    expect(shader.uniforms.grassWind.value).toBe(grassWindLean(3));
    expect(shader.uniforms.grassTime.value).toBe(1);
    grass.update(camera, 2, true, false, 'high', 3);
    expect(shader.uniforms.grassWind.value).toBe(0);
    expect(shader.uniforms.grassTime.value).toBe(0);
  } finally { grass.dispose(); }
});
