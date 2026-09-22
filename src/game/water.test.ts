import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWaterMaterial, isWaterObject, markWater, MAX_WATER_RIPPLES, rippleWater } from './water';
import { buildMarinaScene, MARINA_BAY } from './marina-scene';
import { buildJurongLakeScene } from './jurong-lake-scene';

const options = { deep: '#1d4750', shallow: '#3d7c84', sky: '#8db6d4', horizon: '#557788', sun: new THREE.Vector3(0, 1, 0) };

describe('water surfaces', () => {
  it('recognises water by its mesh or by its material, instanced or not', () => {
    const plain = new THREE.MeshStandardMaterial(), wet = markWater(new THREE.MeshStandardMaterial());
    const geometry = new THREE.BoxGeometry();
    expect(isWaterObject(new THREE.Mesh(geometry, plain))).toBe(false);
    expect(isWaterObject(new THREE.Mesh(geometry, wet))).toBe(true);
    expect(isWaterObject(new THREE.InstancedMesh(geometry, wet, 4))).toBe(true);
    const tagged = new THREE.Mesh(geometry, plain); tagged.userData.fpsWater = true;
    expect(isWaterObject(tagged)).toBe(true);
    expect(isWaterObject(new THREE.Group())).toBe(false);
  });
  it('drops each shot ripple into the shader at the current time, recycling the oldest', () => {
    const material = createWaterMaterial(options);
    const ripples = material.uniforms.uRipples.value as THREE.Vector4[];
    expect(ripples).toHaveLength(MAX_WATER_RIPPLES);
    material.userData.setTime(12);
    rippleWater(new THREE.Mesh(new THREE.PlaneGeometry(), material), 3, -4, 0.8);
    expect(ripples[0].toArray()).toEqual([3, -4, 12, 0.8]);
    for (let i = 0; i < MAX_WATER_RIPPLES; i++) material.userData.ripple(i, 0, 1);
    expect(ripples[0].x).toBe(MAX_WATER_RIPPLES - 1);
    material.dispose();
  });
  it('ignores a ripple on water that has no shader surface', () => {
    expect(() => rippleWater(new THREE.Mesh(new THREE.BoxGeometry(), markWater(new THREE.MeshStandardMaterial())), 0, 0)).not.toThrow();
  });
});

describe('Marina Bay water', () => {
  it('is a tagged surface standing below the quay over a deeper bed', () => {
    const world = buildMarinaScene();
    try {
      const bay = world.scene.getObjectByName('marina-bay-water') as THREE.Mesh;
      expect(bay).toBeDefined();
      expect(isWaterObject(bay)).toBe(true);
      expect(bay.position.y).toBe(MARINA_BAY.surface);
      expect(MARINA_BAY.surface).toBeLessThan(0);
      expect(MARINA_BAY.bed).toBeLessThan(MARINA_BAY.surface - 2);
      expect(isWaterObject(world.scene.getObjectByName('marina-pond-water')!)).toBe(true);
      // A downward ray into the middle of the bay meets water first, not a floor.
      world.scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, -20), new THREE.Vector3(0, -1, 0));
      const [first] = ray.intersectObjects(world.scene.children, true);
      expect(isWaterObject(first.object)).toBe(true);
      expect(first.point.y).toBeCloseTo(MARINA_BAY.surface, 5);
    } finally { world.dispose(); }
  });
});

describe('district water', () => {
  it('stays recognisable after static batching', () => {
    const world = buildJurongLakeScene();
    try {
      let found = 0;
      world.scene.traverse(object => { if (isWaterObject(object)) found++; });
      expect(found).toBeGreaterThan(0);
    } finally { world.dispose(); }
  });
});
