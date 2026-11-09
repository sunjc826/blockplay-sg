import * as THREE from 'three';
import { afterEach, expect, it } from 'vitest';
import { createSceneKit } from './scene-kit';
import { createWorldAtmosphere } from './world-atmosphere';
import { setEnvironmentSettings } from './environment-settings';
import { DEFAULT_ENVIRONMENT } from './world-events';
import { createThermalMaterials } from './fps-vision';
import { getRegion } from './regions';

function compiled(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}
function fixture() {
  const kit = createSceneKit({ background: '#aaccee', fogNear: 100, fogFar: 500 });
  const wood = kit.mat('#76523b'), leaf = kit.mat('#408040');
  kit.tree(3, 4, 8, wood, leaf); kit.tree(-15, 4, 10, wood, leaf);
  const bench = kit.box(20, 1, 0, 4, 1, 2, wood);
  const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
  const trees = world.scene.children.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.geometry.hasAttribute('treeRootHeight'));
  return { world, trees, bench };
}
afterEach(() => setEnvironmentSettings(DEFAULT_ENVIRONMENT));

it('keeps foliage and trunks batched, furniture rigid, and colour/depth/thermal motion in sync', () => {
  const { world, trees, bench } = fixture(), thermal = createThermalMaterials();
  try {
    expect(trees.map(t => t.count).sort()).toEqual([2, 6]);
    const trunk = trees.find(t => t.count === 2)!;
    expect(Array.from(trunk.geometry.getAttribute('treeRootHeight').array)).toEqual([3, 0, 4, 8, -15, 0, 4, 10]);
    const shader = compiled(trunk.material as THREE.Material);
    expect(compiled(bench.material as THREE.Material).uniforms.treeTime).toBeUndefined();
    for (const material of [trunk.customDepthMaterial!, trunk.customDistanceMaterial!]) {
      expect(compiled(material).uniforms.treeTime).toBe(shader.uniforms.treeTime);
    }
    thermal.apply(world.scene);
    expect(compiled(trunk.material as THREE.Material).uniforms.treeTime).toBe(shader.uniforms.treeTime);
    world.animate(12.5); expect(shader.uniforms.treeTime.value).toBe(12.5);
    thermal.restore(); expect(compiled(trunk.material as THREE.Material).uniforms.treeTime).toBe(shader.uniforms.treeTime);
  } finally { thermal.dispose(); world.dispose(); }
});

it('eases from a breeze to rain and stronger storms, and suppresses flutter in reduced effects', () => {
  const { world, trees } = fixture(), camera = new THREE.PerspectiveCamera();
  const shader = compiled(trees[0].material as THREE.Material);
  setEnvironmentSettings({ weather: 'sunny', reducedEffects: false });
  const air = createWorldAtmosphere(world.scene, [], world.obstacles);
  try {
    let now = Date.UTC(2026, 10, 9, 4);
    const step = () => { now += 100; air.update(.1, camera, now); };
    step(); const calm = shader.uniforms.treeStrength.value;
    setEnvironmentSettings({ weather: 'showers' }); step();
    const first = shader.uniforms.treeStrength.value;
    for (let i = 0; i < 150; i++) step();
    const rain = shader.uniforms.treeStrength.value;
    expect(first).toBeGreaterThan(calm); expect(first).toBeLessThan(rain);
    setEnvironmentSettings({ weather: 'thunderstorm' });
    for (let i = 0; i < 150; i++) step();
    const storm = shader.uniforms.treeStrength.value;
    expect(rain).toBeGreaterThan(calm * 2); expect(storm).toBeGreaterThan(rain * 1.5);
    setEnvironmentSettings({ reducedEffects: true }); step();
    expect(shader.uniforms.treeStrength.value).toBeLessThan(calm);
    expect(shader.uniforms.treeRustle.value).toBe(0);
  } finally { air.dispose(); world.dispose(); }
});

it.each(['marina-bay', 'queenstown', 'raffles-place', 'sentosa', 'changi', 'kampong-glam'] as const)('retains valid wind data through the full %s build and surface ownership pass', district => {
  const world = getRegion(district).build();
  try {
    let count = 0;
    world.scene.traverse(object => {
      if (!(object instanceof THREE.InstancedMesh) || !object.geometry.hasAttribute('treeRootHeight')) return;
      count += object.count;
      expect(object.geometry.getAttribute('treeRootHeight').count).toBe(object.count);
      expect(object.geometry.getAttribute('treeFlutter').count).toBe(object.count);
      expect(object.customDepthMaterial).toBeDefined();
      expect(compiled(object.material as THREE.Material).uniforms.treeTime).toBeDefined();
    });
    expect(count).toBeGreaterThan(10);
  } finally { world.dispose(); }
});
